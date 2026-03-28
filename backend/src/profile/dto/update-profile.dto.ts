import { IsOptional, IsString, MaxLength, Matches, IsAlphanumeric } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for updating profile (PATCH /profile)
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ 
    description: 'Display name (max 100 chars)', 
    example: 'John Doe',
    maxLength: 100 
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ 
    description: 'Bio (max 160 chars)', 
    example: 'Crypto enthusiast and developer',
    maxLength: 160 
  })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  bio?: string;

  @ApiPropertyOptional({ 
    description: 'R2 object key from /uploads/presign (avatar image)',
    example: 'avatar/user123/550e8400-e29b-41d4-a716-446655440000.jpg'
  })
  @IsOptional()
  @IsString()
  avatarKey?: string;

  @ApiPropertyOptional({ 
    description: 'Twitter handle without @',
    example: 'johndoe',
    pattern: '^[a-zA-Z0-9_]{1,15}$'
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_]{1,15}$/, { message: 'Twitter handle must be 1-15 alphanumeric or underscore' })
  twitterHandle?: string;

  @ApiPropertyOptional({ 
    description: 'Instagram handle',
    example: 'johndoe',
    pattern: '^[a-zA-Z0-9_.]{1,30}$'
  })
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9_.]{1,30}$/, { message: 'Instagram handle must be 1-30 alphanumeric, dot, or underscore' })
  instagramHandle?: string;
}

