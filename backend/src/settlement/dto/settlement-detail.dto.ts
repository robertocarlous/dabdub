import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDate, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { SettlementStatus } from '../entities/settlement.entity';

export class BankAccountDto {
  @ApiProperty()
  @IsString()
  bankName!: string;

  @ApiProperty()
  @IsString()
  accountNumber!: string;

  @ApiProperty()
  @IsString()
  accountName!: string;
}

export class SettlementDetailDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiProperty({ type: Number })
  @IsNumber()
  @Type(() => Number)
  usdcAmount!: number;

  @ApiProperty({ type: Number })
  @IsNumber()
  @Type(() => Number)
  ngnAmount!: number;

  @ApiProperty({ type: Number })
  @IsNumber()
  @Type(() => Number)
  rate!: number;

  @ApiProperty()
  @IsEnum(SettlementStatus)
  status!: SettlementStatus;

  @ApiProperty({ type: BankAccountDto })
  bankAccount!: BankAccountDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  providerRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  settledAt?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  createdAt?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  failureReason?: string;
}
