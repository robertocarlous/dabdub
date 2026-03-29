import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile
} from '@nestjs/common';
import { ApiOperation, ApiTags, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OffRampService } from './offramp.service';
import {
  ExecuteOffRampDto,
  OffRampHistoryQueryDto,
  OffRampPreviewResponseDto,
  OffRampResponseDto,
  PreviewOffRampDto,
} from './dto/offramp.dto';
import { BulkDisbursementResponseDto } from './dto/bulk-disbursement.dto';

@ApiTags('Off-Ramp')
@UseGuards(JwtAuthGuard)
@Controller('offramp')
export class OffRampController {
  constructor(private readonly offRampService: OffRampService) {}

  @Post('preview')
  @ApiOperation({ summary: 'Preview off-ramp: get NGN amount at current rate' })
  preview(
    @Body() dto: PreviewOffRampDto,
    @Req() req: any,
  ): Promise<OffRampPreviewResponseDto> {
    return this.offRampService.preview(req.user.id, dto);
  }

  @Post('execute')
  @ApiOperation({ summary: 'Execute off-ramp: convert USDC to NGN and send to bank' })
  execute(
    @Body() dto: ExecuteOffRampDto,
    @Req() req: any,
  ): Promise<OffRampResponseDto> {
    return this.offRampService.execute(req.user.id, dto);
  }

  @Get('history')
  @ApiOperation({ summary: 'Get paginated off-ramp history' })
  history(
    @Query() query: OffRampHistoryQueryDto,
    @Req() req: any,
  ) {
    return this.offRampService.getHistory(req.user.id, query.page, query.limit);
  }

  @Get(':referenceId/status')
  @ApiOperation({ summary: 'Poll status of a specific off-ramp' })
  status(
    @Param('referenceId') referenceId: string,
    @Req() req: any,
  ): Promise<OffRampResponseDto> {
    return this.offRampService.getStatus(req.user.id, referenceId);
  }

  @Post('bulk/csv')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @ApiOperation({ summary: 'Upload a CSV for bulk disbursements' })
  uploadBulk(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: any,
  ): Promise<BulkDisbursementResponseDto> {
    return this.offRampService.uploadBulkDisbursement(req.user.id, file);
  }

  @Get('bulk/:id')
  @ApiOperation({ summary: 'Get bulk disbursement aggregate status' })
  getBulkStatus(
    @Param('id') id: string,
    @Req() req: any,
  ): Promise<BulkDisbursementResponseDto> {
    return this.offRampService.getBulkDisbursementStatus(req.user.id, id);
  }
}
