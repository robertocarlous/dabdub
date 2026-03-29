import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../cache/redis.module';
import { CacheService } from '../cache/cache.service';
import { User } from '../users/entities/user.entity';
import { Transaction, TransactionStatus } from '../transactions/entities/transaction.entity';
import { Referral, ReferralStatus } from './entities/referral.entity';
import {
  FunnelStatsDto,
  TopReferrersDto,
  CohortComparisonDto,
  RewardSpendDto,
  UserReferralStatsDto,
} from './dto/referral-analytics.dto';

const FUNNEL_KEY = 'analytics:referral:funnel';
const TOP_REFERRERS_KEY = 'analytics:referral:topReferrers';
const COHORT_KEY = 'analytics:referral:cohort';
const REWARD_SPEND_KEY = 'analytics:referral:rewardSpend';
const ANALYTICS_TTL = 3600;

@Injectable()
export class ReferralAnalyticsService {
  private readonly logger = new Logger(ReferralAnalyticsService.name);

  constructor(
    @InjectRepository(Referral)
    private readonly referralRepo: Repository<Referral>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Transaction)
    private readonly txRepo: Repository<Transaction>,
    private readonly cacheService: CacheService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ── Click tracking (Redis INCR, no DB write) ──────────────────

  async incrementClick(code: string): Promise<number> {
    const key = `invite:clicks:${code}`;
    const count = await this.redis.incr(key);
    await this.redis.expire(key, 86400);
    return count;
  }

