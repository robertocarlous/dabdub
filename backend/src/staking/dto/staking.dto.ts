import { IsString, IsNotEmpty, IsNumberString, IsOptional } from 'class-validator';

export class StakeDto {
  @IsNotEmpty()
  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class UnstakeDto {
  @IsNotEmpty()
  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreditYieldDto {
  @IsNotEmpty()
  @IsString()
  userId!: string;

  @IsNotEmpty()
  @IsNumberString()
  amount!: string;
}

export class StakingBalanceDto {
  userId: string;
  stakedBalanceUsdc: string;
  totalYieldUsdc: string;
  lastStakeAt: Date | null;
  nextUnstakeEligibleAt: Date | null;
}

export class StakingHistoryEntryDto {
  id: string;
  action: string;
  amountUsdc: string;
  balanceBeforeUsdc: string;
  balanceAfterUsdc: string;
  txHash: string | null;
  createdAt: Date;
}

export class StakingHistoryDto {
  entries: StakingHistoryEntryDto[];
  total: number;
  page: number;
  limit: number;
}
