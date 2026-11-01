import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { SendMessageRequest, UpdateConversationRequest } from '@oraviq/shared';
import { InboxQueries } from './inbox.queries';
import { InboxService } from './inbox.service';

export const csv = (v?: string | string[]) => (Array.isArray(v) ? v : v ? String(v).split(',') : []).map((s) => s.trim()).filter(Boolean);

@ApiTags('inbox')
@ApiBearerAuth()
@Controller()
export class InboxController {
  constructor(
    private readonly queries: InboxQueries,
    private readonly inbox: InboxService,
  ) {}

  @Get('conversations')
  @ApiQuery({ name: 'state', required: false, example: 'needs_you' })
  @ApiQuery({ name: 'channel', required: false, example: 'sms,facebook' })
  @ApiQuery({ name: 'q', required: false })
  @ApiQuery({ name: 'cursor', required: false })
  @ApiQuery({ name: 'limit', required: false })
  list(@Query('state') state?: string, @Query('channel') channel?: string, @Query('q') q?: string, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.queries.listConversations({ state: csv(state), channel: csv(channel), q, cursor, limit: limit ? Number(limit) : undefined });
  }

  @Get('conversations/:id')
  detail(@Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string) {
    return this.inbox.detail(id);
  }

  @Patch('conversations/:id')
  update(@Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string, @Body() body: UpdateConversationRequest) {
    return this.inbox.update(id, body ?? {});
  }

  @Post('conversations/:id/messages')
  reply(@Param('id', new ParseUUIDPipe({ errorHttpStatusCode: 404 })) id: string, @Body() body: SendMessageRequest, @Headers('idempotency-key') key?: string) {
    return this.inbox.reply(id, body?.body, key);
  }

  @Get('contacts')
  contacts(@Query('q') q?: string) {
    return this.inbox.contacts(q);
  }
}
