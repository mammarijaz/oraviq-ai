import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class InstagramService {
  private readonly logger = new Logger(InstagramService.name);

  async sendMessage(
    channelAccountId: string,
    to: string,
    content: string,
  ): Promise<string> {
    this.logger.log(
      `[Instagram] Sending to ${to} via account=${channelAccountId}: ${content.substring(0, 50)}`,
    );
    // TODO: integrate Instagram Messaging API (Phase 2)
    return `ig-stub-${Date.now()}`;
  }

  processInbound(payload: unknown): {
    externalId: string;
    from: string;
    content: string;
    type: string;
  } | null {
    this.logger.debug('[Instagram] Processing inbound payload');
    const p = payload as Record<string, unknown>;
    return {
      externalId: (p['messageId'] as string) ?? '',
      from: (p['senderId'] as string) ?? '',
      content: (p['text'] as string) ?? '',
      type: 'TEXT',
    };
  }
}
