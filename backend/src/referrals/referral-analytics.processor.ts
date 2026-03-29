import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { ReferralAnalyticsService } from './referral-analytics.service';

@Processor('referrals')
export class ReferralAnalyticsProcessor {
  private readonly logger = new Logger(ReferralAnalyticsProcessor.name);

  constructor(private readonly analyticsService: ReferralAnalyticsService) {}

  @Process('compute-referral-analytics')
  async handleComputeAnalytics(job: Job): Promise<void> {
    this.logger.log('Computing referral analytics cache');
    await this.analyticsService.computeAllAnalytics();
    this.logger.log('Referral analytics cache updated');
  }
}
