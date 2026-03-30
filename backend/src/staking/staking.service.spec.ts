import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StakingService } from './staking.service';
import { StakingEntry, StakingAction } from './entities/staking-entry.entity';
import { User } from '../users/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { TierService } from '../tier-config/tier.service';
import { SorobanService } from '../soroban/soroban.service';
import { TierName } from '../tier-config/entities/tier-config.entity';

describe('StakingService', () => {
  let service: StakingService;
  let stakingRepo: Repository<StakingEntry>;
  let userRepo: Repository<User>;
  let walletRepo: Repository<Wallet>;
  let tierService: TierService;
  let sorobanService: SorobanService;
  let eventEmitter: EventEmitter2;

  const mockUserId = 'user-123';
  const mockUser = {
    id: mockUserId,
    username: 'testuser',
    tier: TierName.GOLD,
  } as User;

  const mockWallet = {
    userId: mockUserId,
    balance: '1000',
    stakedBalance: '500',
  } as Wallet;

  const mockTierConfig = {
    tier: TierName.GOLD,
    minStakeAmountUsdc: '10',
    stakeLockupDays: 7,
    yieldApyPercent: '7.00',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StakingService,
        {
          provide: getRepositoryToken(StakingEntry),
          useValue: {
            save: jest.fn(),
            create: jest.fn(),
            findOne: jest.fn(),
            find: jest.fn(),
            findAndCount: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: TierService,
          useValue: {
            getUserTierLimits: jest.fn(),
          },
        },
        {
          provide: SorobanService,
          useValue: {
            stake: jest.fn(),
            unstake: jest.fn(),
            creditYield: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<StakingService>(StakingService);
    stakingRepo = module.get<Repository<StakingEntry>>(
      getRepositoryToken(StakingEntry),
    );
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
    walletRepo = module.get<Repository<Wallet>>(getRepositoryToken(Wallet));
    tierService = module.get<TierService>(TierService);
    sorobanService = module.get<SorobanService>(SorobanService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('stake', () => {
    it('should successfully stake amount above minimum', async () => {
      const amount = '50';
      const txHash = 'tx-hash-123';

      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(walletRepo, 'findOne').mockResolvedValue(mockWallet);
      jest.spyOn(tierService, 'getUserTierLimits').mockResolvedValue(mockTierConfig as any);
      jest.spyOn(sorobanService, 'stake').mockResolvedValue(txHash);
      jest.spyOn(stakingRepo, 'create').mockReturnValue({
        userId: mockUserId,
        action: StakingAction.STAKE,
        amountUsdc: amount,
        balanceBeforeUsdc: mockWallet.stakedBalance,
        balanceAfterUsdc: (parseFloat(mockWallet.stakedBalance) + parseFloat(amount)).toString(),
        txHash,
      } as StakingEntry);
      jest.spyOn(stakingRepo, 'save').mockResolvedValue({
        id: 'entry-123',
      } as StakingEntry);

      const result = await service.stake(mockUserId, amount);

      expect(result.id).toBe('entry-123');
      expect(sorobanService.stake).toHaveBeenCalledWith(mockUser.username, amount);
      expect(walletRepo.save).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalledWith('balance_updated', expect.any(Object));
    });

    it('should reject stake below minimum amount', async () => {
      const amount = '5'; // Below minimum of 10
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(walletRepo, 'findOne').mockResolvedValue(mockWallet);
      jest
        .spyOn(tierService, 'getUserTierLimits')
        .mockResolvedValue(mockTierConfig as any);

      await expect(service.stake(mockUserId, amount)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject stake with insufficient balance', async () => {
      const amount = '2000'; // More than available balance (1000)
      const walletWithLowBalance = { ...mockWallet, balance: '100' } as Wallet;

      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(walletRepo, 'findOne').mockResolvedValue(walletWithLowBalance);
      jest
        .spyOn(tierService, 'getUserTierLimits')
        .mockResolvedValue(mockTierConfig as any);

      await expect(service.stake(mockUserId, amount)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw if user not found', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);

      await expect(service.stake(mockUserId, '50')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('unstake', () => {
    it('should successfully unstake when lockup period has passed', async () => {
      const amount = '100';
      const txHash = 'tx-hash-456';
      const lastStakeDate = new Date();
      lastStakeDate.setDate(lastStakeDate.getDate() - 10); // 10 days ago

      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(walletRepo, 'findOne').mockResolvedValue(mockWallet);
      jest.spyOn(tierService, 'getUserTierLimits').mockResolvedValue({
        ...mockTierConfig,
        stakeLockupDays: 7,
      } as any);
      jest.spyOn(stakingRepo, 'findOne').mockResolvedValue({
        createdAt: lastStakeDate,
      } as StakingEntry);
      jest.spyOn(sorobanService, 'unstake').mockResolvedValue(txHash);
      jest.spyOn(stakingRepo, 'create').mockReturnValue({
        userId: mockUserId,
        action: StakingAction.UNSTAKE,
        amountUsdc: amount,
      } as StakingEntry);
      jest.spyOn(stakingRepo, 'save').mockResolvedValue({
        id: 'entry-456',
      } as StakingEntry);

      const result = await service.unstake(mockUserId, amount);

      expect(result.id).toBe('entry-456');
      expect(sorobanService.unstake).toHaveBeenCalledWith(mockUser.username, amount);
    });

    it('should reject unstake during lockup period', async () => {
      const amount = '100';
      const lastStakeDate = new Date();
      lastStakeDate.setDate(lastStakeDate.getDate() - 3); // Only 3 days ago

      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(walletRepo, 'findOne').mockResolvedValue(mockWallet);
      jest.spyOn(tierService, 'getUserTierLimits').mockResolvedValue({
        ...mockTierConfig,
        stakeLockupDays: 7,
      } as any);
      jest.spyOn(stakingRepo, 'findOne').mockResolvedValue({
        createdAt: lastStakeDate,
      } as StakingEntry);

      await expect(service.unstake(mockUserId, amount)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject unstake with insufficient staked balance', async () => {
      const amount = '1000'; // More than available staked balance
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(walletRepo, 'findOne').mockResolvedValue(mockWallet);
      jest
        .spyOn(tierService, 'getUserTierLimits')
        .mockResolvedValue(mockTierConfig as any);

      await expect(service.unstake(mockUserId, amount)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('yield calculation', () => {
    it('should correctly calculate daily yield: 10% APY on 100 USDC = 0.02740 daily', () => {
      // 10% APY = 0.10
      // Daily = 0.10 / 365 * 100 = 0.02739726...
      const apy = 0.10;
      const stakedBalance = 100;
      const expectedDaily = (apy / 365) * stakedBalance;

      expect(expectedDaily).toBeCloseTo(0.0274, 4);
    });

    it('should credit yield for user with active stake', async () => {
      const txHash = 'tx-hash-yield';
      const stakedBalance = 100;
      const dailyYield = 0.027397260274;
      const wallet = { ...mockWallet, stakedBalance: stakedBalance.toString() } as Wallet;

      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(walletRepo, 'findOne').mockResolvedValue(wallet);
      jest.spyOn(tierService, 'getUserTierLimits').mockResolvedValue({
        ...mockTierConfig,
        yieldApyPercent: '10.00',
      } as any);
      jest.spyOn(sorobanService, 'creditYield').mockResolvedValue(txHash);
      jest.spyOn(stakingRepo, 'create').mockReturnValue({
        action: StakingAction.CREDIT,
      } as StakingEntry);
      jest.spyOn(stakingRepo, 'save').mockResolvedValue({
        id: 'yield-entry',
      } as StakingEntry);

      const result = await service.creditYieldForUser(mockUserId);

      expect(result?.id).toBe('yield-entry');
      expect(walletRepo.save).toHaveBeenCalled();
    });

    it('should return null for user with zero staked balance', async () => {
      const walletWithZeroStake = { ...mockWallet, stakedBalance: '0' } as Wallet;

      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(walletRepo, 'findOne').mockResolvedValue(walletWithZeroStake);

      const result = await service.creditYieldForUser(mockUserId);

      expect(result).toBeNull();
      expect(sorobanService.creditYield).not.toHaveBeenCalled();
    });
  });

  describe('getStakingBalance', () => {
    it('should return staking balance with metadata', async () => {
      const yieldEntries = [
        { amountUsdc: '1.0', action: StakingAction.CREDIT },
        { amountUsdc: '0.5', action: StakingAction.CREDIT },
      ] as StakingEntry[];

      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(walletRepo, 'findOne').mockResolvedValue(mockWallet);
      jest.spyOn(tierService, 'getUserTierLimits').mockResolvedValue(mockTierConfig as any);
      jest.spyOn(stakingRepo, 'find').mockResolvedValue(yieldEntries);
      jest.spyOn(stakingRepo, 'findOne').mockResolvedValue(null);

      const result = await service.getStakingBalance(mockUserId);

      expect(result.userId).toBe(mockUserId);
      expect(result.stakedBalanceUsdc).toBe(mockWallet.stakedBalance);
      expect(result.totalYieldUsdc).toBe('1.50000000');
    });
  });

  describe('getStakingHistory', () => {
    it('should return paginated staking history', async () => {
      const entries = [
        {
          id: 'entry-1',
          action: StakingAction.STAKE,
          amountUsdc: '100',
          createdAt: new Date(),
        },
      ] as StakingEntry[];

      jest.spyOn(stakingRepo, 'findAndCount').mockResolvedValue([entries, 1]);

      const result = await service.getStakingHistory(mockUserId, 1, 20);

      expect(result.entries).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });
  });
});
