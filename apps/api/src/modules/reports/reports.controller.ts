import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiTags } from '@nestjs/swagger';
import type { SimulatorInboundRequest, SimulatorInboundResponse } from '@oraviq/shared';
import { SimulatorService } from '../simulator/simulator.service';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller()
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly simulator: SimulatorService,
  ) {}

  @Get('reports/weekly')
  weekly(@Query('to') to?: string) {
    return this.reports.weekly(to);
  }

  @Post('simulator/inbound')
  @HttpCode(200)
  @ApiBody({ schema: { example: { channel: 'sms', from: '(404) 555-0199', body: 'need a 20 yard in 30319 for 10 days, kitchen remodel' } } })
  inbound(@Body() body: SimulatorInboundRequest): Promise<SimulatorInboundResponse> {
    return this.simulator.inbound(body ?? ({} as SimulatorInboundRequest));
  }

  @Post('simulator/missed-call')
  @HttpCode(200)
  missed(@Body() body: { from?: string }) {
    return this.simulator.missedCall(body ?? {});
  }
}
