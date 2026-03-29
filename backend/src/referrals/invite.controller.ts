import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { ReferralService } from './referral.service';
import { ReferralAnalyticsService } from './referral-analytics.service';

@ApiTags('Referrals')
@Controller({ path: 'invite', version: '1' })
export class InviteController {
  constructor(
    private readonly referralService: ReferralService,
    private readonly analyticsService: ReferralAnalyticsService,
  ) {}

  /**
   * Public click-tracking endpoint. Increments Redis counter (no DB write)
   * then redirects to the registration page with the ref code in the query.
   */
  @Public()
  @Get('track')
  @ApiOperation({ summary: 'Track invite link click and redirect to registration' })
  @ApiQuery({ name: 'ref', required: true, description: 'Referral code' })
  async trackClick(
    @Query('ref') refCode: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!refCode) {
      throw new BadRequestException('ref code required');
    }

    await this.referralService.assertReferralCodeExists(refCode);
    await this.analyticsService.incrementClick(refCode);

    const base = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    res.redirect(`${base}/register?ref=${encodeURIComponent(refCode)}`);
  }
}
