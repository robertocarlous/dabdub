import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { User, KycStatus } from '../users/entities/user.entity';
import { BalanceService } from '../balance/balance.service';
import { UploadService } from '../uploads/upload.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileDto } from './dto/profile.dto';
import { PublicProfileDto } from './dto/public-profile.dto';
import { AvatarUploadUrlDto } from './dto/avatar-upload-url.dto';

describe('ProfileService', () => {
  let service: ProfileService;
  let userRepo: Repository<User>;
  let balanceService: BalanceService;
  let uploadService: UploadService;

  const mockUser = (): User => ({
    id: 'user1',
    username: 'testuser',
    email: 'test@example.com',
    displayName: 'Test User',
    bio: 'Short bio',
    avatarKey: 'avatar/test/image.jpg',
    twitterHandle: 'testuser',
    instagramHandle: 'testuser',
    tier: 'SILVER' as any,
    kycStatus: KycStatus.NONE as any,
    isMerchant: false,
    createdAt: new Date(),
    // ... other fields
  });

  const mockBalance = { balanceUsdc: '1.00', totalUsdc: '1.00' /* simplified */ };

  const mockUploadResponse = { url: 'https://r2-put...', key: 'avatar/key.jpg' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProfileService,
        {
          provide: getRepositoryToken(User),
          useClass: Repository,
        },
        {
          provide: BalanceService,
          useValue: { getBalance: jest.fn() },
        },
        {
          provide: UploadService,
          useValue: { getPresignedUrl: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<ProfileService>(ProfileService);
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
    balanceService = module.get<BalanceService>(BalanceService);
    uploadService = module.get<UploadService>(UploadService);
  });

  describe('getProfile', () => {
    it('should return full profile with balance', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser());
      jest.spyOn(balanceService, 'getBalance').mockResolvedValue(mockBalance as any);

      const result = await service.getProfile('user1');

      expect(result).toBeInstanceOf(ProfileDto);
      expect(balanceService.getBalance).toHaveBeenCalledWith('user1');
    });

    it('should throw NotFoundException', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);

      await expect(service.getProfile('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('should update profile fields', async () => {
      const dto: UpdateProfileDto = { bio: 'New bio <160 chars' };
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser());
      jest.spyOn(userRepo, 'save').mockResolvedValue(mockUser() as User);
      jest.spyOn(service as any, 'getProfile').mockResolvedValue({} as ProfileDto);

      const result = await service.updateProfile('user1', dto);

      expect(userRepo.save).toHaveBeenCalled();
      expect(result).toBeInstanceOf(ProfileDto);
    });

    it('should throw BadRequestException for bio >160 chars', async () => {
      const dto: UpdateProfileDto = { 
        bio: 'a'.repeat(161)
      };
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser());

      await expect(service.updateProfile('user1', dto)).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);

      await expect(service.updateProfile('nonexistent', {} as UpdateProfileDto)).rejects.toThrow(NotFoundException);
    });
  });

  describe('getPublicProfile', () => {
    it('should return public profile no email leak', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(mockUser());

      const result = await service.getPublicProfile('testuser');

      expect(result).toBeInstanceOf(PublicProfileDto);
      expect(result.username).toBe('testuser');
      expect(result.bio).toBe('Short bio');
      expect(result.avatarUrl).toContain('pub-r2.dabdub.com');
      expect('email' in result).toBe(false); // no leak
    });

    it('should set isVerified for approved kyc', async () => {
      const approvedUser = mockUser();
      approvedUser.kycStatus = KycStatus.APPROVED;
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(approvedUser as User);

      const result = await service.getPublicProfile('testuser');

      expect(result.isVerified).toBe(true);
    });
  });

  describe('getAvatarUploadUrl', () => {
    it('should delegate to upload service', async () => {
      const dto: AvatarUploadUrlDto = { mimeType: 'image/jpeg', sizeBytes: 1024 * 1024 };
      jest.spyOn(uploadService, 'getPresignedUrl').mockResolvedValue(mockUploadResponse as any);

      const result = await service.getAvatarUploadUrl('user1', dto);

      expect(uploadService.getPresignedUrl).toHaveBeenCalledWith('user1', expect.objectContaining({
        purpose: 'MERCHANT_LOGO',
        mimeType: 'image/jpeg',
        sizeBytes: 1048576,
      }));
    });
  });
});

