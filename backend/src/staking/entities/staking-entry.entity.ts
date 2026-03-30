import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum StakingAction {
  STAKE = 'stake',
  UNSTAKE = 'unstake',
  CREDIT = 'credit',
}

@Entity('staking_entries')
@Index(['userId', 'createdAt'], { order: { createdAt: 'DESC' } })
@Index(['userId', 'action'])
export class StakingEntry extends BaseEntity {
  @Column({ name: 'user_id' })
  userId!: string;

  @Column({
    type: 'enum',
    enum: StakingAction,
  })
  action!: StakingAction;

  @Column({
    name: 'amount_usdc',
    type: 'varchar',
  })
  amountUsdc!: string;

  @Column({
    name: 'balance_before_usdc',
    type: 'varchar',
  })
  balanceBeforeUsdc!: string;

  @Column({
    name: 'balance_after_usdc',
    type: 'varchar',
  })
  balanceAfterUsdc!: string;

  @Column({
    name: 'tx_hash',
    type: 'varchar',
    nullable: true,
  })
  txHash!: string | null;
}
