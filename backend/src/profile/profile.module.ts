import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalanceModule } from '../balance/balance.module';
import { UploadModule } from '../uploads/upload.module';
import { UsersModule } from '../users/users.module';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    BalanceModule,
    UploadModule,
    UsersModule, // for shared logic if needed
  ],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService], // if other modules need
})
export class ProfileModule {}

