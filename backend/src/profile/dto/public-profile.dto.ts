import { ApiProperty } from '@nestjs/swagger';

/**
 * Public profile for pay pages, send confirmations
 * No email, phone, financial data
 */
export class PublicProfileDto {
  @ApiProperty({ example: 'johndoe' })
  username!: string;

  @ApiProperty({ example: 'John Doe', nullable: true })
  displayName!: string | null;

  @ApiProperty({ example: 'https://r2.dabdub.com/avatar/user123/image.jpg?token=...', nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ example: 'Crypto enthusiast', nullable: true })
  bio!: string | null;

  @ApiProperty({ enum: ['SILVER', 'GOLD', 'BLACK'], example: 'SILVER' })
  tier!: string;

  @ApiProperty({ example: false })
  isMerchant!: boolean;

  @ApiProperty({ example: false })
  isVerified!: boolean;

  @ApiProperty({ example: '2026-01-01T00:00:00Z' })
  joinedAt!: Date;
}

