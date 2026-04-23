import { Injectable, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { WaitlistEntry } from './entities/waitlist.entity';

export class JoinWaitlistDto {
  @IsEmail() @Transform(({ value }) => value?.trim()) email: string;
  @IsOptional() @IsString() @Transform(({ value }) => value?.trim()) username?: string;
  @IsOptional() @IsString() @Transform(({ value }) => value?.trim()) businessName?: string;
  @IsOptional() @IsString() @Transform(({ value }) => value?.trim()) country?: string;
}

@Injectable()
export class WaitlistService {
  constructor(
    @InjectRepository(WaitlistEntry)
    private waitlistRepo: Repository<WaitlistEntry>,
  ) {}

  async join(dto: JoinWaitlistDto) {
    const existing = await this.waitlistRepo.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already on waitlist');

    const entry = this.waitlistRepo.create(dto);
    return this.waitlistRepo.save(entry);
  }

  async checkUsername(username: string): Promise<{ available: boolean }> {
    const existing = await this.waitlistRepo.findOne({ where: { username } });
    return { available: !existing };
  }

  async getStats() {
    const total = await this.waitlistRepo.count();
    return { total };
  }
}
