import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { DEFAULT_QUEUE_JOB, QUEUE_NAMES } from './queue.constants';

interface QueueDispatchPayload {
  type?: string;
  payload?: Record<string, unknown>;
}

abstract class BaseQueueProcessor {
  protected readonly logger: Logger;

  protected constructor(name: string) {
    this.logger = new Logger(name);
  }

  protected logJob(job: Job<QueueDispatchPayload>): void {
    this.logger.debug(
      `Processed queue="${job.queue.name}" job="${job.name}" id="${job.id}" type="${job.data?.type ?? 'unknown'}"`,
    );
  }
}

@Processor(QUEUE_NAMES.settlement)
export class SettlementQueueProcessor extends BaseQueueProcessor {
  constructor() {
    super(SettlementQueueProcessor.name);
  }

  @Process(DEFAULT_QUEUE_JOB)
  handle(job: Job<QueueDispatchPayload>): void {
    this.logJob(job);
  }
}

@Processor(QUEUE_NAMES.webhook)
export class WebhookQueueProcessor extends BaseQueueProcessor {
  constructor() {
    super(WebhookQueueProcessor.name);
  }

  @Process(DEFAULT_QUEUE_JOB)
  handle(job: Job<QueueDispatchPayload>): void {
    this.logJob(job);
  }
}

@Processor(QUEUE_NAMES.notification)
export class NotificationQueueProcessor extends BaseQueueProcessor {
  constructor() {
    super(NotificationQueueProcessor.name);
  }

  @Process(DEFAULT_QUEUE_JOB)
  handle(job: Job<QueueDispatchPayload>): void {
    this.logJob(job);
  }
}

@Processor(QUEUE_NAMES.stellarMonitor)
export class StellarMonitorQueueProcessor extends BaseQueueProcessor {
  constructor() {
    super(StellarMonitorQueueProcessor.name);
  }

  @Process(DEFAULT_QUEUE_JOB)
  handle(job: Job<QueueDispatchPayload>): void {
    this.logJob(job);
  }
}
