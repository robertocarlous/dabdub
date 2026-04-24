import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentNetwork, PaymentStatus } from '../payments/entities/payment.entity';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private cache = new Map<string, { data: any; expiry: number }>();

  constructor(
    @InjectRepository(Payment)
    private paymentsRepo: Repository<Payment>,
  ) {}

  private async getCachedData(key: string, fetchFn: () => Promise<any>, ttl = 60000) {
    const cached = this.cache.get(key);
    if (cached && cached.expiry > Date.now()) {
      this.logger.debug(`Cache hit for ${key}`);
      return { ...cached.data, cacheHit: true };
    }
    this.logger.debug(`Cache miss for ${key}`);
    const data = await fetchFn();
    this.cache.set(key, { data, expiry: Date.now() + ttl });
    return { ...data, cacheHit: false };
  }

  async getVolume(merchantId: string, period: 'daily' | 'monthly') {
    const cacheKey = `volume:${merchantId}:${period}`;
    return this.getCachedData(cacheKey, async () => {
      const dateFormat = period === 'daily' ? 'YYYY-MM-DD' : 'YYYY-MM';
      
      const results = await this.paymentsRepo
        .createQueryBuilder('payment')
        .select(`TO_CHAR(payment.createdAt, '${dateFormat}')`, 'date')
        .addSelect('SUM(payment.amountUsd)', 'volume')
        .addSelect('COUNT(*)', 'count')
        .where('payment.merchantId = :merchantId', { merchantId })
        .andWhere('payment.status = :status', { status: PaymentStatus.SETTLED })
        .groupBy('date')
        .orderBy('date', 'ASC')
        .getRawMany();

      return { results };
    });
  }

  async getFunnel(merchantId: string) {
    const cacheKey = `funnel:${merchantId}`;
    return this.getCachedData(cacheKey, async () => {
      const stats = await this.paymentsRepo
        .createQueryBuilder('payment')
        .select('payment.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .where('payment.merchantId = :merchantId', { merchantId })
        .groupBy('payment.status')
        .getRawMany();

      const counts = {
        total: 0,
        pending: 0,
        confirmed: 0,
        settling: 0,
        settled: 0,
        failed: 0,
        expired: 0,
      };

      stats.forEach((s) => {
        counts[s.status] = parseInt(s.count);
        counts.total += parseInt(s.count);
      });

      const percentages = {
        conversionRate: counts.total > 0 ? (counts.settled / counts.total) * 100 : 0,
        abandonmentRate: counts.total > 0 ? ((counts.expired + counts.failed) / counts.total) * 100 : 0,
      };

      return { counts, percentages };
    });
  }

  async getComparison(merchantId: string, period: 'daily' | 'monthly') {
    const cacheKey = `comparison:${merchantId}:${period}`;
    return this.getCachedData(cacheKey, async () => {
      const now = new Date();
      let currentStart: Date, currentEnd: Date, prevStart: Date, prevEnd: Date;

      if (period === 'daily') {
        currentStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        currentEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        prevStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        prevEnd = currentStart;
      } else {
        currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
        currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        prevEnd = currentStart;
      }

      const [currentVolume, prevVolume] = await Promise.all([
        this.getVolumeForPeriod(merchantId, currentStart, currentEnd),
        this.getVolumeForPeriod(merchantId, prevStart, prevEnd),
      ]);

      const growth = prevVolume > 0 ? ((currentVolume - prevVolume) / prevVolume) * 100 : (currentVolume > 0 ? 100 : 0);

      return {
        currentPeriod: { start: currentStart, end: currentEnd, volume: currentVolume },
        previousPeriod: { start: prevStart, end: prevEnd, volume: prevVolume },
        growth,
      };
    });
  }

  private async getVolumeForPeriod(merchantId: string, start: Date, end: Date): Promise<number> {
    const result = await this.paymentsRepo
      .createQueryBuilder('payment')
      .select('SUM(payment.amountUsd)', 'total')
      .where('payment.merchantId = :merchantId', { merchantId })
      .andWhere('payment.status = :status', { status: PaymentStatus.SETTLED })
      .andWhere('payment.createdAt >= :start', { start })
      .andWhere('payment.createdAt < :end', { end })
      .getRawOne();

    return parseFloat(result?.total || 0);
  }

  async getNetworkBreakdown(merchantId: string, sortBy: 'volume' | 'count' = 'volume', period: 'daily' | 'monthly' = 'daily') {
    const cacheKey = `networks:${merchantId}:${sortBy}:${period}`;
    return this.getCachedData(cacheKey, async () => {
      const dateFormat = period === 'daily' ? 'YYYY-MM-DD' : 'YYYY-MM';

      const [rows, trendRows] = await Promise.all([
        this.paymentsRepo
          .createQueryBuilder('payment')
          .select('payment.network', 'network')
          .addSelect('COUNT(*)', 'count')
          .addSelect('COALESCE(SUM(payment.amountUsd), 0)', 'volumeUsd')
          .where('payment.merchantId = :merchantId', { merchantId })
          .andWhere('payment.status = :status', { status: PaymentStatus.SETTLED })
          .groupBy('payment.network')
          .getRawMany(),
        this.paymentsRepo
          .createQueryBuilder('payment')
          .select('payment.network', 'network')
          .addSelect(`TO_CHAR(payment.createdAt, '${dateFormat}')`, 'date')
          .addSelect('COUNT(*)', 'count')
          .addSelect('COALESCE(SUM(payment.amountUsd), 0)', 'volumeUsd')
          .where('payment.merchantId = :merchantId', { merchantId })
          .andWhere('payment.status = :status', { status: PaymentStatus.SETTLED })
          .groupBy('payment.network')
          .addGroupBy('date')
          .orderBy('date', 'ASC')
          .getRawMany(),
      ]);

      const totals = rows.reduce((s, r) => ({ volume: s.volume + parseFloat(r.volumeUsd), count: s.count + parseInt(r.count) }), { volume: 0, count: 0 });

      const byNetwork = new Map(rows.map((r) => [r.network, { count: parseInt(r.count), volumeUsd: parseFloat(r.volumeUsd) }]));

      const trendByNetwork = new Map<string, { date: string; count: number; volumeUsd: number }[]>();
      for (const r of trendRows) {
        if (!trendByNetwork.has(r.network)) trendByNetwork.set(r.network, []);
        trendByNetwork.get(r.network).push({ date: r.date, count: parseInt(r.count), volumeUsd: parseFloat(r.volumeUsd) });
      }

      const networks = Object.values(PaymentNetwork).map((network) => {
        const data = byNetwork.get(network) ?? { count: 0, volumeUsd: 0 };
        return {
          network,
          count: data.count,
          volumeUsd: data.volumeUsd,
          percentOfTotal: totals.volume > 0 ? parseFloat(((data.volumeUsd / totals.volume) * 100).toFixed(2)) : 0,
          trend: trendByNetwork.get(network) ?? [],
        };
      });

      networks.sort((a, b) => (sortBy === 'count' ? b.count - a.count : b.volumeUsd - a.volumeUsd));

      return { networks, totals };
    });
  }

  clearCache() {
    this.cache.clear();
  }
}
