import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BulkDisbursement, BulkDisbursementStatus } from '../entities/bulk-disbursement.entity';

export class BulkDisbursementResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() reference!: string;
  @ApiProperty() fileName!: string;
  @ApiProperty() totalItems!: number;
  @ApiProperty() processedItems!: number;
  @ApiProperty() failedItems!: number;
  @ApiProperty() totalAmountUsdc!: string;
  @ApiProperty({ enum: BulkDisbursementStatus }) status!: BulkDisbursementStatus;
  @ApiPropertyOptional() failureReason!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;

  static from(o: BulkDisbursement): BulkDisbursementResponseDto {
    const dto = new BulkDisbursementResponseDto();
    dto.id = o.id;
    dto.reference = o.reference;
    dto.fileName = o.fileName;
    dto.totalItems = o.totalItems;
    dto.processedItems = o.processedItems;
    dto.failedItems = o.failedItems;
    dto.totalAmountUsdc = o.totalAmountUsdc;
    dto.status = o.status;
    dto.failureReason = o.failureReason;
    dto.createdAt = o.createdAt;
    dto.updatedAt = o.updatedAt;
    return dto;
  }
}
