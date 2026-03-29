import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bull';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Queue } from 'bull';
import { CacheModule } from '../cache/cache.module';
import { NotificationModule } from '../notification/notification.module';
import { User } from '../users/entities/user.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { StellarModule } from '../stellar/stellar.module';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { Referral } from './entities/referral.entity';
import { ReferralProcessor } from './referral.processor';
import { ReferralsController } from './referrals.controller';
import { InviteController } from './invite.controller';
import { ReferralService } from './referral.service';
import { ReferralAnalyticsService } from './referral-analytics.service';
import { ReferralAnalyticsProcessor } from './referral-analytics.processor';

@Module({
  imports: [
    NotificationModule,
    StellarModule,
    TypeOrmModule.forFeature([Referral, User, Transaction]),
    BullModule.registerQueue({ name: 'referrals' }),
    CacheModule,
  ],
  controllers: [ReferralsController, InviteController],
  providers: [
    ReferralService,
    ReferralProcessor,
    ReferralAnalyticsService,
    ReferralAnalyticsProcessor,
    JwtGuard,
  ],
  exports: [ReferralService, ReferralAnalyticsService],
})
export class ReferralsModule implements OnModuleInit {
  constructor(
    @InjectQueue('referrals') private readonly referralsQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    // Daily pre-compute of all referral analytics at 01:00 UTC
    await this.referralsQueue.add(
      'compute-referral-analytics',
      {},
      {
        repeat: { cron: '0 1 * * *' },
        jobId: 'compute-referral-analytics-cron',
      },
    );
  }
}
