import { Process, Processor } from '@nestjs/bull';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import csv = require('csv-parser');
import { BulkDisbursement, BulkDisbursementStatus } from './entities/bulk-disbursement.entity';
import { OffRampService } from './offramp.service';

@Processor('offramp-jobs')
export class BulkDisbursementProcessor {
  private readonly logger = new Logger(BulkDisbursementProcessor.name);

  constructor(
    @InjectRepository(BulkDisbursement)
    private readonly bulkDisbursementRepo: Repository<BulkDisbursement>,
    private readonly offRampService: OffRampService,
  ) {}

  @Process('bulk-disbursement')
  async handleBulkDisbursement(job: Job<{ bulkDisbursementId: string; filePath: string; userId: string }>) {
    const { bulkDisbursementId, filePath, userId } = job.data;
    
    this.logger.log(`Starting processing for bulk disbursement: ${bulkDisbursementId}`);
    
    const bulkRecord = await this.bulkDisbursementRepo.findOne({ where: { id: bulkDisbursementId } });
    if (!bulkRecord) {
      this.logger.error(`BulkDisbursement ${bulkDisbursementId} not found`);
      return;
    }

    await this.bulkDisbursementRepo.update(bulkDisbursementId, { status: BulkDisbursementStatus.PROCESSING });

    const rows: any[] = [];
    
    try {
      await new Promise<void>((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (data) => rows.push(data))
          .on('end', () => resolve())
          .on('error', (err) => reject(err));
      });
    } catch (err: any) {
      await this.bulkDisbursementRepo.update(bulkDisbursementId, {
        status: BulkDisbursementStatus.FAILED,
        failureReason: `Failed to parse CSV: ${err.message}`,
      });
      return;
    }

    await this.bulkDisbursementRepo.update(bulkDisbursementId, { totalItems: rows.length });

    let processed = 0;
    let failed = 0;
    let totalUsdc = 0;

    for (const row of rows) {
      try {
        const amountUsdc = parseFloat(row.amountUsdc || row.amount);
        const bankCode = row.bankCode;
        const accountNumber = row.accountNumber;
        const accountName = row.accountName || 'Unknown Configured';

        if (isNaN(amountUsdc) || !bankCode || !accountNumber) {
          throw new Error('Invalid row format (missing amount, bankCode or accountNumber)');
        }

        await this.offRampService.executeBulkItem(userId, {
          amountUsdc,
          bankCode,
          accountNumber,
          accountName,
          bulkDisbursementId,
        });

        processed++;
        totalUsdc += amountUsdc;
      } catch (err: any) {
        this.logger.error(`Row offramp failed: ${err.message}`);
        failed++;
      }
      
      // Periodically update progression
      if ((processed + failed) % 10 === 0) {
        await this.bulkDisbursementRepo.update(bulkDisbursementId, {
          processedItems: processed,
          failedItems: failed,
          totalAmountUsdc: totalUsdc.toFixed(8)
        });
      }
    }

    await this.bulkDisbursementRepo.update(bulkDisbursementId, {
      processedItems: processed,
      failedItems: failed,
      totalAmountUsdc: totalUsdc.toFixed(8),
      status: failed === rows.length ? BulkDisbursementStatus.FAILED : BulkDisbursementStatus.COMPLETED,
    });

    // Cleanup CSV
    try {
      await fs.promises.unlink(filePath);
    } catch (e) {
      this.logger.warn(`Failed to unlink temp file ${filePath}`);
    }

    this.logger.log(`Finished bulk disbursement ${bulkDisbursementId}: ${processed} success, ${failed} failed`);
  }
}
