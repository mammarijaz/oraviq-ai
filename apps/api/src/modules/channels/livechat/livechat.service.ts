import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class LiveChatService {
  private readonly logger = new Logger(LiveChatService.name);

  async sendMessage(
    channelAccountId: string,
    to: string,
    content: string,
  ): Promise<string> {
    this.logger.log(
      `[LiveChat] Sending to session=${to} via account=${channelAccountId}: ${content.substring(0, 50)}`,
    );
    // LiveChat messages are delivered via Socket.IO in real-time — no external API call needed
    return `lc-stub-${Date.now()}`;
  }

  processInbound(payload: unknown): {
    externalId: string;
    from: string;
    content: string;
    type: string;
  } | null {
    this.logger.debug('[LiveChat] Processing inbound payload');
    const p = payload as Record<string, unknown>;
    return {
      externalId: (p['sessionId'] as string) ?? '',
      from: (p['visitorId'] as string) ?? '',
      content: (p['content'] as string) ?? '',
      type: 'TEXT',
    };
  }
}
