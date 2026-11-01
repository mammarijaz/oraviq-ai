import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { BillingService } from './billing.service';

@ApiTags('Billing')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plan')
  @ApiOperation({ summary: 'Get current subscription plan' })
  getCurrentPlan(@CurrentOrg() orgId: string) {
    return this.billingService.getCurrentPlan(orgId);
  }

  @Get('plans')
  @ApiOperation({ summary: 'List all available plans' })
  getPlans() {
    return this.billingService.getPlans();
  }

  @Get('history')
  @ApiOperation({ summary: 'Get billing event history for the organisation' })
  getBillingHistory(@CurrentOrg() orgId: string) {
    return this.billingService.getBillingHistory(orgId);
  }
}
