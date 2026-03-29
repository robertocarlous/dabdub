import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum BulkDisbursementStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('bulk_disbursements')
@Index(['userId', 'createdAt'])
export class BulkDisbursement extends BaseEntity {
  @Index()
  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'file_name', length: 255 })
  fileName!: string;

  @Column({ name: 'reference', length: 100, unique: true })
  reference!: string;

  @Column({ name: 'total_items', type: 'int', default: 0 })
  totalItems!: number;

  @Column({ name: 'processed_items', type: 'int', default: 0 })
  processedItems!: number;

  @Column({ name: 'failed_items', type: 'int', default: 0 })
  failedItems!: number;
  
  @Column({ name: 'total_amount_usdc', type: 'numeric', precision: 24, scale: 8, default: 0 })
  totalAmountUsdc!: string;

  @Column({ name: 'status', type: 'enum', enum: BulkDisbursementStatus, default: BulkDisbursementStatus.PENDING })
  status!: BulkDisbursementStatus;
  
  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason!: string | null;
}
