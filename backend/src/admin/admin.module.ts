import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { Merchant } from '../merchants/entities/merchant.entity';
import { Payment } from '../payments/entities/payment.entity';
import { FeeConfig } from '../fee-config/entities/fee-config.entity';
import { FeeHistory } from '../fee-config/entities/fee-history.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Merchant, Payment, FeeConfig, FeeHistory])],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
