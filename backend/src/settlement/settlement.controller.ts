import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { RolesGuard } from '../rbac/guards/roles.guard';
import { Roles } from '../rbac/decorators/roles.decorator';
import { Role } from '../rbac/rbac.types';
import { SettlementHistoryService } from './settlement-history.service';
import { SettlementsQueryDto } from './dto/settlements-query.dto';
import { PaginatedSettlements } from './settlement-history.service';
import { SettlementDetailDto } from './dto/settlement-detail.dto';
import { SettlementSummaryDto } from './dto/settlement-summary.dto';
import { MonthlyBreakdownDto } from './dto/monthly-breakdown.dto';

@ApiTags('Settlements')
@ApiBearerAuth()
@Controller('merchant/settlements')
@UseGuards(JwtAuthGuard)
export class SettlementController {
  constructor(private readonly service: SettlementHistoryService) {}

  @Get()
  @ApiOperation({ summary: 'Get paginated merchant settlement history' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'status', enum: String, required: false })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo', required: false })
  @ApiResponse({ type: PaginatedSettlements, isArray: true })
  async getSettlements(
    @CurrentUser() user: User,
    @Query() query: SettlementsQueryDto,
  ): Promise<PaginatedSettlements> {
    // TODO: Get merchantId from user.merchantId or findOne
    const merchantId = user.id; // Placeholder - use proper merchant relation
    return this.service.getMerchantSettlements(merchantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single settlement detail' })
  @ApiResponse({ type: SettlementDetailDto })
  async getSettlement(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<SettlementDetailDto> {
    // Implementation: findOne with merchant check + bank join
    throw new Error('Not implemented');
  }

  @Get('summary')
  @ApiOperation({ summary: 'Get settlement summary stats' })
  @ApiResponse({ type: SettlementSummaryDto })
  async getSummary(@CurrentUser() user: User): Promise<SettlementSummaryDto> {
    const merchantId = user.id; // Placeholder
    return this.service.getSummary(merchantId);
  }

  @Get('breakdown')
  @ApiOperation({ summary: 'Get last 6 months monthly breakdown' })
  @ApiResponse({ type: [MonthlyBreakdownDto] })
  async getBreakdown(@CurrentUser() user: User): Promise<MonthlyBreakdownDto[]> {
    const merchantId = user.id; // Placeholder
    return this.service.getMonthlyBreakdown(merchantId);
  }
}

@ApiTags('Admin Settlements')
@Controller('admin/settlements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.Admin)
export class AdminSettlementController {
  constructor(private readonly service: SettlementHistoryService) {}

  @Get()
  @ApiOperation({ summary: 'Admin: Global settlements list' })
  async adminList(@Query() query: SettlementsQueryDto) {
    // Global query with merchantId filter if provided
    throw new Error('Not implemented');
  }

  @Get('pending')
  @ApiOperation({ summary: 'Admin: Pending settlements for monitoring' })
  async pending() {
    // status IN (queued, processing), ordered by createdAt
    throw new Error('Not implemented');
  }
}
