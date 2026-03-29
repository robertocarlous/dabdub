import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { FIRE_RATE_ALERT_JOB, RATE_ALERT_QUEUE, FireRateAlertPayload } from './rate-alert.service';
import { NotificationService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notifications.types';
import { PushService } from '../push/push.service';
import { EmailService } from '../email/email.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RateAlert } from './entities/rate-alert.entity';

@Processor(RATE_ALERT_QUEUE)
export class RateAlertProcessor {
  private readonly logger = new Logger(RateAlertProcessor.name);

  constructor(
    private readonly notificationService: NotificationService,
    private readonly pushService: PushService,
    private readonly emailService: EmailService,
    @InjectRepository(RateAlert)
    private readonly alertRepo: Repository<RateAlert>,
  ) {}

  @Process(FIRE_RATE_ALERT_JOB)
  async handleFireAlert(job: Job<FireRateAlertPayload>): Promise<void> {
    const { alertId, userId, targetRate, currentRate } = job.data;
    const message = `NGN/USDC rate hit your target of ₦${targetRate}. Current rate: ₦${currentRate}`;

    const channels: string[] = [];

    try {
      await this.pushService.send(userId, {
        title: 'Rate Alert Triggered',
        body: message,
      });
      channels.push('push');
    } catch (err) {
      this.logger.warn(`Push failed for alert ${alertId}: ${(err as Error).message}`);
    }

    try {
      await this.notificationService.create(
        userId,
        NotificationType.SYSTEM,
        'Rate Alert Triggered',
        message,
        { alertId, targetRate, currentRate },
      );
      channels.push('in_app');
    } catch (err) {
      this.logger.warn(`In-app notification failed for alert ${alertId}: ${(err as Error).message}`);
    }

    try {
      // email address resolved at send time by the email processor via userId lookup
      await this.emailService.queue(
        userId, // treated as userId; email processor resolves address
        'RATE_ALERT_TRIGGERED',
        { targetRate, currentRate, message },
        userId,
      );
      channels.push('email');
    } catch (err) {
      this.logger.warn(`Email failed for alert ${alertId}: ${(err as Error).message}`);
    }

    await this.alertRepo.update(alertId, { notifiedVia: channels });
    this.logger.log(`Rate alert ${alertId} fired via: ${channels.join(', ')}`);
  }
}
