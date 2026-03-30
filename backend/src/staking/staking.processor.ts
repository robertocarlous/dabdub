import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import * as Sentry from '@sentry/nestjs';
import { StakingService } from './staking.service';

export const STAKING_QUEUE = 'staking-jobs';
export const DISTRIBUTE_YIELD_JOB = 'distribute-yield';

@Processor(STAKING_QUEUE)
export class YieldProcessor {
  private readonly logger = new Logger(YieldProcessor.name);

  constructor(private readonly stakingService: StakingService) {}

  @Process(DISTRIBUTE_YIELD_JOB)
  async handleDistributeYield(_job: Job): Promise<void> {
    await Sentry.startSpan(
      {
        op: 'bullmq.job',
        name: `process.${STAKING_QUEUE}.${DISTRIBUTE_YIELD_JOB}`,
        attributes: {
          queue: STAKING_QUEUE,
          jobType: DISTRIBUTE_YIELD_JOB,
        },
      },
      async () => {
        try {
          const result = await this.stakingService.distributeYield();
          this.logger.log(
            `Yield distribution completed: ${result.processed} processed, ${result.failed} failed`,
          );
        } catch (err) {
          Sentry.withScope((scope) => {
            scope.setTag('module', 'staking');
            scope.setTag('job', DISTRIBUTE_YIELD_JOB);
            Sentry.captureException(err);
          });
          throw err;
        }
      },
    );
  }
}
