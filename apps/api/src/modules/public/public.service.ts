import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { activeSizes, calculateQuote, formatMoney, normalizeZip, type QuoteError } from '@oraviq/pricing';
import { TEXT_CONSENT_VERSION, textConsentDisclosure, type PublicBookingRequest, type PublicBookingResponse, type PublicBusinessDto, type PublicChatStartResponse, type Quote, type QuoteRequest } from '@oraviq/shared';
import type { Tenant } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ProblemsException } from '../../common/errors';
import { displayPhone, isTextableNumber, normalizePhone } from '../../common/phone';
import { clockLabel, resolveDayPhrase, shortDateLabel } from '../../common/time';
import { env } from '../../config/env';
import { TenantContext } from '../../core/tenant-context';
import { OutboxService } from '../../jobs/outbox.service';
import { DbService } from '../../prisma/db.service';
import { ContactsService } from '../contacts/contacts.service';
import { InboundService } from '../inbox/inbound.service';
import { safeFirstName } from '../inbox/mappers';
import { MessagingService } from '../messaging/messaging.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrdersService } from '../orders/orders.service';
import { PricingService } from '../pricing/pricing.service';
import { QuotesService } from '../quotes/quotes.service';
import { DEFAULT_SECTIONS } from '../site/site.service';

const SESSION_RE = /^cs_[A-Za-z0-9_-]{20,64}$/;
const DEBRIS_WORDS = { household: 'household junk', construction: 'construction debris', heavy: 'concrete or dirt' } as const;

const bookingSchema = z.object({
  yards: z.coerce.number().int().positive(),
  days: z.coerce.number().int().min(1).max(365),
  debris: z.enum(['household', 'construction', 'heavy']),
  address: z.string().trim().min(1, 'Enter the delivery address.').max(200),
  zip: z.string().trim().regex(/^\d{5}$/, 'Enter a 5-digit ZIP code.'),
  deliveryDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a delivery date.'),
  name: z.string().trim().min(1, 'Enter your name.').max(100),
  phone: z.string().trim().min(10, 'Enter a 10-digit mobile number.'),
  consent: z.boolean(),
  consentText: z.string().trim().max(1000),
  pageUrl: z.string().max(500).optional(),
});

/** Public, unauthenticated endpoints for widgets and hauler sites, keyed by the publishable key. */
@Injectable()
export class PublicService {
  constructor(
    private readonly dbs: DbService,
    private readonly ctx: TenantContext,
    private readonly pricing: PricingService,
    private readonly quotes: QuotesService,
    private readonly contacts: ContactsService,
    private readonly messaging: MessagingService,
    private readonly inbound: InboundService,
    private readonly orders: OrdersService,
    private readonly notifications: NotificationsService,
    private readonly outbox: OutboxService,
  ) {}

  private async tenantByKey(key: string): Promise<Tenant> {
    if (!/^pk_[A-Za-z0-9_]{4,64}$/.test(String(key ?? ''))) throw new NotFoundException('Unknown business.');
    const t = await this.dbs.system.tenant.findUnique({ where: { publishableKey: key } });
    if (!t) throw new NotFoundException('Unknown business.');
    return t;
  }

  private inTenant<T>(key: string, fn: (t: Tenant) => Promise<T>): Promise<T> {
    return this.tenantByKey(key).then((t) => this.ctx.run(t.id, () => fn(t)));
  }

