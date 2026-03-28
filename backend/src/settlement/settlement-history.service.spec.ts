import { Test, TestingModule } from '@nestjs/testing';
import { DataSource, Repository } from 'typeorm';
import { SettlementHistoryService } from './settlement-history.service';
import { Settlement } from './entities/settlement.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { getRepositoryToken } from '@nestjs/typeorm';

// Mock data
const mockMerchantId = 'merchant-123';
const mockSettlement = {
  id: 'settle-1',
  merchantId: mockMerchantId,
  usdcAmount: 10.5,
  ngnAmount: 16500.0,
  // ... other fields
};

describe('SettlementHistoryService', () => {
  let service: SettlementHistoryService;
  let settlementRepo: Repository<Settlement>;
  let dataSource: DataSource;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettlementHistoryService,
        {
          provide: getRepositoryToken(Settlement),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(BankAccount),
          useClass: Repository,
        },
        {
          provide: DataSource,
          useValue: { createQueryBuilder: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<SettlementHistoryService>(SettlementHistoryService);
    settlementRepo = module.get<Repository<Settlement>>(getRepositoryToken(Settlement));
    dataSource = module.get<DataSource>(DataSource);
  });

  it('should getMerchantSettlements - only own settlements', async () => {
    jest.spyOn(settlementRepo, 'createQueryBuilder').mockReturnValue({
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockSettlement]),
    } as any);

    const result = await service.getMerchantSettlements(mockMerchantId, {});
    expect(result.data.length).toBe(1);
    expect(settlementRepo.createQueryBuilder).toHaveBeenCalledWith('s');
    expect(result.data[0].id).toBe(mockSettlement.id);
  });

  it('should getSummary - correct math', async () => {
    const mockResult = {
      totalSettledNgn: '10000',
      totalSettledUsdc: '6.4',
      settlementCount: '2',
      lastSettledAt: new Date().toISOString(),
      pendingNgn: '5000',
      pendingUsdc: '3.2',
    };

    jest.spyOn(dataSource, 'createQueryBuilder').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue(mockResult),
    } as any);

    const result = await service.getSummary(mockMerchantId);
    expect(result.totalSettledNgn).toBe(10000);
    expect(result.settlementCount).toBe(2);
    expect(result.pendingUsdc).toBe(3.2);
  });

  it('should getMonthlyBreakdown - last 6 months', async () => {
    const mockResult = [{ month: '2024-10', totalNgn: '16500', totalUsdc: '10.5', count: '1' }];
    
    jest.spyOn(dataSource, 'createQueryBuilder').mockReturnValue({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue(mockResult),
    } as any);

    const result = await service.getMonthlyBreakdown(mockMerchantId);
    expect(result).toHaveLength(1);
    expect(result[0].month).toBe('2024-10');
  });
});
