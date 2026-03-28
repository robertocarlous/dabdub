import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Transform } from 'class-transformer';
import { SettlementStatus } from '../entities/settlement.entity';

export class SettlementsQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 10 })
  @IsOptional()
  @Type(() => Number)
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ enum: SettlementStatus })
  @IsOptional()
  @IsEnum(SettlementStatus)
  status?: SettlementStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value && new Date(value))
  dateFrom?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value && new Date(value))
  dateTo?: Date;
}
