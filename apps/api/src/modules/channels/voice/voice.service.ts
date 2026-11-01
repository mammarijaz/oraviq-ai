import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);

  async sendMessage(
    channelAccountId: string,
    to: string,
    content: string,
  ): Promise<string> {
    this.logger.log(
      `[Voice] Initiating call to ${to} via account=${channelAccountId}: ${content.substring(0, 50)}`,
    );
    // TODO: integrate Twilio Voice / Vonage (Phase 2)
    return `voice-stub-${Date.now()}`;
  }

  processInbound(payload: unknown): {
    externalId: string;
    from: string;
    content: string;
    type: string;
  } | null {
    this.logger.debug('[Voice] Processing inbound payload');
    const p = payload as Record<string, unknown>;
    return {
      externalId: (p['CallSid'] as string) ?? '',
      from: (p['From'] as string) ?? '',
      content: '', // transcription filled in later
      type: 'AUDIO',
    };
  }
}
