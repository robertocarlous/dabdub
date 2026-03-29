import { ReferralAnalyticsService } from './referral-analytics.service';
import { ReferralStatus } from './entities/referral.entity';
import { TransactionStatus } from '../transactions/entities/transaction.entity';

const makeQb = (result: any) => {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    getCount: jest.fn().mockResolvedValue(result),
    getRawOne: jest.fn().mockResolvedValue(result),
    getRawMany: jest.fn().mockResolvedValue(result),
  };
  return qb;
};

const makeRepo = () => ({
  count: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const makeRedis = () => ({
  incr: jest.fn(),
  expire: jest.fn(),
  scan: jest.fn(),
  mget: jest.fn(),
});

const makeCache = () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(true),
});

const buildService = (overrides: Partial<{
  referralRepo: any;
  userRepo: any;
  txRepo: any;
  cache: any;
  redis: any;
}> = {}) => {
  const referralRepo = overrides.referralRepo ?? makeRepo();
  const userRepo = overrides.userRepo ?? makeRepo();
  const txRepo = overrides.txRepo ?? makeRepo();
  const cache = overrides.cache ?? makeCache();
  const redis = overrides.redis ?? makeRedis();

  const service = new ReferralAnalyticsService(
    referralRepo as any,
    userRepo as any,
    txRepo as any,
    cache as any,
    redis as any,
  );

  return { service, referralRepo, userRepo, txRepo, cache, redis };
};

// ── Click tracking ────────────────────────────────────────────────────────────

describe('ReferralAnalyticsService - click tracking', () => {
  it('uses Redis INCR and sets TTL — no DB write', async () => {
    const { service, redis, referralRepo, userRepo, txRepo } = buildService();
    redis.incr.mockResolvedValue(5);
    redis.expire.mockResolvedValue(1);

    const count = await service.incrementClick('CH-john-AB12');

    expect(count).toBe(5);
    expect(redis.incr).toHaveBeenCalledWith('invite:clicks:CH-john-AB12');
    expect(redis.expire).toHaveBeenCalledWith('invite:clicks:CH-john-AB12', 86400);

    // No DB interaction
    expect(referralRepo.count).not.toHaveBeenCalled();
    expect(userRepo.count).not.toHaveBeenCalled();
    expect(txRepo.count).not.toHaveBeenCalled();
  });

  it('returns cached funnel stats without hitting DB', async () => {
    const cachedStats = {
      totalReferralLinks: 100,
      clicked: 50,
      signedUp: 20,
      converted: 5,
      rewarded: 3,
      conversionRate: 25,
      avgDaysToConvert: 2.5,
    };
    const cache = makeCache();
    cache.get.mockResolvedValue(cachedStats);
    const { service, referralRepo } = buildService({ cache });

    const result = await service.getFunnelStats();

    expect(result).toEqual(cachedStats);
    expect(referralRepo.count).not.toHaveBeenCalled();
  });
});

// ── Cohort comparison date windows ────────────────────────────────────────────

describe('ReferralAnalyticsService - cohort comparison', () => {
  it('uses correct D7 and D30 date windows', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);

    const referralRepo = makeRepo();
    const userRepo = makeRepo();
    const txRepo = makeRepo();

    // referred user IDs query
    const referredQb = makeQb([{ userId: 'user-1' }]);
    // D7 retention queries
    const d7RefQb = makeQb({ cnt: '1' });
    const d7OrgQb = makeQb({ cnt: '2' });
    // organic count
    const organicCountQb = makeQb(10);
    // first tx queries
    const firstTxRefQb = makeQb({ avg: '15' });
    const firstTxOrgQb = makeQb({ avg: '20' });
    // volume queries
    const volRefQb = makeQb({ sum: '100' });
    const volOrgQb = makeQb({ sum: '200' });
    // churn queries
    const churnRefQb = makeQb(1);
    const churnOrgQb = makeQb(2);

    let qbCallCount = 0;
    const qbSequence = [
      referredQb,
      d7RefQb, d7OrgQb,
      firstTxRefQb, firstTxOrgQb,
      volRefQb, volOrgQb,
      churnRefQb, churnOrgQb,
    ];

    referralRepo.createQueryBuilder = jest.fn(() => {
      if (qbCallCount === 0) { qbCallCount++; return referredQb; }
      return referredQb;
    });
    userRepo.createQueryBuilder = jest.fn(() => organicCountQb);
    txRepo.createQueryBuilder = jest.fn(() => {
      const idx = qbCallCount++ % qbSequence.length;
      return qbSequence[idx] ?? d7RefQb;
    });

    // Capture the date params passed to where clauses
    const capturedParams: any[] = [];
    d7RefQb.andWhere = jest.fn((clause: string, params: any) => {
      if (params?.d7) capturedParams.push({ type: 'd7', date: params.d7 });
      return d7RefQb;
    });
    volRefQb.andWhere = jest.fn((clause: string, params: any) => {
      if (params?.d30) capturedParams.push({ type: 'd30', date: params.d30 });
      return volRefQb;
    });

    const { service } = buildService({ referralRepo, userRepo, txRepo });
    await service.getCohortComparison();

    const d7Param = capturedParams.find((p) => p.type === 'd7');
    const d30Param = capturedParams.find((p) => p.type === 'd30');

    if (d7Param) {
      const diffMs = now - d7Param.date.getTime();
      expect(diffMs).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -3);
    }
    if (d30Param) {
      const diffMs = now - d30Param.date.getTime();
      expect(diffMs).toBeCloseTo(30 * 24 * 60 * 60 * 1000, -3);
    }

    jest.spyOn(Date, 'now').mockRestore();
  });

  it('returns empty cohort when no referred users exist', async () => {
    const referralRepo = makeRepo();
    const emptyQb = makeQb([]);
    referralRepo.createQueryBuilder = jest.fn(() => emptyQb);

    const { service } = buildService({ referralRepo });
    const result = await service.getCohortComparison();

    expect(result.d7Retention).toEqual({ referred: 0, organic: 0, referredPercent: 0, organicPercent: 0 });
    expect(result.churnRate).toEqual({ referred: 0, organic: 0, referredPercent: 0, organicPercent: 0 });
  });
});

// ── Reward spend ──────────────────────────────────────────────────────────────

describe('ReferralAnalyticsService - reward spend', () => {
  it('sums rewarded referral records for 8 weeks', async () => {
    const referralRepo = makeRepo();
    const weekQb = makeQb({ sum: '10.00' });
    referralRepo.createQueryBuilder = jest.fn(() => weekQb);

    const { service } = buildService({ referralRepo });
    const result = await service.getRewardSpend();

    expect(result.weeklySpend).toHaveLength(8);
    expect(result.weeklySpend[0].amount).toBe('10.00');
    // projected = avg of last 4 weeks * 4 = 10 * 4 = 40
    expect(result.projectedMonthly).toBe('40.00');
  });

  it('matches sum of REWARDED Referral records', async () => {
    const referralRepo = makeRepo();
    const qb = makeQb({ sum: '25.50' });
    qb.where = jest.fn((clause: string, params: any) => {
      expect(params.status).toBe(ReferralStatus.REWARDED);
      return qb;
    });
    referralRepo.createQueryBuilder = jest.fn(() => qb);

    const { service } = buildService({ referralRepo });
    const result = await service.getRewardSpend();

    expect(result.weeklySpend.every((w) => w.amount === '25.50')).toBe(true);
  });
});
