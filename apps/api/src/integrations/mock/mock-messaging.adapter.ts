import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { MessagingAdapter, MessagingChannel, OutboundMessage, SendResult } from '../types';

export interface MockSentMessage extends OutboundMessage {
  providerMessageId: string;
  sentAt: Date;
}

/**
 * In-process messaging. Every send is recorded (the Message row already holds the
 * text; this log also captures owner alerts) and succeeds with a mock id.
 * The simulator feeds inbound messages back through the real pipeline.
 */
export class MockMessagingAdapter implements MessagingAdapter {
  readonly provider = 'mock';
  private readonly logger = new Logger('MockMessaging');
  /** Recent sends, newest last (dev/test inspection). */
  static readonly sent: MockSentMessage[] = [];
  private readonly seenKeys = new Map<string, string>();

  supports(_channel: MessagingChannel): boolean {
    return true;
  }

  async send(msg: OutboundMessage): Promise<SendResult> {
    const existing = this.seenKeys.get(msg.idempotencyKey);
    if (existing) return { provider: this.provider, providerMessageId: existing, status: 'sent', externalThreadId: msg.externalThreadId ?? null };
    const providerMessageId = `mock_msg_${randomUUID()}`;
    this.seenKeys.set(msg.idempotencyKey, providerMessageId);
    MockMessagingAdapter.sent.push({ ...msg, providerMessageId, sentAt: new Date() });
    if (MockMessagingAdapter.sent.length > 500) MockMessagingAdapter.sent.shift();
    this.logger.debug(`[${msg.channel}] → ${msg.to}: ${msg.body.slice(0, 80)}`);
    return { provider: this.provider, providerMessageId, status: 'sent', externalThreadId: msg.externalThreadId ?? `mock_thread_${msg.to}` };
  }
}

/** Web chat replies are read by the widget through the public API; "sending" just marks them delivered. */
export class WebChatMessagingAdapter implements MessagingAdapter {
  readonly provider = 'webchat';
  supports(channel: MessagingChannel): boolean {
    return channel === 'web_chat';
  }
  async send(msg: OutboundMessage): Promise<SendResult> {
    return { provider: this.provider, providerMessageId: `webchat_${msg.idempotencyKey}`, status: 'sent', externalThreadId: msg.to };
  }
}