  business(key: string): Promise<PublicBusinessDto> {
    return this.inTenant(key, async (t) => {
      const db = this.dbs.db;
      const [table, widget, site, reviews, gStats] = await Promise.all([
        this.pricing.current(),
        db.widgetSettings.findFirst(),
        db.siteSettings.findFirst(),
        db.review.findMany({ where: { source: 'google', rating: { gte: 4 } }, orderBy: { createdAt: 'desc' }, take: 3 }),
        db.reviewSourceStats.findFirst({ where: { source: 'google' } }),
      ]);
      const allGoogle = await db.review.aggregate({ where: { source: 'google', rating: { not: null } }, _avg: { rating: true }, _count: { _all: true } });
      return {
        name: t.name,
        phone: t.phone ? displayPhone(t.phone) : null,
        city: t.city,
        state: t.state,
        accentColor: site?.accentColor ?? widget?.accentColor ?? '#1F6B4F',
        sizes: activeSizes(table).map((s) => ({ yards: s.yards, baseCents: s.baseCents, includedTons: s.includedTons, heavyAllowed: s.heavyAllowed, heavyFlatCents: s.heavyFlatCents ?? null, hint: s.hint ?? null })),
        includedDays: table.includedDays,
        extraDayCents: table.extraDayCents,
        overagePerTonCents: table.overagePerTonCents,
        zones: table.zones.map((z) => ({ name: z.name, feeCents: z.feeCents, zipsPreview: z.zips.slice(0, 6), zipCount: z.zips.length })),
        chat: { greeting: widget?.chatGreeting ?? '', buttonLabel: widget?.chatButtonLabel ?? 'Get a price', position: widget?.chatPosition === 'left' ? 'left' : 'right' },
        site: site ? { headline: site.headline, intro: site.intro, sections: { ...DEFAULT_SECTIONS, ...((site.sections ?? {}) as object) } } : undefined,
        reviews: reviews.map((r) => ({ author: r.author, rating: r.rating ?? 5, text: r.text })),
        googleRating: gStats?.rating ?? (allGoogle._avg.rating != null ? Math.round(allGoogle._avg.rating * 10) / 10 : null),
        googleCount: gStats?.count ?? allGoogle._count._all,
      };
    });
  }

  quote(key: string, req: QuoteRequest): Promise<{ ok: boolean; quote?: Quote; error?: QuoteError }> {
    return this.inTenant(key, async () => {
      const table = await this.pricing.current();
      const r = calculateQuote(table, { yards: Number(req?.yards), days: req?.days != null ? Number(req.days) : undefined, zip: String(req?.zip ?? ''), debris: req?.debris, items: req?.items });
      return r.ok ? { ok: true, quote: r.quote } : { ok: false, error: r.error };
    });
  }

  chatStart(key: string): Promise<PublicChatStartResponse> {
    return this.inTenant(key, async () => {
      const w = await this.dbs.db.widgetSettings.findFirst();
      return { sessionId: `cs_${randomBytes(18).toString('base64url')}`, messages: [{ author: 'assistant', body: w?.chatGreeting ?? '', createdAt: new Date().toISOString() }] };
    });
  }

  chatMessage(key: string, req: { sessionId: string; body: string }): Promise<{ messages: Array<{ author: 'assistant' | 'customer'; body: string; createdAt: string }> }> {
    return this.inTenant(key, async (t) => {
      if (!SESSION_RE.test(String(req?.sessionId ?? ''))) throw new BadRequestException('Start a chat first.');
      const body = String(req?.body ?? '').trim();
      if (!body) throw new BadRequestException('Type a message.');
      if (body.length > 1000) throw new BadRequestException('Keep messages under 1,000 characters.');
      const existing = await this.contacts.findByAddress('web_chat', req.sessionId);
      if (!existing) {
        // First message: the conversation starts with the greeting the widget already showed.
        const [w, site] = await Promise.all([this.dbs.db.widgetSettings.findFirst(), this.dbs.db.siteSettings.findFirst()]);
        const at = new Date(Date.now() - 1000);
        await this.dbs.tx(async (tx) => {
          const contact = await this.contacts.findOrCreate('web_chat', req.sessionId, { displayAddress: 'Website visitor' }, tx);
          const conv = await this.inbound.conversationFor(tx, contact.id, 'web_chat', { origin: 'web_chat', externalThreadId: req.sessionId, tag: 'Chatting', forceNew: true });
          await tx.conversation.update({ where: { id: conv.id }, data: { aiState: { introduced: true } } });
          const where = site?.customDomain && site.customDomainStatus === 'active' ? site.customDomain : `${site?.slug ?? t.slug}.${env().SITES_BASE_DOMAIN}`;
          await this.messaging.addSystem(tx, conv, `Chat started on ${where}.`, at);
          await this.messaging.addMessage(tx, conv, { author: 'assistant', body: w?.chatGreeting ?? '', mode: 'record', meta: `Website chat, ${clockLabel(at, t.timezone)}`, createdAt: at });
        });
      }
      const res = await this.inbound.handle(t.id, { provider: 'webchat', channel: 'web_chat', from: req.sessionId, body, externalThreadId: req.sessionId });
      return { messages: res.replies.filter((m) => m.status !== 'draft').map((m) => ({ author: 'assistant' as const, body: m.body, createdAt: m.createdAt.toISOString() })) };
    });
  }

