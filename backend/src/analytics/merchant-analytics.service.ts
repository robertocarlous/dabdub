import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const DAILY_SIGNUP_WINDOW_DAYS = 30;
const ACTIVATION_WINDOW_DAYS = 7;

interface SignupRow {
  day: string;
  count: string;
}

interface CountRow {
  count: string;
}

export interface MerchantAnalyticsPoint {
  date: string;
  signups: number;
}

export interface MerchantAnalyticsResponse {
  generatedAt: string;
  dailySignups: MerchantAnalyticsPoint[];
  activationRate: {
    windowDays: number;
    activatedMerchants: number;
    totalMerchants: number;
    percentage: number;
  };
  monthlyActiveMerchants: {
    month: string;
    count: number;
  };
}

export interface TopMerchant {
  businessName: string;
  volume: number;
  paymentCount: number;
  settlementCount: number;
  country: string;
}

export interface TopMerchantsResponse {
  merchants: TopMerchant[];
  period: string;
  generatedAt: string;
}

@Injectable()
export class MerchantAnalyticsService {
  private readonly logger = new Logger(MerchantAnalyticsService.name);
  private readonly topMerchantsCache = new Map<string, { data: TopMerchantsResponse; expiresAt: number }>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getMetrics(asOf = new Date()): Promise<MerchantAnalyticsResponse> {
    const [dailySignupsRows, activationRows, monthlyActiveRows] =
      await Promise.all([
        this.dataSource.query<SignupRow[]>(
          `
            SELECT
              DATE_TRUNC('day', "createdAt")::date::text AS day,
              COUNT(*)::text AS count
            FROM users
            WHERE "is_admin" = false
              AND "is_treasury" = false
              AND "createdAt" >= ($1::timestamptz - INTERVAL '${DAILY_SIGNUP_WINDOW_DAYS - 1} days')
            GROUP BY 1
            ORDER BY 1 ASC
          `,
          [asOf.toISOString()],
        ),
        this.dataSource.query<CountRow[]>(
          `
            SELECT
              COUNT(*) FILTER (
                WHERE EXISTS (
                  SELECT 1
                  FROM sessions
                  WHERE sessions.user_id = users.id
                    AND sessions."createdAt" <= users."createdAt" + INTERVAL '${ACTIVATION_WINDOW_DAYS} days'
                )
              )::text AS count,
              COUNT(*)::text AS total
            FROM users
            WHERE "is_admin" = false
              AND "is_treasury" = false
          `,
        ),
        this.dataSource.query<CountRow[]>(
          `
            SELECT COUNT(DISTINCT sessions.user_id)::text AS count
            FROM sessions
            INNER JOIN users ON users.id = sessions.user_id
            WHERE users."is_admin" = false
              AND users."is_treasury" = false
              AND DATE_TRUNC('month', sessions.last_seen_at) = DATE_TRUNC('month', $1::timestamptz)
          `,
          [asOf.toISOString()],
        ),
      ]);

    const activation = activationRows[0] as CountRow & { total: string };
    const activatedMerchants = Number(activation?.count ?? 0);
    const totalMerchants = Number(activation?.total ?? 0);

    return {
      generatedAt: asOf.toISOString(),
      dailySignups: this.buildDailySignupSeries(asOf, dailySignupsRows),
      activationRate: {
        windowDays: ACTIVATION_WINDOW_DAYS,
        activatedMerchants,
        totalMerchants,
        percentage:
          totalMerchants === 0
            ? 0
            : Number(((activatedMerchants / totalMerchants) * 100).toFixed(2)),
      },
      monthlyActiveMerchants: {
        month: asOf.toISOString().slice(0, 7),
        count: Number(monthlyActiveRows[0]?.count ?? 0),
      },
    };
  }

  private buildDailySignupSeries(
    asOf: Date,
    rows: SignupRow[],
  ): MerchantAnalyticsPoint[] {
    const counts = new Map(rows.map((row) => [row.day, Number(row.count)]));
    const series: MerchantAnalyticsPoint[] = [];

    for (let offset = DAILY_SIGNUP_WINDOW_DAYS - 1; offset >= 0; offset -= 1) {
      const current = new Date(asOf);
      current.setUTCDate(current.getUTCDate() - offset);
      const date = current.toISOString().slice(0, 10);
      series.push({
        date,
        signups: counts.get(date) ?? 0,
      });
    }

    return series;
  }

  async getTopMerchants(limit: number = 10, period: string = '30d'): Promise<TopMerchantsResponse> {
    const cacheKey = `${limit}-${period}`;
    const cached = this.topMerchantsCache.get(cacheKey);
    
    if (cached && cached.expiresAt > Date.now()) {
      this.logger.debug(`Returning cached top merchants for ${cacheKey}`);
      return cached.data;
    }

    const periodDays = this.getPeriodDays(period);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - periodDays);

    const query = `
      SELECT 
        m."businessName",
        COALESCE(SUM(p."amountUsd"), 0)::decimal AS volume,
        COUNT(p.id)::int AS "paymentCount",
        COUNT(DISTINCT p."settlementId") FILTER (WHERE p."settlementId" IS NOT NULL)::int AS "settlementCount",
        m.country
      FROM merchants m
      LEFT JOIN payments p ON m.id = p."merchantId" 
        AND p."createdAt" >= $1
        AND p.status IN ('confirmed', 'settling', 'settled')
      WHERE m.status = 'active'
      GROUP BY m.id, m."businessName", m.country
      ORDER BY volume DESC, "paymentCount" DESC
      LIMIT $2
    `;

    try {
      const merchants = await this.dataSource.query(query, [cutoffDate.toISOString(), limit]);
      
      const response: TopMerchantsResponse = {
        merchants: merchants.map((row: any) => ({
          businessName: row.businessName,
          volume: parseFloat(row.volume),
          paymentCount: row.paymentCount,
          settlementCount: row.settlementCount,
          country: row.country || 'Unknown',
        })),
        period,
        generatedAt: new Date().toISOString(),
      };

      // Cache for 10 minutes
      this.topMerchantsCache.set(cacheKey, {
        data: response,
        expiresAt: Date.now() + 10 * 60 * 1000,
      });

      this.logger.debug(`Generated top merchants for ${cacheKey}: ${merchants.length} results`);
      return response;
    } catch (error) {
      this.logger.error(`Failed to get top merchants: ${error.message}`, error.stack);
      throw error;
    }
  }

  private getPeriodDays(period: string): number {
    switch (period) {
      case '7d':
        return 7;
      case '30d':
        return 30;
      case '90d':
        return 90;
      default:
        return 30;
    }
  }
}
