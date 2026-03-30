import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { StakingService } from './staking.service';
import { StakeDto, UnstakeDto, StakingBalanceDto, StakingHistoryDto } from './dto/staking.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CreditYieldDto } from './dto/staking.dto';

@Controller('staking')
export class StakingController {
  constructor(private readonly stakingService: StakingService) {}

  /**
   * POST /staking/stake
   * Stake USDC amount. User must be authenticated.
   */
  @UseGuards(JwtAuthGuard)
  @Post('stake')
  @HttpCode(HttpStatus.CREATED)
  async stake(
    @Req() req: FastifyRequest,
    @Body() dto: StakeDto,
  ) {
    const userId = (req.user as any).id;
    if (!userId) {
      throw new BadRequestException('User ID not found in token');
    }

    const entry = await this.stakingService.stake(userId, dto.amount);
    return {
      message: 'Staking successful',
      entry: {
        id: entry.id,
        action: entry.action,
        amountUsdc: entry.amountUsdc,
        balanceBeforeUsdc: entry.balanceBeforeUsdc,
        balanceAfterUsdc: entry.balanceAfterUsdc,
        txHash: entry.txHash,
        createdAt: entry.createdAt,
      },
    };
  }

  /**
   * POST /staking/unstake
   * Unstake USDC amount. Checks lockup period.
   */
  @UseGuards(JwtAuthGuard)
  @Post('unstake')
  @HttpCode(HttpStatus.OK)
  async unstake(
    @Req() req: FastifyRequest,
    @Body() dto: UnstakeDto,
  ) {
    const userId = (req.user as any).id;
    if (!userId) {
      throw new BadRequestException('User ID not found in token');
    }

    const entry = await this.stakingService.unstake(userId, dto.amount);
    return {
      message: 'Unstaking successful',
      entry: {
        id: entry.id,
        action: entry.action,
        amountUsdc: entry.amountUsdc,
        balanceBeforeUsdc: entry.balanceBeforeUsdc,
        balanceAfterUsdc: entry.balanceAfterUsdc,
        txHash: entry.txHash,
        createdAt: entry.createdAt,
      },
    };
  }

  /**
   * GET /staking/balance
   * Get user's staking balance and metadata.
   */
  @UseGuards(JwtAuthGuard)
  @Get('balance')
  async getBalance(@Req() req: FastifyRequest): Promise<StakingBalanceDto> {
    const userId = (req.user as any).id;
    if (!userId) {
      throw new BadRequestException('User ID not found in token');
    }

    return this.stakingService.getStakingBalance(userId);
  }

  /**
   * GET /staking/history
   * Get user's staking transaction history (paginated).
   */
  @UseGuards(JwtAuthGuard)
  @Get('history')
  async getHistory(
    @Req() req: FastifyRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<StakingHistoryDto> {
    const userId = (req.user as any).id;
    if (!userId) {
      throw new BadRequestException('User ID not found in token');
    }

    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;

    if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Invalid page or limit parameters');
    }

    return this.stakingService.getStakingHistory(userId, pageNum, limitNum);
  }
}

/**
 * Admin endpoints for staking management.
 */
@Controller('admin/staking')
@UseGuards(AdminGuard)
export class AdminStakingController {
  constructor(private readonly stakingService: StakingService) {}

  /**
   * POST /admin/staking/credit-yield
   * Manually credit yield to a user's staked balance (admin only).
   */
  @Post('credit-yield')
  @HttpCode(HttpStatus.OK)
  async creditYield(@Body() dto: CreditYieldDto) {
    const entry = await this.stakingService.adminCreditYield(dto.userId, dto.amount);
    return {
      message: 'Yield credited successfully',
      entry: {
        id: entry.id,
        action: entry.action,
        amountUsdc: entry.amountUsdc,
        balanceBeforeUsdc: entry.balanceBeforeUsdc,
        balanceAfterUsdc: entry.balanceAfterUsdc,
        txHash: entry.txHash,
        createdAt: entry.createdAt,
      },
    };
  }
}
