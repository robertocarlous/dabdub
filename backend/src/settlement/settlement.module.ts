import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Settlement } from './entities/settlement.entity';
import { BankAccountsModule } from '../bank-accounts/bank-accounts.module';
import { SettlementHistoryService } from './settlement-history.service';
import { SettlementController } from './settlement.controller';
import { MerchantsModule } from '../merchants/merchants.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Settlement]),
    BankAccountsModule,
    MerchantsModule,
  ],
  controllers: [SettlementController],
  providers: [SettlementHistoryService],
  exports: [SettlementHistoryService],
})
export class SettlementModule {}