  /** Booking widget: TCPA consent evidence + contact + conversation + order + confirmation text. */
  booking(key: string, raw: PublicBookingRequest, meta: { ip: string | null; userAgent: string | null }): Promise<PublicBookingResponse> {
    return this.inTenant(key, async (t) => {
      const parsed = bookingSchema.safeParse(raw);
      if (!parsed.success) throw new ProblemsException(parsed.error.issues[0]?.message ?? 'Check the form.', parsed.error.issues.map((i) => i.message));
      const req = parsed.data;
      // US numbers only: the form texts whatever number it is given (no SMS pumping to premium international ranges).
      const phone = normalizePhone(req.phone);
      if (!phone || !isTextableNumber(phone)) throw new ProblemsException('Enter a 10-digit mobile number.', ['Enter a 10-digit mobile number.']);
      if (!req.consent || !req.consentText) throw new ProblemsException('Tick the box so we can text you about this order.', ['Tick the box so we can text you about this order.']);
      // The ledger records TEXT_CONSENT_VERSION, so the evidence must be that disclosure, not any string.
      const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
      if (squash(req.consentText) !== squash(textConsentDisclosure(t.name))) {
        throw new ProblemsException('The consent wording has changed. Reload the page and try again.', ['The consent wording has changed. Reload the page and try again.']);
      }
      const table = await this.pricing.current();
      const zip = normalizeZip(req.zip)!;
      const pre = calculateQuote(table, { yards: req.yards, days: req.days, zip, debris: req.debris });
      if (!pre.ok && (pre.error.code === 'heavy_not_allowed' || pre.error.code === 'unknown_size' || pre.error.code === 'inactive_size' || pre.error.code === 'invalid_days')) {
        throw new ProblemsException(pre.error.code === 'heavy_not_allowed' ? `Concrete, dirt and brick only go in a ${pre.error.suggestYards?.join(' or ')}-yard.` : pre.error.message, [pre.error.message]);
      }
      const iso = resolveDayPhrase(req.deliveryDate, new Date(), t.timezone);
      if (!iso) throw new ProblemsException('Pick a delivery date.', ['Pick a delivery date.']);
      const dateLabel = shortDateLabel(iso);
      const first = safeFirstName(req.name);
      const now = new Date();
      const tLabel = clockLabel(now, t.timezone);

      const out = await this.dbs.tx(async (tx) => {
        const contact = await this.contacts.findOrCreate('booking_form', phone, { name: req.name }, tx);
        // A web form can't undo STOP: only a START texted from the customer's own phone can.
        const optedOut = await this.contacts.isOptedOut(contact.id, 'sms', tx);
        if (!optedOut) await this.contacts.grant(tx, {
          contactId: contact.id,
          channel: 'sms',
          purpose: 'transactional',
          source: 'booking_form',
          textVersion: TEXT_CONSENT_VERSION,
          capturedAt: now,
          evidence: { consentText: req.consentText, checkbox: true, phone, name: req.name, pageUrl: req.pageUrl ?? null, ip: meta.ip, userAgent: meta.userAgent, submittedAt: now.toISOString(), form: 'booking_widget' },
        });
        const conv = await this.inbound.conversationFor(tx, contact.id, 'booking_form', { origin: 'booking_form', tag: 'Order to confirm', forceNew: true });
        const q = await this.quotes.createFromTable(table, { yards: req.yards, days: req.days, zip, debris: req.debris }, { conversationId: conv.id, contactId: contact.id }, tx);
        await this.messaging.addSystem(tx, conv, `Booked on your website at ${tLabel}.`, new Date(now.getTime() - 2000));
        await this.messaging.addInbound(tx, conv, {
          body: `${req.yards}-yard for ${req.days} days, ${DEBRIS_WORDS[req.debris]}. Deliver to ${req.address}, ${zip} on ${dateLabel}.`,
          provider: 'webform',
          meta: `Booking form, ${tLabel}`,
          createdAt: new Date(now.getTime() - 1000),
        });
        const order = await tx.order.create({
          data: {
            tenantId: t.id,
            number: await this.orders.nextNumber(tx),
            status: 'requested',
            contactId: contact.id,
            conversationId: conv.id,
            quoteId: q.ok ? q.quoteId : null,
            channel: 'booking_form',
            address: req.address,
            zip,
            placement: 'driveway',
            deliveryDate: iso,
            deliveryDateLabel: dateLabel,
            source: 'booking_form',
            notes: req.pageUrl ? `Booked from ${req.pageUrl}` : null,
          },
        });
        await tx.orderEvent.create({ data: { tenantId: t.id, orderId: order.id, kind: 'created', toStatus: 'requested', data: { source: 'booking_form' } } });
        await this.outbox.realtime(tx, t.id, { event: 'order.updated', id: order.id });
        const reply = q.ok
          ? `Thanks${first ? `, ${first}` : ''}. We got your request for a ${q.quote.yards}-yard on ${dateLabel}: ${formatMoney(q.quote.totalCents)} delivered. We'll text you to confirm the delivery time.`
          : `Thanks${first ? `, ${first}` : ''}. We got your request for ${dateLabel}. We'll text you a price and delivery time shortly.`;
        if (optedOut) await this.messaging.addSystem(tx, conv, 'This customer replied STOP earlier, so no confirmation text was sent. Call them to confirm.');
        else await this.messaging.addMessage(tx, conv, { author: 'assistant', body: reply, quoteId: q.ok ? q.quoteId : null, aiGenerated: false });
        const handoff = optedOut ? 'Customer opted out of texts (replied STOP). Call them to confirm.' : q.ok ? null : `ZIP ${zip} is outside your zones; price needed`;
        await tx.conversation.update({ where: { id: conv.id }, data: { state: 'needs_you', tag: 'Order to confirm', handoffReason: handoff, aiState: { introduced: true, stage: 'booked' }, facts: { yards: req.yards, days: req.days, zip, debris: req.debris, address: req.address, date: dateLabel, placement: 'driveway', name: req.name } } });
        await this.notifications.notifyOwner(tx, {
          title: 'New order',
          body: `New order from your booking form: ${req.yards}-yard to ${req.address}, ${dateLabel}, ${q.ok ? formatMoney(q.quote.totalCents) : 'price needed'}. Tap to confirm.`,
          href: `/orders/${order.id}`,
          sms: true,
        });
        return { order, q, reply };
      });
      await this.outbox.kick();
      return { orderNumber: out.order.number, quote: out.q.ok ? out.q.quote : null, message: out.reply };
    });
  }

  async byHost(host: string): Promise<{ key: string }> {
    const h = String(host ?? '').toLowerCase().replace(/:\d+$/, '');
    const base = `.${env().SITES_BASE_DOMAIN}`;
    const site = h.endsWith(base)
      ? await this.dbs.system.siteSettings.findUnique({ where: { slug: h.slice(0, -base.length) } })
      : await this.dbs.system.siteSettings.findFirst({ where: { customDomain: h, customDomainStatus: 'active' } });
    if (!site) throw new NotFoundException('No site at this address.');
    const t = await this.dbs.system.tenant.findUniqueOrThrow({ where: { id: site.tenantId } });
    return { key: t.publishableKey };
  }
}
