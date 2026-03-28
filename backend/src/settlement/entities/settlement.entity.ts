import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { BankAccount } from '../../bank-accounts/entities/bank-account.entity';
import { Merchant } from '../../merchants/entities/merchant.entity';

export enum SettlementStatus {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  SETTLED = 'settled',
  FAILED = 'failed',
}

@Entity('settlements')
@Index(['merchantId', 'createdAt'], { name: 'IDX_settlements_merchant_created_at' })
@Index(['status', 'createdAt'], { name: 'IDX_settlements_status_created_at' })
export class Settlement extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  merchantId!: string;

  @Column({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'usdc_amount', type: 'numeric', precision: 18, scale: 6 })
  usdcAmount!: number;

  @Column({ name: 'ngn_amount', type: 'numeric', precision: 18, scale: 2 })
  ngnAmount!: number;

  @Column({ type: 'numeric', precision: 18, scale: 6 })
  rate!: number;

  @Column({ name: 'status', type: 'enum', enum: SettlementStatus })
  status!: SettlementStatus;

  @Column({ name: 'bank_account_id' })
  bankAccountId!: string;

  @Column({ name: 'provider_ref', nullable: true })
  providerRef?: string;

  @Column({ name: 'failure_reason', nullable: true })
  failureReason?: string;

  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true })
  settledAt?: Date;

  // Relations
  @ManyToOne(() => Merchant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'merchant_id' })
  merchant!: Merchant;

  @ManyToOne(() => BankAccount)
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount!: BankAccount;
}
