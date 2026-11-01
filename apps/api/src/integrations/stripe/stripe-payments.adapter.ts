import { BadRequestException } from '@nestjs/common';
import Stripe from 'stripe';
import type { DepositLinkInput, PaymentEvent, PaymentsAdapter } from '../types';

/**
 * Stripe Connect, Standard-style accounts (OAuth). Deposits are Checkout
 * Sessions created as direct charges on the hauler's connected account
 * (`stripeAccount` request option). Webhooks are verified with
 * stripe.webhooks.constructEvent on the raw body.
 */
export class StripePaymentsAdapter implements PaymentsAdapter {
  readonly provider = 'stripe' as const;
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string | undefined,
    private readonly connectClientId: string | undefined,
  ) {
    this.stripe = new Stripe(secretKey);
  }

  isConnected(connectedAccountId: string | null): boolean {
    return !!connectedAccountId;
  }

  async createDepositLink(input: DepositLinkInput): Promise<{ url: string; sessionId: string }> {
    if (!input.connectedAccountId) throw new BadRequestException('Connect Stripe to send deposit links.');
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        line_items: [{ quantity: 1, price_data: { currency: 'usd', unit_amount: input.amountCents, product_data: { name: input.description } } }],
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        client_reference_id: input.orderId,
        metadata: { orderId: input.orderId, tenantId: input.tenantId, orderNumber: input.orderNumber },
        payment_intent_data: { metadata: { orderId: input.orderId, tenantId: input.tenantId, orderNumber: input.orderNumber } },
      },
      { stripeAccount: input.connectedAccountId, idempotencyKey: `deposit_${input.orderId}_${input.amountCents}` },
    );
    return { url: session.url!, sessionId: session.id };
  }

  connectUrl(input: { tenantId: string; state: string; redirectUri: string }): string | null {
    if (!this.connectClientId) return null;
    const p = new URLSearchParams({ response_type: 'code', client_id: this.connectClientId, scope: 'read_write', state: input.state, redirect_uri: input.redirectUri });
    return `https://connect.stripe.com/oauth/authorize?${p.toString()}`;
  }

  /** Exchanges the OAuth code for the connected account id (acct_…). */
  async completeConnect(code: string): Promise<string> {
    const res = await this.stripe.oauth.token({ grant_type: 'authorization_code', code });
    return res.stripe_user_id!;
  }

  parseWebhook(rawBody: Buffer | string, signature: string | undefined): PaymentEvent {
    if (!this.webhookSecret) throw new BadRequestException('STRIPE_WEBHOOK_SECRET is not set.');
    if (!signature) throw new BadRequestException('Missing Stripe-Signature.');
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (e) {
      throw new BadRequestException(`Invalid Stripe signature: ${(e as Error).message}`);
    }
    const obj = event.data.object as unknown as Record<string, any>;
    const paid =
      (event.type === 'checkout.session.completed' && obj.payment_status === 'paid') ||
      event.type === 'checkout.session.async_payment_succeeded';
    return {
      id: event.id,
      type: paid ? 'deposit.paid' : 'other',
      rawType: event.type,
      account: event.account ?? null,
      orderId: obj?.metadata?.orderId ?? null,
      tenantId: obj?.metadata?.tenantId ?? null,
      sessionId: event.type.startsWith('checkout.session') ? obj.id : null,
      amountCents: obj?.amount_total ?? obj?.amount_received ?? null,
      payload: event,
    };
  }
}
