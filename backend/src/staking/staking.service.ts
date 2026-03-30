import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StakingEntry, StakingAction } from './entities/staking-entry.entity';
import { User } from '../users/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { TierService } from '../tier-config/tier.service';
import { SorobanService } from '../soroban/soroban.service';
import { StakingBalanceDto, StakingHistoryDto } from './dto/staking.dto';

@Injectable()
export class StakingService {
  private readonly logger = new Logger(StakingService.name);

  constructor(
    @InjectRepository(StakingEntry)
    private readonly stakingRepo: Repository<StakingEntry>,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,

    private readonly tierService: TierService,
    private readonly sorobanService: SorobanService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Stake USDC amount. Enforces tier-based minimum stake and calls Soroban contract.
   */
  async stake(userId: string, amount: string): Promise<StakingEntry> {
    this.validateAmount(amount);

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const wallet = await this.walletRepo.findOne({ where: { userId } });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Get tier config
    const tierConfig = await this.tierService.getUserTierLimits(userId);
    const minStakeAmount = parseFloat(tierConfig.minStakeAmountUsdc);
    const amountNum = parseFloat(amount);

    // Validate minimum stake amount
    if (amountNum < minStakeAmount) {
      throw new BadRequestException(
        `Minimum stake amount for ${user.tier} tier is ${minStakeAmount} USDC`,
      );
    }

    // Check if user has sufficient balance
    const balanceNum = parseFloat(wallet.balance || '0');
    if (amountNum > balanceNum) {
      throw new BadRequestException(
        `Insufficient balance. Available: ${wallet.balance} USDC`,
      );
    }

    const balanceBefore = wallet.balance || '0';

    try {
      // Call Soroban contract to stake
      const txHash = await this.sorobanService.stake(user.username, amount);

      // Update wallet balances
      const newBalance = (balanceNum - amountNum).toString();
      const newStakedBalance = (parseFloat(wallet.stakedBalance || '0') + amountNum).toString();

      wallet.balance = newBalance;
      wallet.stakedBalance = newStakedBalance;
      await this.walletRepo.save(wallet);

      // Record staking entry
      const entry = await this.stakingRepo.save(
        this.stakingRepo.create({
          userId,
          action: StakingAction.STAKE,
          amountUsdc: amount,
          balanceBeforeUsdc: balanceBefore,
          balanceAfterUsdc: newStakedBalance,
          txHash,
        }),
      );

      // Emit WebSocket event for balance update
      this.eventEmitter.emit('balance_updated', {
        userId,
        balance: newBalance,
        stakedBalance: newStakedBalance,
      });

      this.logger.log(`User ${userId} staked ${amount} USDC. txHash=${txHash}`);
      return entry;
    } catch (err) {
      this.logger.error(
        `Staking failed for user ${userId}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * Unstake USDC amount. Checks lockup period from tier config.
   */
  async unstake(userId: string, amount: string): Promise<StakingEntry> {
    this.validateAmount(amount);

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const wallet = await this.walletRepo.findOne({ where: { userId } });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const amountNum = parseFloat(amount);
    const stakedBalance = parseFloat(wallet.stakedBalance || '0');

    // Validate sufficient staked balance
    if (amountNum > stakedBalance) {
      throw new BadRequestException(
        `Insufficient staked balance. Available: ${wallet.stakedBalance} USDC`,
      );
    }

    // Check lockup period
    const tierConfig = await this.tierService.getUserTierLimits(userId);
    const lockupDays = tierConfig.stakeLockupDays;

    if (lockupDays > 0) {
      const lastStakeEntry = await this.stakingRepo.findOne({
        where: {
          userId,
          action: StakingAction.STAKE,
        },
        order: { createdAt: 'DESC' },
      });

      if (lastStakeEntry) {
        const lockupMs = lockupDays * 24 * 60 * 60 * 1000;
        const elapsedMs = Date.now() - lastStakeEntry.createdAt.getTime();

        if (elapsedMs < lockupMs) {
          const daysRemaining = Math.ceil((lockupMs - elapsedMs) / (24 * 60 * 60 * 1000));
          throw new BadRequestException(
            `Lockup period active. Please wait ${daysRemaining} more day(s) before unstaking.`,
          );
        }
      }
    }

    const balanceBefore = wallet.stakedBalance || '0';

    try {
      // Call Soroban contract to unstake
      const txHash = await this.sorobanService.unstake(user.username, amount);

      // Update wallet balances
      const newStakedBalance = (stakedBalance - amountNum).toString();
      const newBalance = (parseFloat(wallet.balance || '0') + amountNum).toString();

      wallet.balance = newBalance;
      wallet.stakedBalance = newStakedBalance;
      await this.walletRepo.save(wallet);

      // Record staking entry
      const entry = await this.stakingRepo.save(
        this.stakingRepo.create({
          userId,
          action: StakingAction.UNSTAKE,
          amountUsdc: amount,
          balanceBeforeUsdc: balanceBefore,
          balanceAfterUsdc: newStakedBalance,
          txHash,
        }),
      );

      // Emit WebSocket event
      this.eventEmitter.emit('balance_updated', {
        userId,
        balance: newBalance,
        stakedBalance: newStakedBalance,
      });

      this.logger.log(`User ${userId} unstaked ${amount} USDC. txHash=${txHash}`);
      return entry;
    } catch (err) {
      this.logger.error(
        `Unstaking failed for user ${userId}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * Daily yield distribution: calculate yield for all users and credit via contract.
   * APY = annualPercent / 365 * stakedBalance = dailyYield
   */
  async distributeYield(): Promise<{ processed: number; failed: number }> {
    this.logger.log('Starting daily yield distribution...');

    const users = await this.userRepo.find();
    let processed = 0;
    let failed = 0;

    // Process in batches of 20
    const batchSize = 20;
    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize);

      const promises = batch.map(async (user) => {
        try {
          await this.creditYieldForUser(user.id);
          processed++;
        } catch (err) {
          this.logger.warn(
            `Yield credit failed for user ${user.id}: ${(err as Error).message}`,
          );
          failed++;
        }
      });

      await Promise.all(promises);
    }

    this.logger.log(
      `Yield distribution complete. Processed: ${processed}, Failed: ${failed}`,
    );
    return { processed, failed };
  }

  /**
   * Credit yield to a user's staked balance. Called daily and after manual admin credit.
   */
  async creditYieldForUser(userId: string): Promise<StakingEntry | null> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const wallet = await this.walletRepo.findOne({ where: { userId } });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const stakedBalance = parseFloat(wallet.stakedBalance || '0');
    if (stakedBalance <= 0) {
      return null; // No staked balance, no yield
    }

    // Get tier APY
    const tierConfig = await this.tierService.getUserTierLimits(userId);
    const apy = parseFloat(tierConfig.yieldApyPercent) / 100; // Convert percent to decimal
    const dailyYield = (apy / 365) * stakedBalance;

    if (dailyYield <= 0) {
      return null;
    }

    const amount = dailyYield.toFixed(8);
    const balanceBefore = wallet.stakedBalance || '0';

    try {
      // Call Soroban contract to credit yield
      const txHash = await this.sorobanService.creditYield(user.username, amount);

      // Update wallet
      const newStakedBalance = (stakedBalance + dailyYield).toString();
      wallet.stakedBalance = newStakedBalance;
      await this.walletRepo.save(wallet);

      // Record staking entry
      const entry = await this.stakingRepo.save(
        this.stakingRepo.create({
          userId,
          action: StakingAction.CREDIT,
          amountUsdc: amount,
          balanceBeforeUsdc: balanceBefore,
          balanceAfterUsdc: newStakedBalance,
          txHash,
        }),
      );

      this.logger.debug(
        `Credited ${amount} USDC yield to user ${userId}. txHash=${txHash}`,
      );
      return entry;
    } catch (err) {
      this.logger.error(
        `Yield credit failed for user ${userId}: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * Get staking balance and metadata for a user.
   */
  async getStakingBalance(userId: string): Promise<StakingBalanceDto> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const wallet = await this.walletRepo.findOne({ where: { userId } });
    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    // Get total yield credited
    const yieldEntries = await this.stakingRepo.find({
      where: {
        userId,
        action: StakingAction.CREDIT,
      },
    });

    const totalYield = yieldEntries.reduce((sum, entry) => {
      return sum + parseFloat(entry.amountUsdc || '0');
    }, 0);

    // Get last stake entry to determine next unstake eligibility
    const lastStakeEntry = await this.stakingRepo.findOne({
      where: { userId, action: StakingAction.STAKE },
      order: { createdAt: 'DESC' },
    });

    let nextUnstakeEligibleAt: Date | null = null;
    if (lastStakeEntry) {
      const tierConfig = await this.tierService.getUserTierLimits(userId);
      const lockupDays = tierConfig.stakeLockupDays;
      if (lockupDays > 0) {
        nextUnstakeEligibleAt = new Date(
          lastStakeEntry.createdAt.getTime() + lockupDays * 24 * 60 * 60 * 1000,
        );
      }
    }

    return {
      userId,
      stakedBalanceUsdc: wallet.stakedBalance || '0',
      totalYieldUsdc: totalYield.toFixed(8),
      lastStakeAt: lastStakeEntry?.createdAt || null,
      nextUnstakeEligibleAt,
    };
  }

  /**
   * Get staking history entries for a user (paginated).
   */
  async getStakingHistory(
    userId: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<StakingHistoryDto> {
    const skip = (page - 1) * limit;

    const [entries, total] = await this.stakingRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      entries: entries.map((entry) => ({
        id: entry.id,
        action: entry.action,
        amountUsdc: entry.amountUsdc,
        balanceBeforeUsdc: entry.balanceBeforeUsdc,
        balanceAfterUsdc: entry.balanceAfterUsdc,
        txHash: entry.txHash,
        createdAt: entry.createdAt,
      })),
      total,
      page,
      limit,
    };
  }

  /**
   * Admin manual credit yield to a user's staked balance.
   */
  async adminCreditYield(userId: string, amount: string): Promise<StakingEntry> {
    this.validateAmount(amount);

    return this.creditYieldForUser(userId);
  }

  /**
   * Validate amount format and positivity.
   */
  private validateAmount(amount: string): void {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }
  }
}
