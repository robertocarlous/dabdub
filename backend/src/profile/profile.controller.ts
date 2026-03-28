import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  Req,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ProfileService } from './profile.service';
import { ProfileDto } from './dto/profile.dto';
import { PublicProfileDto } from './dto/public-profile.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { AvatarUploadUrlDto, AvatarUploadUrlResponse } from './dto/avatar-upload-url.dto';

@ApiTags('profile')
@Controller({ path: 'profile', version: '1' })
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get authenticated user full profile' })
  @ApiResponse({ status: 200, type: ProfileDto })
  getProfile(@Req() req: any): Promise<ProfileDto> {
    return this.profileService.getProfile(req.user.id);
  }

  @Patch()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update authenticated user profile' })
  @ApiResponse({ status: 200, type: ProfileDto })
  updateProfile(
    @Req() req: any,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileDto> {
    return this.profileService.updateProfile(req.user.id, dto);
  }

  @Get(':username')
  @ApiOperation({ summary: 'Get public profile by username (no auth)' })
  @ApiResponse({ status: 200, type: PublicProfileDto })
  @ApiResponse({ status: 404, description: 'Profile not found' })
  getPublicProfile(@Param('username') username: string): Promise<PublicProfileDto> {
    return this.profileService.getPublicProfile(username);
  }

  @Post('avatar/upload-url')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get presigned R2 PUT URL for avatar upload' })
  @ApiResponse({ status: 200, type: AvatarUploadUrlResponse })
  getAvatarUploadUrl(
    @Req() req: any,
    @Body() dto: AvatarUploadUrlDto,
  ): Promise<AvatarUploadUrlResponse> {
    return this.profileService.getAvatarUploadUrl(req.user.id, dto);
  }
}

