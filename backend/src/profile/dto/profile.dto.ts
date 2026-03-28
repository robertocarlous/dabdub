import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { User } from '../../users/entities/user.entity';
import { BalanceDto } from '../../balance/dto/balance.dto';
import { KycStatus } from '../../users/entities/user.entity';
import { TierName } from '../../tier-config/entities/tier-config.entity';

/**
 * Full authenticated profile DTO
 */
export class ProfileDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  email!: string;

  @ApiProperty({ example: 'johndoe' })
  username!: string;

  @ApiProperty({ example: 'John Doe', nullable: true })
  displayName!: string | null;

  @ApiProperty({ example: '+2348012345678', nullable: true })
  phone!: string | null;

  @ApiProperty({ example: 'Crypto enthusiast', nullable: true })
  bio!: string | null;

  @ApiProperty({ example: 'avatar/user123/image.jpg', nullable: true })
  avatarKey!: string | null;

  @ApiProperty({ example: 'johndoe', nullable: true })
  twitterHandle!: string | null;

  @ApiProperty({ example: 'johndoe', nullable: true })
  instagramHandle!: string | null;

  @ApiProperty({ enum: TierName, example: TierName.SILVER })
  tier!: TierName;

  @ApiProperty({ enum: KycStatus, example: KycStatus.NONE })
  kycStatus!: KycStatus;

  @ApiProperty({ example: false })
  isMerchant!: boolean;

  @ApiProperty({ example: false })
  emailVerified!: boolean;

  @ApiProperty({ example: false })
  phoneVerified!: boolean;

  @ApiProperty({ example: false })
  hasPin!: boolean;

  @ApiProperty({ example: 0 })
  points!: number;

  @ApiProperty({ example: 'JOHNDOE' })
  referralCode!: string;

  @ApiProperty({ example: 'GABCDE...XYZ' })
  stellarAddress!: string;

  balance!: BalanceDto;

  @Exclude()
  passwordHash?: never;

  static fromEntity(user: User, balance: BalanceDto): ProfileDto {
    const dto = new ProfileDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.username = user.username;
    dto.displayName = user.displayName;
    dto.phone = user.phone;
    dto.bio = user.bio;
    dto.avatarKey = user.avatarKey;
    dto.twitterHandle = user.twitterHandle;
    dto.instagramHandle = user.instagramHandle;
    dto.tier = user.tier;
    dto.kycStatus = user.kycStatus;
    dto.isMerchant = user.isMerchant;
    dto.emailVerified = user.emailVerified;
    dto.phoneVerified = user.phoneVerified;
    dto.hasPin = !!user.pinHash;
    dto.points = 0; // TODO: from points service
    dto.referralCode = 'TEMP'; // TODO: generate/store
    dto.stellarAddress = 'TEMP_STELLAR'; // TODO: from wallets
    dto.balance = balance;
    return dto;
  }
}