  private async sumAllClicks(): Promise<number> {
    let cursor = '0';
    let total = 0;
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', 'invite:clicks:*', 'COUNT', 100);
      cursor = next;
      if (keys.length) {
        const values = await this.redis.mget(...keys);
        for (const v of values) total += parseInt(v ?? '0', 10);
      }
    } while (cursor !== '0');
    return total;
  }

  // ── Funnel stats ──────────────────────────────────────────────

  async getFunnelStats(): Promise<FunnelStatsDto> {
    const cached = await this.cacheService.get<FunnelStatsDto>(FUNNEL_KEY);
    if (cached) return cached;
    return this.computeFunnelStats();
  }

  private async computeFunnelStats(): Promise<FunnelStatsDto> {
    const totalReferralLinks = await this.userRepo
      .createQueryBuilder('u')
      .where('u.referralCode IS NOT NULL')
      .getCount();

    const clicked = await this.sumAllClicks();

    const [signedUp, converted, rewarded] = await Promise.all([
      this.referralRepo.count(),
      this.referralRepo
        .createQueryBuilder('r')
        .where('r.status IN (:...statuses)', {
          statuses: [ReferralStatus.CONVERTED, ReferralStatus.REWARDED],
        })
        .getCount(),
      this.referralRepo.count({ where: { status: ReferralStatus.REWARDED } }),
    ]);

    const conversionRate = signedUp > 0 ? parseFloat(((converted / signedUp) * 100).toFixed(2)) : 0;
    const avgDaysToConvert = await this.getAvgDaysToConvert();

    const stats: FunnelStatsDto = {
      totalReferralLinks,
      clicked,
      signedUp,
      converted,
      rewarded,
      conversionRate,
      avgDaysToConvert: parseFloat(avgDaysToConvert.toFixed(2)),
    };

    await this.cacheService.set(FUNNEL_KEY, stats, ANALYTICS_TTL);
    return stats;
  }

  private async getAvgDaysToConvert(): Promise<number> {
    const result = await this.referralRepo
      .createQueryBuilder('r')
      .select('AVG(EXTRACT(EPOCH FROM (r.convertedAt - r.createdAt)) / 86400)', 'avg')
      .where('r.convertedAt IS NOT NULL')
      .andWhere('r.status IN (:...statuses)', {
        statuses: [ReferralStatus.CONVERTED, ReferralStatus.REWARDED],
      })
      .getRawOne();
    return parseFloat(result?.avg ?? '0');
  }

  // ── Top referrers ─────────────────────────────────────────────

  async getTopReferrers(limit = 10): Promise<TopReferrersDto> {
    const cacheKey = `${TOP_REFERRERS_KEY}:${limit}`;
    const cached = await this.cacheService.get<TopReferrersDto>(cacheKey);
    if (cached) return cached;
    return this.computeTopReferrers(limit);
  }

  private async computeTopReferrers(limit: number): Promise<TopReferrersDto> {
    const rows = await this.referralRepo
      .createQueryBuilder('r')
      .innerJoin(User, 'u', 'u.id = r.referrerId')
      .select('u.username', 'username')
      .addSelect('COUNT(r.id)', 'totalReferred')
      .addSelect(
        `SUM(CASE WHEN r.status IN ('${ReferralStatus.CONVERTED}','${ReferralStatus.REWARDED}') THEN 1 ELSE 0 END)`,
        'totalConverted',
      )
      .addSelect('SUM(CAST(r.rewardAmountUsdc AS numeric))', 'totalEarnedUsdc')
      .groupBy('u.id, u.username')
      .orderBy('"totalConverted"', 'DESC')
      .limit(limit)
      .getRawMany();

    const referrers = rows.map((row: any) => ({
      username: row.username,
      totalReferred: parseInt(row.totalReferred, 10),
      totalConverted: parseInt(row.totalConverted, 10),
      totalEarnedUsdc: parseFloat(row.totalEarnedUsdc ?? '0').toFixed(2),
    }));

    const dto: TopReferrersDto = { referrers };
    await this.cacheService.set(`${TOP_REFERRERS_KEY}:${limit}`, dto, ANALYTICS_TTL);
    return dto;
  }

  // ── Cohort comparison ─────────────────────────────────────────

  async getCohortComparison(): Promise<CohortComparisonDto> {
    const cached = await this.cacheService.get<CohortComparisonDto>(COHORT_KEY);
    if (cached) return cached;
    return this.computeCohortComparison();
  }

  private async computeCohortComparison(): Promise<CohortComparisonDto> {
    const d7Window = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const d30Window = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const referredRows = await this.referralRepo
      .createQueryBuilder('r')
      .select('r.referredUserId', 'userId')
      .where('r.status IN (:...statuses)', {
        statuses: [ReferralStatus.CONVERTED, ReferralStatus.REWARDED],
      })
      .getRawMany();

    const referredIds: string[] = referredRows.map((r: any) => r.userId);

    const empty = { referred: 0, organic: 0, referredPercent: 0, organicPercent: 0 };
    if (referredIds.length === 0) {
      const dto: CohortComparisonDto = {
        d7Retention: empty,
        avgFirstTxAmount: empty,
        d30TxVolume: empty,
        churnRate: empty,
      };
      await this.cacheService.set(COHORT_KEY, dto, ANALYTICS_TTL);
      return dto;
    }

    const totalReferred = referredIds.length;
    const totalOrganic = await this.userRepo
      .createQueryBuilder('u')
      .where('u.id NOT IN (:...ids)', { ids: referredIds })
      .getCount();

    // D7 retention
    const [referredD7, organicD7] = await Promise.all([
      this.txRepo
        .createQueryBuilder('tx')
        .select('COUNT(DISTINCT tx.userId)', 'cnt')
        .where('tx.userId IN (:...ids)', { ids: referredIds })
        .andWhere('tx.createdAt >= :d7', { d7: d7Window })
        .andWhere('tx.status = :s', { s: TransactionStatus.COMPLETED })
        .getRawOne(),
      this.txRepo
        .createQueryBuilder('tx')
        .select('COUNT(DISTINCT tx.userId)', 'cnt')
        .where('tx.userId NOT IN (:...ids)', { ids: referredIds })
        .andWhere('tx.createdAt >= :d7', { d7: d7Window })
        .andWhere('tx.status = :s', { s: TransactionStatus.COMPLETED })
        .getRawOne(),
    ]);

    const refD7Count = parseInt(referredD7?.cnt ?? '0', 10);
    const orgD7Count = parseInt(organicD7?.cnt ?? '0', 10);
    const refD7Rate = totalReferred > 0 ? parseFloat(((refD7Count / totalReferred) * 100).toFixed(1)) : 0;
    const orgD7Rate = totalOrganic > 0 ? parseFloat(((orgD7Count / totalOrganic) * 100).toFixed(1)) : 0;
    const maxD7 = Math.max(refD7Rate, orgD7Rate, 1);

    // Avg first tx amount
    const [refFirstTx, orgFirstTx] = await Promise.all([
      this.txRepo
        .createQueryBuilder('tx')
        .select('AVG(sub.amount)', 'avg')
        .from((qb) =>
          qb
            .select('DISTINCT ON (t.user_id) t.amount_usdc::numeric', 'amount')
            .from('transactions', 't')
            .where('t.user_id IN (:...ids)', { ids: referredIds })
            .andWhere('t.status = :s', { s: TransactionStatus.COMPLETED })
            .orderBy('t.user_id')
            .addOrderBy('t.created_at', 'ASC'),
          'sub',
        )
        .getRawOne(),
      this.txRepo
        .createQueryBuilder('tx')
        .select('AVG(sub.amount)', 'avg')
        .from((qb) =>
          qb
            .select('DISTINCT ON (t.user_id) t.amount_usdc::numeric', 'amount')
            .from('transactions', 't')
            .where('t.user_id NOT IN (:...ids)', { ids: referredIds })
            .andWhere('t.status = :s', { s: TransactionStatus.COMPLETED })
            .orderBy('t.user_id')
            .addOrderBy('t.created_at', 'ASC'),
          'sub',
        )
        .getRawOne(),
    ]);

    const refAvgFirst = parseFloat(refFirstTx?.avg ?? '0');
    const orgAvgFirst = parseFloat(orgFirstTx?.avg ?? '0');
    const maxFirst = Math.max(refAvgFirst, orgAvgFirst, 1);

    // 30-day tx volume
    const [refVol, orgVol] = await Promise.all([
      this.txRepo
        .createQueryBuilder('tx')
        .select('SUM(tx.amountUsdc::numeric)', 'sum')
        .where('tx.userId IN (:...ids)', { ids: referredIds })
        .andWhere('tx.createdAt >= :d30', { d30: d30Window })
        .andWhere('tx.status = :s', { s: TransactionStatus.COMPLETED })
        .getRawOne(),
      this.txRepo
        .createQueryBuilder('tx')
        .select('SUM(tx.amountUsdc::numeric)', 'sum')
        .where('tx.userId NOT IN (:...ids)', { ids: referredIds })
        .andWhere('tx.createdAt >= :d30', { d30: d30Window })
        .andWhere('tx.status = :s', { s: TransactionStatus.COMPLETED })
        .getRawOne(),
    ]);

    const refVolAmt = parseFloat(refVol?.sum ?? '0');
    const orgVolAmt = parseFloat(orgVol?.sum ?? '0');
    const maxVol = Math.max(refVolAmt, orgVolAmt, 1);

    // Churn: users with no completed tx in last 30 days
    const [refChurned, orgChurned] = await Promise.all([
      this.userRepo
        .createQueryBuilder('u')
        .where('u.id IN (:...ids)', { ids: referredIds })
        .andWhere(
          `u.id NOT IN (
            SELECT DISTINCT tx.user_id FROM transactions tx
            WHERE tx.created_at >= :d30 AND tx.status = :s
          )`,
          { d30: d30Window, s: TransactionStatus.COMPLETED },
        )
        .getCount(),
      this.userRepo
        .createQueryBuilder('u')
        .where('u.id NOT IN (:...ids)', { ids: referredIds })
        .andWhere(
          `u.id NOT IN (
            SELECT DISTINCT tx.user_id FROM transactions tx
            WHERE tx.created_at >= :d30 AND tx.status = :s
          )`,
          { d30: d30Window, s: TransactionStatus.COMPLETED },
        )
        .getCount(),
    ]);

    const refChurnRate = totalReferred > 0 ? parseFloat(((refChurned / totalReferred) * 100).toFixed(1)) : 0;
    const orgChurnRate = totalOrganic > 0 ? parseFloat(((orgChurned / totalOrganic) * 100).toFixed(1)) : 0;
    const maxChurn = Math.max(refChurnRate, orgChurnRate, 1);

    const dto: CohortComparisonDto = {
      d7Retention: {
        referred: refD7Rate,
        organic: orgD7Rate,
        referredPercent: Math.round((refD7Rate / maxD7) * 100),
        organicPercent: Math.round((orgD7Rate / maxD7) * 100),
      },
      avgFirstTxAmount: {
        referred: parseFloat(refAvgFirst.toFixed(2)),
        organic: parseFloat(orgAvgFirst.toFixed(2)),
        referredPercent: Math.round((refAvgFirst / maxFirst) * 100),
        organicPercent: Math.round((orgAvgFirst / maxFirst) * 100),
      },
      d30TxVolume: {
        referred: parseFloat(refVolAmt.toFixed(2)),
        organic: parseFloat(orgVolAmt.toFixed(2)),
        referredPercent: Math.round((refVolAmt / maxVol) * 100),
        organicPercent: Math.round((orgVolAmt / maxVol) * 100),
      },
      churnRate: {
        referred: refChurnRate,
        organic: orgChurnRate,
        referredPercent: Math.round((refChurnRate / maxChurn) * 100),
        organicPercent: Math.round((orgChurnRate / maxChurn) * 100),
      },
    };

    await this.cacheService.set(COHORT_KEY, dto, ANALYTICS_TTL);
    return dto;
  }

  // ── Reward spend ──────────────────────────────────────────────

  async getRewardSpend(): Promise<RewardSpendDto> {
    const cached = await this.cacheService.get<RewardSpendDto>(REWARD_SPEND_KEY);
    if (cached) return cached;
    return this.computeRewardSpend();
  }

  private async computeRewardSpend(): Promise<RewardSpendDto> {
    const now = Date.now();
    const weeklySpend: Array<{ week: string; amount: string }> = [];

    for (let i = 7; i >= 0; i--) {
      const weekStart = new Date(now - (i + 1) * 7 * 24 * 60 * 60 * 1000);
      const weekEnd = new Date(now - i * 7 * 24 * 60 * 60 * 1000);
      const row = await this.referralRepo
        .createQueryBuilder('r')
        .select('SUM(r.rewardAmountUsdc::numeric)', 'sum')
        .where('r.status = :status', { status: ReferralStatus.REWARDED })
        .andWhere('r.rewardedAt >= :start AND r.rewardedAt < :end', {
          start: weekStart,
          end: weekEnd,
        })
        .getRawOne();
      weeklySpend.push({
        week: weekStart.toISOString().split('T')[0],
        amount: parseFloat(row?.sum ?? '0').toFixed(2),
      });
    }

    // Project monthly from average of last 4 weeks * 4
    const last4Avg =
      weeklySpend.slice(-4).reduce((s, w) => s + parseFloat(w.amount), 0) / 4;
    const projectedMonthly = (last4Avg * 4).toFixed(2);

    const dto: RewardSpendDto = { weeklySpend, projectedMonthly };
    await this.cacheService.set(REWARD_SPEND_KEY, dto, ANALYTICS_TTL);
    return dto;
  }

  // ── Per-user referral stats ───────────────────────────────────

  async getUserReferralStats(userId: string): Promise<UserReferralStatsDto> {
    const rows = await this.referralRepo
      .createQueryBuilder('r')
      .leftJoin(User, 'u', 'u.id = r.referredUserId')
      .select('r.id', 'id')
      .addSelect('r.status', 'status')
      .addSelect('r.convertedAt', 'convertedAt')
      .addSelect('r.rewardedAt', 'rewardedAt')
      .addSelect('r.createdAt', 'createdAt')
      .addSelect('u.username', 'referredUsername')
      .where('r.referrerId = :userId', { userId })
      .orderBy('r.createdAt', 'DESC')
      .getRawMany();

    return {
      referrals: rows.map((r: any) => ({
        id: r.id,
        referredUsername: r.referredUsername ?? 'unknown',
        status: r.status,
        convertedAt: r.convertedAt ?? null,
        rewardedAt: r.rewardedAt ?? null,
      })),
    };
  }

  // ── Daily pre-compute (called by BullMQ job) ──────────────────

  async computeAllAnalytics(): Promise<void> {
    await Promise.all([
      this.computeFunnelStats(),
      this.computeTopReferrers(10),
      this.computeCohortComparison(),
      this.computeRewardSpend(),
    ]);
    this.logger.log('Referral analytics pre-computed and cached');
  }
}
