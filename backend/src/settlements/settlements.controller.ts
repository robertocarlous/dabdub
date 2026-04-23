import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiResponse,
} from '@nestjs/swagger';
import { SettlementsService } from './settlements.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('settlements')
@ApiBearerAuth('bearer')
@UseGuards(JwtAuthGuard)
@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  @Get()
  @ApiOperation({ summary: 'List settlements' })
  @ApiOkResponse({ description: 'Paginated settlements' })
  @ApiUnauthorizedResponse({ description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 500, description: 'Internal server error' })
  findAll(@Request() req: { user: { merchantId: string } }, @Query() pagination: PaginationDto) {
    return this.settlementsService.findAll(req.user.merchantId, pagination.page, pagination.limit);
  }
}
