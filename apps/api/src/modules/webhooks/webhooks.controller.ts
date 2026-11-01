import { BadRequestException, Body, Controller, Headers, HttpCode, Param, Post, Req, type RawBodyRequest } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../../common/decorators';
import { VoiceService } from '../voice/voice.service';
import { WebhooksService } from './webhooks.service';

function raw(req: RawBodyRequest<Request>): Buffer {
  if (!req.rawBody) throw new BadRequestException('Empty body.');
  return req.rawBody;
}

/** Signature-verified, store-then-enqueue. Answers within the providers' windows (Zernio 5 s, Retell 10 s). */
@ApiExcludeController()
@Public()
@Controller()
export class WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly voice: VoiceService,
  ) {}

  @Post('webhooks/zernio')
  @HttpCode(200)
  async zernio(@Req() req: RawBodyRequest<Request>, @Headers() headers: Record<string, string>) {
    const r = await this.webhooks.receiveZernio(raw(req), headers);
    return { ok: true, duplicate: r.duplicate };
  }

  @Post('webhooks/retell')
  @HttpCode(200)
  async retell(@Req() req: RawBodyRequest<Request>, @Headers('x-retell-signature') sig?: string) {
    const r = await this.webhooks.receiveRetell(raw(req), sig);
    return { ok: true, duplicate: r.duplicate };
  }

  @Post('webhooks/stripe')
  @HttpCode(200)
  async stripe(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') sig?: string) {
    const r = await this.webhooks.receiveStripe(raw(req), sig);
    return { received: true, duplicate: r.duplicate };
  }

  @Post('webhooks/mock/:provider')
  @HttpCode(200)
  async mock(@Param('provider') provider: string, @Body() body: unknown) {
    const r = await this.webhooks.receiveMock(provider, body);
    return { ok: true, duplicate: r.duplicate, id: r.id };
  }

  /** Retell custom functions: get_quote, check_zip, lookup_customer, create_order_draft, send_quote_sms. */
  @Post('voice/tools/:tool')
  @HttpCode(200)
  async tool(@Param('tool') tool: string, @Req() req: RawBodyRequest<Request>, @Headers('x-retell-signature') sig?: string) {
    const body = raw(req);
    this.webhooks.verifyRetell(body, sig);
    let parsed: any;
    try {
      parsed = JSON.parse(body.toString('utf8'));
    } catch {
      throw new BadRequestException('Invalid JSON.');
    }
    return this.voice.runTool(tool, parsed);
  }
}
