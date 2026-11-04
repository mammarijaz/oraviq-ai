import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Role, TenantDto } from '@oraviq/shared';
import { Public, Roles } from '../../common/decorators';
import { TenantService } from './tenant.service';

@ApiTags('tenant')
@ApiBearerAuth()
@Controller()
export class TenantController {
  constructor(private readonly tenants: TenantService) {}

  @Get('tenant')
  get() {
    return this.tenants.get();
  }

  @Patch('tenant')
  @Roles('owner', 'admin')
  update(@Body() body: Partial<TenantDto>) {
    return this.tenants.update(body ?? {});
  }

  @Get('team')
  team() {
    return this.tenants.team();
  }

  @Post('team/invite')
  @Roles('owner', 'admin')
  invite(@Body() body: { name: string; email: string; role: Role }) {
    return this.tenants.invite(body ?? ({} as never));
  }

  @Get('setup')
  setup() {
    return this.tenants.setup();
  }

  @Post('setup/number')
  @Roles('owner', 'admin')
  @HttpCode(200)
  provisionNumber() {
    return this.tenants.provisionOraviqNumber();
  }

  @Post('setup/test-call')
  @HttpCode(200)
  testCall() {
    return this.tenants.testCall();
  }

  @Get('connections')
  connections() {
    return this.tenants.connections();
  }

  /** Stripe Connect OAuth redirect target. */
  @Public()
  @Get('connections/stripe/callback')
  async stripeCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    res.redirect(await this.tenants.completeStripeConnect(code, state));
  }

  @Post('connections/:channel/connect')
  @Roles('owner', 'admin')
  connect(@Param('channel') channel: string) {
    return this.tenants.connect(channel);
  }
}
