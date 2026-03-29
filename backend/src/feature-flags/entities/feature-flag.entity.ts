import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';

export enum FeatureFlagStatus {
  DISABLED = 'disabled',
  ENABLED = 'enabled',
  PERCENTAGE = 'percentage',
  TIER = 'tier',
  USERS = 'users',
}

@Entity('feature_flags')
export class FeatureFlag extends BaseEntity {
  @Column({ type: 'varchar', length: 100, unique: true })
  key!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({
    type: 'enum',
    enum: FeatureFlagStatus,
  })
  status!: FeatureFlagStatus;

  @Column({ type: 'int', nullable: true, default: null })
  percentage!: number | null;

  @Column({ name: 'enabled_tiers', type: 'text', array: true, nullable: true })
  enabledTiers!: string[] | null;

  @Column({ name: 'enabled_user_ids', type: 'text', array: true, nullable: true })
  enabledUserIds!: string[] | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true, default: null })
  createdBy!: string | null;
}
