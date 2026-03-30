import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { StakingEntry } from './entities/staking-entry.entity';
import { User } from '../users/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { StakingService } from './staking.service';
import { StakingController, AdminStakingController } from './staking.controller';
import { YieldProcessor, STAKING_QUEUE, DISTRIBUTE_YIELD_JOB } from './staking.processor';
import { TierConfigModule } from '../tier-config/tier-config.module';
import { SorobanModule } from '../soroban/soroban.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([StakingEntry, User, Wallet]),
    BullModule.registerQueue({ name: STAKING_QUEUE }),
    TierConfigModule,
    SorobanModule,
  ],
  providers: [StakingService, YieldProcessor],
  controllers: [StakingController, AdminStakingController],
  exports: [StakingService],
})
export class StakingModule implements OnModuleInit {
  constructor(@InjectQueue(STAKING_QUEUE) private readonly stakingQueue: Queue) {}

  async onModuleInit(): Promise<void> {
    // Register repeatable job: distribute yield daily at 02:00 WAT
    // WAT is UTC+1, so 02:00 WAT = 01:00 UTC
    // Cron format: minute hour day month dayOfWeek
    // 0 1 * * * = every day at 01:00 UTC (02:00 WAT)
    await this.stakingQueue.add(
      DISTRIBUTE_YIELD_JOB,
      {},
      {
        repeat: { cron: '0 1 * * *' },
        jobId: 'distribute-yield-daily',
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    console.log(
      'Staking module initialized: yield distribution job scheduled for 02:00 WAT daily',
    );
  }
}
