import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  /**
   * Send a WhatsApp message via Meta Cloud API.
   * @returns External message ID from Meta
   */
  async sendMessage(
    channelAccountId: string,
    to: string,
    content: string,
  ): Promise<string> {
    this.logger.log(
      `[WhatsApp] Sending to ${to} via account=${channelAccountId}: ${content.substring(0, 50)}`,
    );
    // TODO: integrate Meta Cloud API (Phase 2)
    return `wa-stub-${Date.now()}`;
  }

  /**
   * Parse a raw Meta webhook payload into our internal message format.
   */
  processInbound(payload: unknown): {
    externalId: string;
    from: string;
    content: string;
    type: string;
  } | null {
    this.logger.debug('[WhatsApp] Processing inbound payload');
    // TODO: parse Meta webhook structure (Phase 2)
    const p = payload as Record<string, unknown>;
    return {
      externalId: (p['messageId'] as string) ?? '',
      from: (p['from'] as string) ?? '',
      content: (p['text'] as string) ?? '',
      type: 'TEXT',
    };
  }
}
