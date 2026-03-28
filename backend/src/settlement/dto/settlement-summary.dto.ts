import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class SettlementSummaryDto {
  @ApiProperty({ type: Number })
  @IsNumber()
  @Type(() => Number)
  totalSettledNgn!: number;

  @ApiProperty({ type: Number })
  @IsNumber()
  @Type(() => Number)
  totalSettledUsdc!: number;

  @ApiProperty()
  @IsNumber()
  settlementCount!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  lastSettledAt?: Date;

  @ApiProperty({ type: Number })
  @IsNumber()
  @Type(() => Number)
  pendingNgn!: number;

  @ApiProperty({ type: Number })
  @IsNumber()
  @Type(() => Number)
  pendingUsdc!: number;
}
