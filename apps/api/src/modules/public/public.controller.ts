import { Body, Controller, Get, HttpCode, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ClientIpThrottlerGuard } from '../../common/guards/client-ip-throttler.guard';
import type { PublicBookingRequest, PublicChatMessageRequest, QuoteRequest } from '@oraviq/shared';
import type { Request } from 'express';
import { Public } from '../../common/decorators';
import { PublicService } from './public.service';

/** Widgets and hauler sites. Any origin (CORS), throttled per IP. */
@ApiTags('public')
@Public()
@UseGuards(ClientIpThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60000 } })
@Controller('public')
export class PublicController {
  constructor(private readonly pub: PublicService) {}

  @Get('sites/by-host/:host')
  byHost(@Param('host') host: string) {
    return this.pub.byHost(host);
  }

  @Get(':key/business')
  business(@Param('key') key: string) {
    return this.pub.business(key);
  }

  @Post(':key/quote')
  @HttpCode(200)
  quote(@Param('key') key: string, @Body() body: QuoteRequest) {
    return this.pub.quote(key, body ?? ({} as QuoteRequest));
  }

  @Post(':key/chat/start')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  chatStart(@Param('key') key: string) {
    return this.pub.chatStart(key);
  }

  @Post(':key/chat/message')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  chatMessage(@Param('key') key: string, @Body() body: PublicChatMessageRequest) {
    return this.pub.chatMessage(key, body ?? ({} as PublicChatMessageRequest));
  }

  @Post(':key/booking')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  booking(@Param('key') key: string, @Body() body: PublicBookingRequest, @Req() req: Request) {
    return this.pub.booking(key, body ?? ({} as PublicBookingRequest), { ip: req.ip ?? null, userAgent: (req.headers['user-agent'] as string) ?? null });
  }
}
