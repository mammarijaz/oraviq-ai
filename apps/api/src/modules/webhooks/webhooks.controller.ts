import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { WebhooksService } from './webhooks.service';

/**
 * All webhook endpoints are PUBLIC — no JWT guard.
 * Channels send events here; verification uses hub.challenge flow.
 */
@ApiTags('Webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  // ── WhatsApp ───────────────────────────────────────────────────────────────

  @Get('whatsapp')
  @ApiOperation({ summary: 'WhatsApp webhook verification (Meta challenge)' })
  async verifyWhatsApp(
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const challenge = this.webhooksService.verifyWhatsApp(query);
    if (challenge) {
      res.status(HttpStatus.OK).send(challenge);
      return;
    }
    res.status(HttpStatus.FORBIDDEN).json({ message: 'Forbidden' });
  }

  @Post('whatsapp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle WhatsApp incoming events' })
  async handleWhatsApp(@Body() body: unknown): Promise<{ status: string }> {
    this.logger.log('WhatsApp webhook received');
    // orgId resolution: in production, map phone number → org via ChannelAccount lookup
    return this.webhooksService.processWebhook(
      'WHATSAPP',
      'message',
      null, // TODO: resolve per phone number via ChannelAccount lookup
      body,
    );
  }

  // ── Instagram ──────────────────────────────────────────────────────────────

  @Get('instagram')
  @ApiOperation({ summary: 'Instagram webhook verification (Meta challenge)' })
  async verifyInstagram(
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    const challenge = this.webhooksService.verifyInstagram(query);
    if (challenge) {
      res.status(HttpStatus.OK).send(challenge);
      return;
    }
    res.status(HttpStatus.FORBIDDEN).json({ message: 'Forbidden' });
  }

  @Post('instagram')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Instagram incoming events' })
  async handleInstagram(@Body() body: unknown): Promise<{ status: string }> {
    this.logger.log('Instagram webhook received');
    return this.webhooksService.processWebhook(
      'INSTAGRAM',
      'message',
      null, // TODO: resolve per IG account via ChannelAccount lookup
      body,
    );
  }

  // ── Twilio SMS ─────────────────────────────────────────────────────────────

  @Post('twilio')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Twilio SMS events' })
  async handleTwilio(@Body() body: unknown): Promise<{ status: string }> {
    this.logger.log('Twilio webhook received');
    return this.webhooksService.processWebhook('SMS', 'sms', null, body);
  }
}
