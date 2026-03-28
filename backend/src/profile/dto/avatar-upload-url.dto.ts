import { ApiProperty } from '@nestjs/swagger';
import { IsString, Min, Max } from 'class-validator';

/**
 * Request for avatar upload presigned URL
 */
export class AvatarUploadUrlDto {
  @ApiProperty({ example: 'image/jpeg' })
  @IsString()
  mimeType!: string;

  @ApiProperty({ example: 5242880, minimum: 1, maximum: 10485760 })
  @Min(1)
  @Max(10 * 1024 * 1024) // 10MB
  sizeBytes!: number;
}

/**
 * Response with presigned PUT URL and key
 */
export class AvatarUploadUrlResponse {
  @ApiProperty({ example: 'https://accountid.r2...PUT?...' })
  url!: string;

  @ApiProperty({ example: 'avatar/user123/uuid.jpg' })
  key!: string;
}

