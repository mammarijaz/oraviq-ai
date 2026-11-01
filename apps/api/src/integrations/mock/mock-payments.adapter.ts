import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { DepositLinkInput, PaymentEvent, PaymentsAdapter } from '../types';

/**
 * Fake checkout: links look like https://pay.oraviq.test/c/<session>. The dev
 * endpoint POST /api/v1/dev/payments/:sessionId/pay marks the session paid
 * through the same handler as Stripe's checkout.session.completed.
 */
export class MockPaymentsAdapter implements PaymentsAdapter {
  readonly provider = 'mock' as const;

  isConnected(): boolean {
    return true;
  }

  async createDepositLink(input: DepositLinkInput): Promise<{ url: string; sessionId: string }> {
    const sessionId = `mock_cs_${input.orderNumber.toLowerCase()}_${randomBytes(4).toString('hex')}`;
    return { url: `https://pay.oraviq.test/c/${sessionId}`, sessionId };
  }

  connectUrl(): string | null {
    return null;
  }

  parseWebhook(rawBody: Buffer | string): PaymentEvent {
    let body: any;
    try {
      body = JSON.parse(rawBody.toString());
    } catch {
      throw new BadRequestException('Invalid JSON.');
    }
    return {
      id: String(body.id ?? `mock_evt_${randomBytes(6).toString('hex')}`),
      type: body.type === 'checkout.session.completed' ? 'deposit.paid' : 'other',
      rawType: String(body.type ?? 'unknown'),
      account: body.account ?? null,
      orderId: body.data?.object?.metadata?.orderId ?? null,
      tenantId: body.data?.object?.metadata?.tenantId ?? null,
      sessionId: body.data?.object?.id ?? null,
      amountCents: body.data?.object?.amount_total ?? null,
      payload: body,
    };
  }
}
