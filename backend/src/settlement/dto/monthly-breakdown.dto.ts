import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class MonthlyBreakdownDto {
  @ApiProperty()
  month!: string; // '2024-10'

  @ApiProperty({ type: Number })
  @IsNumber()
  @Type(() => Number)
  totalNgn!: number;

  @ApiProperty({ type: Number })
  @IsNumber()
  @Type(() => Number)
  totalUsdc!: number;

  @ApiProperty()
  @IsNumber()
  count!: number;
}
