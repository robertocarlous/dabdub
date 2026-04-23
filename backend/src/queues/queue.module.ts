import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { QUEUE_LIST } from './queue.constants';
import {
  NotificationQueueProcessor,
  SettlementQueueProcessor,
  StellarMonitorQueueProcessor,
  WebhookQueueProcessor,
} from './queue.processors';

@Module({
  imports: [BullModule.registerQueue(...QUEUE_LIST.map((name) => ({ name })))],
  providers: [
    SettlementQueueProcessor,
    WebhookQueueProcessor,
    NotificationQueueProcessor,
    StellarMonitorQueueProcessor,
  ],
  exports: [BullModule],
})
export class QueueModule {}
