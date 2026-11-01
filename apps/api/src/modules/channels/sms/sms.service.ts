import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  async sendMessage(
    channelAccountId: string,
    to: string,
    content: string,
  ): Promise<string> {
    this.logger.log(
      `[SMS/Twilio] Sending to ${to} via account=${channelAccountId}: ${content.substring(0, 50)}`,
    );
    // TODO: integrate Twilio SMS API (Phase 2)
    return `sms-stub-${Date.now()}`;
  }

  processInbound(payload: unknown): {
    externalId: string;
    from: string;
    content: string;
    type: string;
  } | null {
    this.logger.debug('[SMS] Processing inbound payload');
    const p = payload as Record<string, unknown>;
    return {
      externalId: (p['SmsSid'] as string) ?? '',
      from: (p['From'] as string) ?? '',
      content: (p['Body'] as string) ?? '',
      type: 'TEXT',
    };
  }
}
