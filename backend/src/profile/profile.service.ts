import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, KycStatus } from '../users/entities/user.entity';
import { BalanceService } from '../balance/balance.service';
import { UploadService } from '../uploads/upload.service';
import { ProfileDto } from './dto/profile.dto';
import { PublicProfileDto } from './dto/public-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AvatarUploadUrlDto, AvatarUploadUrlResponse } from './dto/avatar-upload-url.dto';
import { UploadPurpose } from '../uploads/entities/file-upload.entity';

/**
 * User-facing profile management service
 */
@Injectable()
export class ProfileService {
  constructor(
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private balanceService: BalanceService,
    private uploadService: UploadService,
  ) {}

  async getProfile(userId: string): Promise<ProfileDto> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }
    const balance = await this.balanceService.getBalance(userId);
    return ProfileDto.fromEntity(user, balance);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<ProfileDto> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    if (dto.bio !== undefined) {
      if (typeof dto.bio === 'string' && dto.bio.length > 160) {
        throw new BadRequestException('Bio must be max 160 characters');
      }
      user.bio = dto.bio;
    }

    if (dto.displayName !== undefined) user.displayName = dto.displayName;
    if (dto.avatarKey !== undefined) user.avatarKey = dto.avatarKey;
    if (dto.twitterHandle !== undefined) user.twitterHandle = dto.twitterHandle;
    if (dto.instagramHandle !== undefined) user.instagramHandle = dto.instagramHandle;

    await this.userRepo.save(user);

    // Refresh with balance
    return this.getProfile(userId);
  }

  async getPublicProfile(username: string): Promise<PublicProfileDto> {
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user) {
      throw new NotFoundException(`Public profile @${username} not found`);
    }

    const avatarUrl = user.avatarKey 
      ? `https://pub-r2.dabdub.com/${user.avatarKey}` // TODO: proper presigned GET or public bucket
      : null;

    return {
      username: user.username,
      displayName: user.displayName,
      avatarUrl,
      bio: user.bio,
      tier: user.tier,
      isMerchant: user.isMerchant,
      isVerified: user.kycStatus === KycStatus.APPROVED,
      joinedAt: user.createdAt,
    };
  }

  async getAvatarUploadUrl(
    userId: string,
    dto: AvatarUploadUrlDto,
  ): Promise<AvatarUploadUrlResponse> {
    // Reuse merchant_logo purpose for images (jpeg/png/webp)
    return this.uploadService.getPresignedUrl(userId, {
      purpose: UploadPurpose.MERCHANT_LOGO,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
    });
  }
}

