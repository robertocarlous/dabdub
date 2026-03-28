import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Settlement, SettlementStatus } from './entities/settlement.entity';
import { BankAccount } from '../bank-accounts/entities/bank-account.entity';
import { Merchant } from '../merchants/entities/merchant.entity';
import { SettlementsQueryDto } from './dto/settlements-query.dto';
import { SettlementDetailDto } from './dto/settlement-detail.dto';
import { SettlementSummaryDto } from './dto/settlement-summary.dto';
import { MonthlyBreakdownDto } from './dto/monthly-breakdown.dto';

export interface PaginatedSettlements {
  data: SettlementDetailDto[];
  nextCursor?: string;
  hasMore: boolean;
}

@Injectable()
export class SettlementHistoryService {
  constructor(
    @InjectRepository(Settlement)
    private settlementRepo: Repository<Settlement>,
    @InjectRepository(BankAccount)
    private bankAccountRepo: Repository<BankAccount>,
    private dataSource: DataSource,
  ) {}

  async getMerchantSettlements(
    merchantId: string,
    query: SettlementsQueryDto,
  ): Promise<PaginatedSettlements> {
    const qb = this.settlementRepo
      .createQueryBuilder('s')
      .leftJoin('s.bankAccount', 'ba')
      .where('s.merchantId = :merchantId', { merchantId })
      .orderBy('s.createdAt', 'DESC');

    if (query.status) {
      qb.andWhere('s.status = :status', { status: query.status });
    }

    if (query.dateFrom) {
      qb.andWhere('s.createdAt >= :dateFrom', { dateFrom: query.dateFrom });
    }

    if (query.dateTo) {
      qb.andWhere('s.createdAt <= :dateTo', { dateTo: query.dateTo });
    }

    if (query.cursor) {
      const cursorTime = new Date(parseInt(query.cursor));
      qb.andWhere('s.createdAt < :cursorTime', { cursorTime });
    }

    qb.limit(query.limit! + 1);

    const settlements = await qb.getMany();

    const hasMore = settlements.length > query.limit!;
    const data = settlements.slice(0, query.limit!).map((s) => ({
      id: s.id,
      usdcAmount: Number(s.usdcAmount),
      ngnAmount: Number(s.ngnAmount),
      rate: Number(s.rate),
      status: s.status,
      bankAccount: {
        bankName: s.bankAccount?.bankName || '',
        accountNumber: s.bankAccount?.accountNumber || '',
        accountName: s.bankAccount?.accountName || '',
      },
      providerRef: s.providerRef,
      settledAt: s.settledAt,
      createdAt: s.createdAt,
      failureReason: s.failureReason,
    })) as SettlementDetailDto[];

    const nextCursor =
      hasMore && data.length > 0
        ? data[data.length - 1].createdAt!.getTime().toString()
        : undefined;

    return { data, nextCursor, hasMore };
  }

  async getSummary(merchantId: string): Promise<SettlementSummaryDto> {
    const result = await this.dataSource
      .createQueryBuilder()
      .select('COALESCE(SUM(s.ngn_amount), 0)', 'totalSettledNgn')
      .addSelect('COALESCE(SUM(s.usdc_amount), 0)', 'totalSettledUsdc')
      .addSelect('COUNT(s.id)', 'settlementCount')
      .addSelect('MAX(s.settled_at)', 'lastSettledAt')
      .addSelect(
        'COALESCE(SUM(CASE WHEN s.status IN (:...pendingStatuses) THEN s.ngn_amount ELSE 0 END), 0)',
        'pendingNgn',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN s.status IN (:...pendingStatuses) THEN s.usdc_amount ELSE 0 END), 0)',
        'pendingUsdc',
      )
      .from(Settlement, 's')
      .where('s.merchantId = :merchantId', { merchantId })
      .setParameters({
        pendingStatuses: [SettlementStatus.QUEUED, SettlementStatus.PROCESSING],
      })
      .getRawOne();

    if (!result) {
      throw new NotFoundException('No settlements found');
    }

    return {
      totalSettledNgn: Number(result.totalSettledNgn),
      totalSettledUsdc: Number(result.totalSettledUsdc),
      settlementCount: parseInt(result.settlementCount),
      lastSettledAt: result.lastSettledAt ? new Date(result.lastSettledAt) : undefined,
      pendingNgn: Number(result.pendingNgn),
      pendingUsdc: Number(result.pendingUsdc),
    };
  }

  async getMonthlyBreakdown(merchantId: string): Promise<MonthlyBreakdownDto[]> {
    const result = await this.dataSource
      .createQueryBuilder()
      .select("TO_CHAR(s.created_at, 'YYYY-MM')", 'month')
      .addSelect('COALESCE(SUM(s.ngn_amount), 0)', 'totalNgn')
      .addSelect('COALESCE(SUM(s.usdc_amount), 0)', 'totalUsdc')
      .addSelect('COUNT(s.id)', 'count')
      .from(Settlement, 's')
      .where('s.merchantId = :merchantId', { merchantId })
      .andWhere("s.created_at >= NOW() - INTERVAL '6 months'")
      .groupBy("TO_CHAR(s.created_at, 'YYYY-MM')")
      .orderBy('month', 'DESC')
      .getRawMany();

    return result.map((r) => ({
      month: r.month,
      totalNgn: Number(r.totalNgn),
      totalUsdc: Number(r.totalUsdc),
      count: parseInt(r.count),
    }));
  }
}
