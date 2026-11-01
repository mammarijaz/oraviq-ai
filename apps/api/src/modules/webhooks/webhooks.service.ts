import { BadRequestException, Inject, Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import type { Channel } from '@oraviq/shared';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { normalizePhone } from '../../common/phone';
import { env } from '../../config/env';
import { TenantContext } from '../../core/tenant-context';
import { PAYMENTS_ADAPTER, VOICE_AGENT_ADAPTER, type PaymentsAdapter, type VoiceAgentAdapter } from '../../integrations/types';
import { verifyZernioSignature } from '../../integrations/zernio/zernio.client';
import { JobsService } from '../../jobs/jobs.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InboundService } from '../inbox/inbound.service';
import { OrdersService } from '../orders/orders.service';
import { ReviewsService } from '../reviews/reviews.service';
import { VoiceService } from '../voice/voice.service';

export type WebhookProvider = 'zernio' | 'retell' | 'stripe';

/**
 * Webhooks: verify → store (unique on provider + externalEventId) → enqueue.
 * The HTTP handler only does the first two and answers fast; processing runs in
 * the worker (or inline with INLINE_JOBS=true).
 */
@Injectable()
export class WebhooksService implements OnModuleInit {
  private readonly logger = new Logger('Webhooks');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly ctx: TenantContext,
    private readonly inbound: InboundService,
    private readonly voice: VoiceService,
    private readonly reviews: ReviewsService,
    private readonly orders: OrdersService,
    @Inject(VOICE_AGENT_ADAPTER) private readonly voiceAdapter: VoiceAgentAdapter,
    @Inject(PAYMENTS_ADAPTER) private readonly payments: PaymentsAdapter,
  ) {}

  onModuleInit(): void {
    this.jobs.register('webhooks', (d) => this.process(String(d.id)));
  }

  /* ------------------------------------------------------------------ receive */

  verifyZernio(raw: Buffer, signature: string | undefined): void {
    const secret = env().ZERNIO_WEBHOOK_SECRET;
    if (!secret) {
      if (env().isProduction) throw new UnauthorizedException('Webhook secret not configured.');
      return; // mock/dev: unsigned allowed
    }
    if (!verifyZernioSignature(raw, secret, signature)) throw new UnauthorizedException('Bad signature.');
  }

  verifyRetell(raw: Buffer, signature: string | undefined): void {
    // The mock adapter accepts unsigned traffic and a public dev key: never in production.
    if (this.voiceAdapter.provider === 'mock' && env().isProduction) throw new UnauthorizedException('Webhook secret not configured.');
    if (!this.voiceAdapter.verifySignature(raw.toString('utf8'), signature)) throw new UnauthorizedException('Bad signature.');
  }

  /** Stores the event once and enqueues it. Returns whether it was new. */
  async store(provider: string, externalEventId: string, type: string, payload: unknown): Promise<{ id: string; duplicate: boolean }> {
    try {
      const row = await this.prisma.webhookEvent.create({ data: { provider, externalEventId, type, payload: payload as Prisma.InputJsonValue } });
      await this.jobs.enqueue('webhooks', { id: row.id }, { jobId: `wh-${row.id}` });
      return { id: row.id, duplicate: false };
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const existing = await this.prisma.webhookEvent.findUnique({ where: { provider_externalEventId: { provider, externalEventId } } });
        return { id: existing?.id ?? '', duplicate: true };
      }
      throw e;
    }
  }

  async receiveZernio(raw: Buffer, headers: Record<string, string | undefined>) {
    this.verifyZernio(raw, headers['x-zernio-signature'] ?? headers['x-late-signature']);
    const body = parseJson(raw);
    const id = String(body.id ?? headers['x-zernio-event-id'] ?? '');
    if (!id) throw new BadRequestException('Missing event id.');
    return this.store('zernio', id, String(body.event ?? 'unknown'), body);
  }

  async receiveRetell(raw: Buffer, signature: string | undefined) {
    this.verifyRetell(raw, signature);
    const body = parseJson(raw);
    const callId = String(body.call?.call_id ?? '');
    if (!body.event || !callId) throw new BadRequestException('Missing event or call id.');
    // Retell retries carry the same event + call id.
    return this.store('retell', `${body.event}:${callId}`, String(body.event), body);
  }

  async receiveStripe(raw: Buffer, signature: string | undefined) {
    // Mock payments don't verify signatures: never accept them in production.
    if (this.payments.provider === 'mock' && env().isProduction) throw new UnauthorizedException('Webhook secret not configured.');
    const ev = this.payments.parseWebhook(raw, signature);
    return this.store(this.payments.provider === 'stripe' ? 'stripe' : 'mock_stripe', ev.id, ev.rawType, { ...((ev.payload as object) ?? {}), _parsed: { ...ev, payload: undefined } });
  }

  /** Dev only: replay a fixture through the same pipeline (no signature). */
  async receiveMock(provider: string, body: any) {
    if (env().isProduction) throw new UnauthorizedException('Not available in production.');
    if (!['zernio', 'retell', 'stripe'].includes(provider)) throw new BadRequestException('Provider must be zernio, retell or stripe.');
    const id = provider === 'retell' ? `${body?.event}:${body?.call?.call_id}` : String(body?.id ?? randomUUID());
    if (provider === 'stripe') {
      const ev = this.payments.parseWebhook(JSON.stringify(body), undefined);
      return this.store('mock_stripe', ev.id, ev.rawType, { ...body, _parsed: { ...ev, payload: undefined } });
    }
    return this.store(provider, id, String(body?.event ?? body?.type ?? 'unknown'), body);
  }

  /* ------------------------------------------------------------------ process (worker) */

  async process(id: string): Promise<void> {
    const ev = await this.prisma.webhookEvent.findUnique({ where: { id } });
    if (!ev || ev.status === 'processed' || ev.status === 'ignored') return;
    const claimed = await this.prisma.webhookEvent.updateMany({ where: { id, status: { in: ['received', 'failed'] } }, data: { status: 'processing', attempts: { increment: 1 } } });
    if (!claimed.count) return;
    try {
      const handled = await this.dispatch(ev.provider, ev.type, ev.payload as any);
      await this.prisma.webhookEvent.update({ where: { id }, data: { status: handled.handled ? 'processed' : 'ignored', processedAt: new Date(), tenantId: handled.tenantId ?? null, error: null } });
    } catch (e) {
      this.logger.error(`Webhook ${ev.provider}/${ev.type} ${id} failed: ${(e as Error).stack ?? e}`);
      await this.prisma.webhookEvent.update({ where: { id }, data: { status: 'failed', error: (e as Error).message } });
      if (!this.jobs.inline) throw e; // let BullMQ retry
    }
  }

  private async tenantForZernio(body: any): Promise<string | null> {
    const accountId = body.account?.accountId ?? body.account?.id ?? body.message?.accountId ?? body.call?.accountId ?? null;
    if (accountId) {
      const acc = await this.prisma.channelAccount.findFirst({ where: { provider: 'zernio', externalAccountId: String(accountId) } });
      if (acc) return acc.tenantId;
    }
    const numberId = body.call?.phoneNumberId ?? body.number?.id ?? null;
    if (numberId) {
      const pn = await this.prisma.phoneNumber.findFirst({ where: { providerNumberId: String(numberId) } });
      if (pn) return pn.tenantId;
    }
    const to = normalizePhone(body.call?.to ?? body.message?.to ?? body.conversation?.to ?? null);
    if (to) {
      const pn = await this.prisma.phoneNumber.findUnique({ where: { e164: to } });
      if (pn) return pn.tenantId;
    }
    const profileExt = body.profiles?.[0]?.externalId;
    if (profileExt) {
      const t = await this.prisma.tenant.findUnique({ where: { id: String(profileExt) } }).catch(() => null);
      if (t) return t.id;
    }
    return null;
  }

  private async dispatch(provider: string, type: string, body: any): Promise<{ handled: boolean; tenantId?: string | null }> {
    if (provider === 'zernio') return this.zernio(type, body);
    if (provider === 'retell') {
      if (!['call_started', 'call_ended', 'call_analyzed'].includes(type)) return { handled: false };
      await this.voice.processRetellEvent(body);
      return { handled: true };
    }
    if (provider === 'stripe' || provider === 'mock_stripe') {
      const p = body._parsed ?? {};
      if (p.type !== 'deposit.paid') return { handled: false };
      // The connected account the event came from decides the tenant. Metadata is written by whoever
      // controls that Stripe account (a Standard account belongs to the hauler), so it must agree.
      let tenantId: string | null = null;
      if (p.account) {
        const acc = await this.prisma.channelAccount.findFirst({ where: { kind: 'stripe', externalAccountId: String(p.account) } });
        tenantId = acc?.tenantId ?? null;
        if (tenantId && p.tenantId && p.tenantId !== tenantId) tenantId = null;
      } else if (provider === 'mock_stripe') {
        tenantId = p.tenantId ?? null; // dev "mark paid" path (refused in production)
      }
      if (!tenantId) return { handled: false };
      await this.ctx.run(tenantId, () => this.orders.markDepositPaid({ orderId: p.orderId, sessionId: p.sessionId, amountCents: p.amountCents, eventId: p.id }));
      return { handled: true, tenantId };
    }
    return { handled: false };
  }

  private async zernio(type: string, body: any): Promise<{ handled: boolean; tenantId?: string | null }> {
    const tenantId = await this.tenantForZernio(body);
    if (!tenantId) {
      this.logger.warn(`Zernio ${type}: no tenant matched`);
      return { handled: false };
    }
    switch (type) {
      case 'message.received': {
        const m = body.message ?? {};
        if (m.direction && m.direction !== 'incoming' && m.direction !== 'inbound') return { handled: false, tenantId };
        const platform = String(m.platform ?? body.account?.platform ?? 'sms').toLowerCase();
        const channel: Channel = platform.includes('instagram') ? 'instagram' : platform.includes('facebook') || platform.includes('messenger') ? 'facebook' : platform.includes('whatsapp') ? 'whatsapp' : 'sms';
        const sender = m.sender ?? {};
        const from = channel === 'sms' || channel === 'whatsapp' ? String(sender.phone ?? sender.phoneNumber ?? sender.id ?? m.from ?? '') : String(sender.id ?? '');
        if (!from) throw new Error('message.received without a sender');
        await this.inbound.handle(tenantId, {
          provider: 'zernio',
          channel,
          from,
          fromName: sender.name ?? sender.displayName ?? sender.username ?? null,
          body: String(m.text ?? ''),
          providerMessageId: String(m.id ?? m.platformMessageId ?? ''),
          externalThreadId: m.conversationId ?? body.conversation?.id ?? null,
          accountId: body.account?.accountId ?? null,
          receivedAt: m.sentAt ? new Date(m.sentAt) : new Date(),
        });
        return { handled: true, tenantId };
      }
      case 'message.delivered':
      case 'message.failed': {
        const id = body.message?.id;
        if (!id) return { handled: false, tenantId };
        await this.prisma.message.updateMany({
          where: { tenantId, provider: 'zernio', providerMessageId: String(id) },
          data: type === 'message.delivered' ? { status: 'delivered', deliveredAt: new Date(body.statusAt ?? Date.now()) } : { status: 'failed', error: String(body.error?.message ?? 'Delivery failed') },
        });
        return { handled: true, tenantId };
      }
      case 'call.ended': {
        const c = body.call ?? {};
        // Unanswered call that didn't reach the receptionist → missed-call textback.
        const missed = /no.?answer|missed|busy|cancel/i.test(String(c.endReason ?? c.hangupCause ?? '')) || (Number(c.durationSeconds ?? 0) === 0 && !c.isVoicemail);
        if (missed && c.from) {
          await this.inbound.missedCall(tenantId, { from: String(c.from), at: c.endedAt ? new Date(c.endedAt) : new Date() });
          return { handled: true, tenantId };
        }
        return { handled: false, tenantId };
      }
      case 'review.new':
      case 'review.updated': {
        const r = body.review ?? {};
        const source = String(body.account?.platform ?? r.platform ?? 'google').toLowerCase().includes('facebook') ? 'facebook' : 'google';
        await this.reviews.ingest(tenantId, {
          source,
          externalId: String(r.id ?? r.reviewId),
          author: String(r.reviewer?.name ?? r.author?.name ?? r.authorName ?? 'Customer'),
          rating: r.rating != null ? Number(r.rating) : r.starRating != null ? Number(r.starRating) : null,
          recommends: r.recommendationType ? String(r.recommendationType).toLowerCase() === 'positive' : null,
          text: String(r.text ?? r.comment ?? ''),
          createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
          reply: r.reply?.text ?? null,
        });
        return { handled: true, tenantId };
      }
      default:
        return { handled: false, tenantId };
    }
  }
}

function parseJson(raw: Buffer): any {
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid JSON.');
  }
}
