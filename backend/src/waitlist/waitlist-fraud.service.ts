import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  TooManyRequestsException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../cache/redis.module';
import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { WaitlistFraudLog, FraudAction } from './entities/waitlist-fraud-log.entity';
import { JoinWaitlistDto } from './dto/join-waitlist.dto';
import { DISPOSABLE_DOMAINS } from '../config/disposable-domains';

export class WaitlistFraudException extends Error {
  constructor(
    public readonly reason: string,
    public readonly statusCode: number = 400,
    public readonly action: FraudAction = FraudAction.BLOCKED,
  ) {
    super(reason);
  }
}

@Injectable()
export class WaitlistFraudService {
  private readonly logger = new Logger(WaitlistFraudService.name);

  constructor(
    @InjectRepository(WaitlistEntry)
    private readonly waitlistRepo: Repository<WaitlistEntry>,
    @InjectRepository(WaitlistFraudLog)
    private readonly fraudLogRepo: Repository<WaitlistFraudLog>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  async check(dto: JoinWaitlistDto, ip: string, fingerprint?: string): Promise<void> {
    await Promise.all([
      this.checkIpRateLimit(dto, ip),
      this.checkDisposableEmail(dto, ip),
      this.checkEmailDomainVelocity(dto, ip),
      this.checkReferralSelfAbuse(dto, ip),
      this.checkBotDetection(dto, ip, fingerprint),
      this.checkDuplicateEmail(dto, ip),
    ]);
  }

  private async checkIpRateLimit(dto: JoinWaitlistDto, ip: string): Promise<void> {
    const key = `waitlist:ip:${ip}`;
    const count = await this.redis.incr(key);
    
    if (count === 1) {
      await this.redis.expire(key, 86400); // 24h TTL
    }

    if (count > 3) {
      await this.logFraud(dto, ip, 'IP_RATE_LIMIT', FraudAction.BLOCKED, { count });
      throw new WaitlistFraudException('Too many signups from this IP address', 429, FraudAction.BLOCKED);
    }
  }

  private async checkDisposableEmail(dto: JoinWaitlistDto, ip: string): Promise<void> {
    const domain = dto.email.split('@')[1]?.toLowerCase();
    
    if (domain && DISPOSABLE_DOMAINS.includes(domain)) {
      await this.logFraud(dto, ip, 'DISPOSABLE_EMAIL', FraudAction.BLOCKED, { domain });
      throw new WaitlistFraudException('Disposable email addresses are not allowed', 400, FraudAction.BLOCKED);
    }
  }

  private async checkEmailDomainVelocity(dto: JoinWaitlistDto, ip: string): Promise<void> {
    const domain = dto.email.split('@')[1]?.toLowerCase();
    if (!domain) return;

    const key = `waitlist:domain:${domain}:${new Date().toISOString().split('T')[0]}`;
    const count = await this.redis.incr(key);
    
    if (count === 1) {
      await this.redis.expire(key, 86400);
    }

    if (count > 20) {
      await this.logFraud(dto, ip, 'EMAIL_DOMAIN_VELOCITY', FraudAction.FLAGGED, { domain, count });
      // Flag but allow - don't throw exception
    }
  }

  private async checkReferralSelfAbuse(dto: JoinWaitlistDto, ip: string): Promise<void> {
    if (!dto.referredByCode) return;

    const referrer = await this.waitlistRepo.findOne({ 
      where: { referralCode: dto.referredByCode } 
    });

    if (referrer && referrer.ipAddress === ip) {
      await this.logFraud(dto, ip, 'REFERRAL_SELF_ABUSE', FraudAction.FLAGGED, { 
        referrerEmail: referrer.email,
        referrerIp: referrer.ipAddress 
      });
      // Flag but allow - points will be handled in the main service
    }
  }

  private async checkBotDetection(dto: JoinWaitlistDto, ip: string, fingerprint?: string): Promise<void> {
    const details: Record<string, any> = {};

    // Check for known bot user agents (this would need to be passed from the controller)
    // For now, we'll flag suspicious patterns
    
    if (!fingerprint) {
      details.noFingerprint = true;
    }

    // Honeypot timing check - this would need timing data from the frontend
    // For now, we'll just log if no fingerprint is present
    
    if (Object.keys(details).length > 0) {
      await this.logFraud(dto, ip, 'BOT_DETECTION', FraudAction.FLAGGED, details);
      // Flag but allow for now
    }
  }

  private async checkDuplicateEmail(dto: JoinWaitlistDto, ip: string): Promise<void> {
    const existing = await this.waitlistRepo.findOne({ where: { email: dto.email } });
    
    if (existing) {
      const rank = await this.waitlistRepo
        .createQueryBuilder('w')
        .where('w.points > :points', { points: existing.points })
        .getCount() + 1;

      await this.logFraud(dto, ip, 'DUPLICATE_EMAIL', FraudAction.BLOCKED, { 
        existingId: existing.id,
        rank 
      });
      
      throw new WaitlistFraudException(
        `You are already on the waitlist at position #${rank}`, 
        409, 
        FraudAction.BLOCKED
      );
    }
  }

  private async logFraud(
    dto: JoinWaitlistDto, 
    ip: string, 
    rule: string, 
    action: FraudAction, 
    details: Record<string, any>
  ): Promise<void> {
    try {
      const log = this.fraudLogRepo.create({
        email: dto.email,
        ip,
        rule,
        action,
        details,
      });
      await this.fraudLogRepo.save(log);
    } catch (error) {
      this.logger.error(`Failed to log fraud detection: ${error.message}`);
    }
  }

  async getFraudLogs(page: number = 1, limit: number = 20, rule?: string, action?: FraudAction): Promise<{
    data: WaitlistFraudLog[];
    total: number;
  }> {
    const queryBuilder = this.fraudLogRepo.createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (rule) {
      queryBuilder.andWhere('log.rule = :rule', { rule });
    }

    if (action) {
      queryBuilder.andWhere('log.action = :action', { action });
    }

    const [data, total] = await queryBuilder.getManyAndCount();
    return { data, total };
  }

  async resetIpRateLimit(ip: string): Promise<void> {
    const key = `waitlist:ip:${ip}`;
    await this.redis.unlink(key);
    
    // Log the reset action
    try {
      const log = this.fraudLogRepo.create({
        email: 'system@reset',
        ip,
        rule: 'IP_RATE_LIMIT_RESET',
        action: FraudAction.ALLOWED,
        details: { resetBy: 'admin' },
      });
      await this.fraudLogRepo.save(log);
    } catch (error) {
      this.logger.error(`Failed to log IP reset: ${error.message}`);
    }
  }
}
