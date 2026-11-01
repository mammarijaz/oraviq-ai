import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { ReceptionistSettingsDto, TestCallTurnRequest } from '@oraviq/shared';
import { Roles } from '../../common/decorators';
import { InboxQueries } from '../inbox/inbox.queries';
import { csv } from '../inbox/inbox.controller';
import { VoiceService } from './voice.service';

@ApiTags('receptionist')
@ApiBearerAuth()
@Controller()
export class ReceptionistController {
  constructor(
    private readonly voice: VoiceService,
    private readonly queries: InboxQueries,
  ) {}

  @Get('receptionist')
  get() {
    return this.voice.getSettings();
  }

  @Put('receptionist')
  @Roles('owner', 'admin')
  update(@Body() body: Partial<ReceptionistSettingsDto>) {
    return this.voice.updateSettings(body ?? {});
  }

  @Get('receptionist/stats')
  stats() {
    return this.voice.stats();
  }

  /** In-app "Try a call". Omit callId to start; send end: true (or "bye") to hang up. */
  @Post('receptionist/test-call')
  @HttpCode(200)
  testCall(@Body() body: TestCallTurnRequest) {
    return this.voice.testCallTurn(body ?? ({} as TestCallTurnRequest));
  }

  @Get('calls')
  calls(@Query('outcome') outcome?: string) {
    return this.queries.listCalls(csv(outcome));
  }

  @Get('calls/:id')
  call(@Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string) {
    return this.queries.callDto(id);
  }
}
