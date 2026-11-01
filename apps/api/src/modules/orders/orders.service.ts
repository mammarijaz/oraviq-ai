import { BadRequestException, Inject, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { formatMoney } from '@oraviq/pricing';
import { canTransition, DELIVERY_WINDOWS, ORDER_STATUS_LABELS, type Channel, type CreateOrderRequest, type OrderDto, type OrderStatus, type Placement, type RescheduleOrderRequest } from '@oraviq/shared';
import { Prisma, type Conversation, type Order } from '@prisma/client';
import { ConflictActionException } from '../../common/errors';
import { dayLabelFromPhrase, longDateLabel, resolveDayPhrase, shortDateLabel } from '../../common/time';
import { env } from '../../config/env';
import { PAYMENTS_ADAPTER, type PaymentsAdapter } from '../../integrations/types';
import { OutboxService } from '../../jobs/outbox.service';
import { DbService } from '../../prisma/db.service';
import type { TenantTx } from '../../prisma/tenant-prisma';
import { AuditService } from '../audit/audit.service';
import { ContactsService } from '../contacts/contacts.service';
import { InboxQueries } from '../inbox/inbox.queries';
import { MessagingService } from '../messaging/messaging.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReviewRequestsService } from '../reviews/review-requests.service';

const lcFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Orders and the order state machine (ORDER_TRANSITIONS from @oraviq/shared). */
@Injectable()
export class OrdersService implements OnModuleInit {
  constructor(
    private readonly dbs: DbService,
    private readonly outbox: OutboxService,
    private readonly messaging: MessagingService,
    private readonly contacts: ContactsService,
    private readonly notifications: NotificationsService,
    private readonly queries: InboxQueries,
    private readonly audit: AuditService,
    private readonly reviewRequests: ReviewRequestsService,
    @Inject(PAYMENTS_ADAPTER) private readonly payments: PaymentsAdapter,
  ) {}

  onModuleInit(): void {}

  private async tenant() {
    const t = await this.dbs.system.tenant.findUnique({ where: { id: this.dbs.tenantId } });
    if (!t) throw new NotFoundException('Tenant not found.');
    return t;
  }

  async nextNumber(tx: TenantTx): Promise<string> {
    const t = await tx.tenant.update({ where: { id: this.dbs.tenantId }, data: { orderSeq: { increment: 1 } }, select: { orderSeq: true } });
    return `RO-${t.orderSeq}`;
  }

  private async event(tx: TenantTx, order: Pick<Order, 'id'>, kind: string, from: OrderStatus | null, to: OrderStatus | null, data?: Record<string, unknown>) {
    await tx.orderEvent.create({
      data: { tenantId: this.dbs.tenantId, orderId: order.id, kind, fromStatus: from, toStatus: to, data: (data ?? undefined) as Prisma.InputJsonValue | undefined, actorUserId: null },
    });
    await this.outbox.realtime(tx, this.dbs.tenantId, { event: 'order.updated', id: order.id });
  }

  private async load(id: string, tx: TenantTx = this.dbs.db) {
    const o = await tx.order.findUnique({ where: { id }, include: { quote: true, conversation: true } });
    if (!o) throw new NotFoundException('Order not found.');
    return o;
  }

  /* ------------------------------------------------------------------ create */

  /** Order requested by the assistant (text or voice) from the conversation's latest quote. */
  async createFromAssistant(
    tx: TenantTx,
    input: { conversation: Conversation; quoteId: string; address: string; date: string; placement: Placement | null; name: string | null; source: 'assistant' | 'voice' },
  ): Promise<Order> {
    const tenant = await this.tenant();
    const quote = await tx.quote.findUnique({ where: { id: input.quoteId } });
    if (!quote) throw new BadRequestException('Quote not found.');
    const iso = resolveDayPhrase(input.date, new Date(), tenant.timezone);
    const placement: Placement = input.placement ?? 'driveway';
    const order = await tx.order.create({
      data: {
        tenantId: this.dbs.tenantId,
        number: await this.nextNumber(tx),
        status: 'requested',
        contactId: input.conversation.contactId,
        conversationId: input.conversation.id,
        quoteId: quote.id,
        channel: input.conversation.channel,
        address: input.address,
        zip: quote.zip,
        placement,
        permitCheck: placement === 'street',
        deliveryDate: iso ?? input.date,
        deliveryDateLabel: dayLabelFromPhrase(input.date),
        source: input.source,
        createdByAi: true,
      },
    });
    if (input.name) {
      const c = await tx.contact.findUnique({ where: { id: input.conversation.contactId } });
      if (c && !c.name) await tx.contact.update({ where: { id: c.id }, data: { name: input.name } });
    }
    await this.event(tx, order, 'created', null, 'requested', { source: input.source });
    return order;
  }

  /** POST /orders: the owner creates an order by hand. */
  async create(req: CreateOrderRequest): Promise<OrderDto> {
    const tenant = await this.tenant();
    let conv: Conversation | null = null;
    let contactId = req.contactId ?? null;
    if (req.conversationId) {
      conv = await this.dbs.db.conversation.findUnique({ where: { id: req.conversationId } });
      if (!conv) throw new NotFoundException('Conversation not found.');
      contactId = conv.contactId;
    }
    if (!contactId) throw new BadRequestException('Pick the customer (conversationId or contactId).');
    const contact = await this.dbs.db.contact.findUnique({ where: { id: contactId } });
    if (!contact) throw new NotFoundException('Contact not found.');
    let quoteId: string | null = null;
    let zip = req.zip ?? null;
    if (req.quoteId) {
      const q = await this.dbs.db.quote.findUnique({ where: { id: req.quoteId } });
      if (!q) throw new NotFoundException('Quote not found.');
      quoteId = q.id;
      zip = zip ?? q.zip;
    }
    if (!req.address?.trim()) throw new BadRequestException('Enter the delivery address.');
    if (req.deliveryWindow && !(DELIVERY_WINDOWS as readonly string[]).includes(req.deliveryWindow)) throw new BadRequestException('Pick one of the delivery windows.');
    const iso = req.deliveryDate ? resolveDayPhrase(req.deliveryDate, new Date(), tenant.timezone) : null;
    const id = await this.dbs.tx(async (tx) => {
      const order = await tx.order.create({
        data: {
          tenantId: this.dbs.tenantId,
          number: await this.nextNumber(tx),
          status: 'requested',
          contactId: contactId!,
          conversationId: conv?.id ?? null,
          quoteId,
          channel: (conv?.channel ?? 'sms') as Channel,
          address: req.address.trim(),
          zip,
          placement: req.placement ?? 'driveway',
          permitCheck: req.placement === 'street',
          deliveryDate: iso ?? req.deliveryDate ?? null,
          deliveryDateLabel: iso ? shortDateLabel(iso) : req.deliveryDate ? dayLabelFromPhrase(req.deliveryDate) : '',
          deliveryWindow: req.deliveryWindow ?? null,
          notes: req.notes ?? null,
          source: 'owner',
        },
      });
      await this.event(tx, order, 'created', null, 'requested', { source: 'owner' });
      await this.audit.log('order.create', 'order', order.id, { number: order.number }, tx);
      return order.id;
    });
    await this.outbox.kick();
    return this.queries.orderDto(id);
  }

  /* ------------------------------------------------------------------ customer channel */

  /** The conversation used to message the customer about an order (creates an SMS one if needed). */
  private async customerConversation(tx: TenantTx, order: Order & { conversation: Conversation | null }): Promise<Conversation> {
    if (order.conversation) return order.conversation;
    const existing = await tx.conversation.findFirst({ where: { contactId: order.contactId, channel: { in: ['sms', 'phone', 'booking_form'] }, state: { not: 'closed' } }, orderBy: { lastMessageAt: 'desc' } });
    const conv = existing ?? (await tx.conversation.create({ data: { tenantId: this.dbs.tenantId, contactId: order.contactId, channel: 'sms', state: 'assistant', origin: 'owner', unread: false } }));
    await tx.order.update({ where: { id: order.id }, data: { conversationId: conv.id } });
    return conv;
  }

  private async depositLink(order: Order & { quote: { totalCents: number } | null }, tenant: { depositCents: number }): Promise<{ url: string; sessionId: string } | null> {
    const stripe = await this.dbs.db.channelAccount.findFirst({ where: { kind: 'stripe' } });
    const accountId = stripe?.status === 'connected' ? stripe.externalAccountId : null;
    if (!this.payments.isConnected(accountId)) return null;
    const amount = Math.min(tenant.depositCents, order.quote?.totalCents ?? tenant.depositCents);
    const site = await this.dbs.db.siteSettings.findFirst();
    const base = site?.customDomain && site.customDomainStatus === 'active' ? `https://${site.customDomain}` : `https://${site?.slug ?? 'site'}.${env().SITES_BASE_DOMAIN}`;
    const link = await this.payments.createDepositLink({
      tenantId: this.dbs.tenantId,
      orderId: order.id,
      orderNumber: order.number,
      amountCents: amount,
      description: `Deposit for order ${order.number}`,
      connectedAccountId: accountId,
      successUrl: `${base}/paid?order=${order.number}`,
      cancelUrl: `${base}/?order=${order.number}`,
    });
    return link;
  }

  /* ------------------------------------------------------------------ actions */

  /** requested → confirmed; texts the customer, with a deposit link when payments are connected. */
  async confirm(id: string): Promise<OrderDto> {
    const tenant = await this.tenant();
    const order = await this.load(id);
    if (!canTransition(order.status, 'confirmed')) throw new ConflictActionException(`An order that is ${ORDER_STATUS_LABELS[order.status].toLowerCase()} can't be confirmed.`);
    const link = order.depositPaid ? null : await this.depositLink(order, tenant);
    await this.dbs.tx(async (tx) => {
      const conv = await this.customerConversation(tx, order);
      await tx.order.update({
        where: { id },
        data: { status: 'confirmed', ...(link ? { depositRequested: true, depositUrl: link.url, paymentSessionId: link.sessionId, paymentProvider: this.payments.provider, depositCents: Math.min(tenant.depositCents, order.quote?.totalCents ?? tenant.depositCents) } : {}) },
      });
      await this.event(tx, order, 'status', order.status, 'confirmed', { depositLink: !!link });
      const what = order.quote ? `${order.quote.yards}-yard` : 'your dumpster';
      const when = order.deliveryDateLabel || (order.deliveryDate ?? 'the day you asked for');
      const body = `Confirmed: ${what} to ${order.address} on ${when}${order.deliveryWindow ? `, ${lcFirst(order.deliveryWindow)}` : ''}.${link ? ` Pay the deposit here to lock it in: ${link.url}` : " We'll text you when the driver is on the way."}`;
      if (await this.contacts.isOptedOut(conv.contactId, 'sms', tx)) {
        await this.messaging.addSystem(tx, conv, 'Order confirmed. Not texted: the customer opted out of texts (STOP).');
      } else {
        await this.messaging.addMessage(tx, conv, { author: 'assistant', body, meta: null });
      }
      await tx.conversation.update({ where: { id: conv.id }, data: { state: 'confirmed', tag: 'Confirmed', handoffReason: null } });
      await this.reviewRequests.ensurePending(tx, order);
      await this.audit.log('order.confirm', 'order', id, { number: order.number }, tx);
    });
    await this.outbox.kick();
    return this.queries.orderDto(id);
  }

  /** Sends (or re-sends) the deposit link. */
  async sendDepositLink(id: string): Promise<OrderDto> {
    const tenant = await this.tenant();
    const order = await this.load(id);
    if (order.depositPaid) throw new ConflictActionException('The deposit is already paid.');
    if (['cancelled', 'closed', 'picked_up'].includes(order.status)) throw new ConflictActionException('This order is finished.');
    const link = order.depositUrl && order.paymentSessionId ? { url: order.depositUrl, sessionId: order.paymentSessionId } : await this.depositLink(order, tenant);
    if (!link) throw new ConflictActionException('Connect Stripe in Setup to send deposit links.', { reason: 'payments_not_connected' });
    await this.dbs.tx(async (tx) => {
      const conv = await this.customerConversation(tx, order);
      await this.messaging.assertCanText(conv, tx);
      await tx.order.update({ where: { id }, data: { depositRequested: true, depositUrl: link.url, paymentSessionId: link.sessionId, paymentProvider: this.payments.provider } });
      await this.messaging.addMessage(tx, conv, { author: 'assistant', body: `Here is the deposit link for your dumpster: ${link.url}` });
      await this.event(tx, order, 'deposit_link', null, null);
      await this.audit.log('order.deposit_link', 'order', id, {}, tx);
    });
    await this.outbox.kick();
    return this.queries.orderDto(id);
  }

  async reschedule(id: string, req: RescheduleOrderRequest): Promise<OrderDto> {
    const tenant = await this.tenant();
    const order = await this.load(id);
    if (['cancelled', 'closed', 'picked_up', 'delivered', 'pickup_requested'].includes(order.status)) throw new ConflictActionException('This order can no longer be rescheduled.');
    const iso = resolveDayPhrase(req.deliveryDate, new Date(), tenant.timezone);
    if (!iso) throw new BadRequestException('Pick a delivery date (YYYY-MM-DD).');
    if (req.deliveryWindow && !(DELIVERY_WINDOWS as readonly string[]).includes(req.deliveryWindow)) throw new BadRequestException('Pick one of the delivery windows.');
    const window = req.deliveryWindow ?? order.deliveryWindow ?? null;
    await this.dbs.tx(async (tx) => {
      await tx.order.update({ where: { id }, data: { deliveryDate: iso, deliveryDateLabel: shortDateLabel(iso), deliveryWindow: window } });
      await this.event(tx, order, 'rescheduled', null, null, { from: order.deliveryDate, to: iso, window });
      if (req.notifyCustomer) {
        const conv = await this.customerConversation(tx, order);
        await this.messaging.assertCanText(conv, tx);
        await this.messaging.addMessage(tx, conv, {
          author: 'assistant',
          body: `Update from ${tenant.name}: your dumpster now arrives ${longDateLabel(iso)}${window ? `, ${lcFirst(window).replace(/\.$/, '')}` : ''}. Reply here if that doesn't work.`,
        });
      }
      await this.audit.log('order.reschedule', 'order', id, { deliveryDate: iso, window, notify: req.notifyCustomer }, tx);
    });
    await this.outbox.kick();
    return this.queries.orderDto(id);
  }

  /** POST /orders/:id/status — enforces ORDER_TRANSITIONS. picked_up schedules the review request. */
  async setStatus(id: string, to: OrderStatus): Promise<OrderDto> {
    const order = await this.load(id);
    if (to === 'confirmed') return this.confirm(id);
    if (!canTransition(order.status, to)) {
      throw new ConflictActionException(`Can't move an order from ${ORDER_STATUS_LABELS[order.status]} to ${ORDER_STATUS_LABELS[to]}.`, { from: order.status, to });
    }
    await this.dbs.tx(async (tx) => {
      const now = new Date();
      await tx.order.update({
        where: { id },
        data: { status: to, ...(to === 'delivered' ? { deliveredAt: now } : {}), ...(to === 'picked_up' ? { pickedUpAt: now } : {}), ...(to === 'deposit_paid' ? { depositPaid: true, paidAt: order.paidAt ?? now } : {}) },
      });
      await this.event(tx, order, 'status', order.status, to);
      if (to === 'picked_up') await this.reviewRequests.onPickedUp(tx, { ...order, pickedUpAt: now });
      if (to === 'cancelled') await this.reviewRequests.onCancelled(tx, order);
      if (order.conversationId && (to === 'cancelled' || to === 'closed')) {
        await tx.conversation.update({ where: { id: order.conversationId }, data: { tag: to === 'cancelled' ? 'Cancelled' : 'Closed', ...(to === 'closed' ? { state: 'closed' } : {}) } });
      }
      await this.audit.log('order.status', 'order', id, { from: order.status, to }, tx);
    });
    await this.outbox.kick();
    return this.queries.orderDto(id);
  }

  /** Payment provider says the deposit is paid (Stripe webhook or the mock "mark paid" endpoint). */
  async markDepositPaid(input: { orderId?: string | null; sessionId?: string | null; amountCents?: number | null; eventId: string }): Promise<OrderDto | null> {
    const order = input.orderId
      ? await this.dbs.db.order.findUnique({ where: { id: input.orderId }, include: { quote: true, conversation: true } })
      : input.sessionId
        ? await this.dbs.db.order.findFirst({ where: { paymentSessionId: input.sessionId }, include: { quote: true, conversation: true } })
        : null;
    if (!order) return null;
    if (order.depositPaid) return this.queries.orderDto(order.id);
    await this.dbs.tx(async (tx) => {
      const to: OrderStatus | null = canTransition(order.status, 'deposit_paid') ? 'deposit_paid' : null;
      await tx.order.update({ where: { id: order.id }, data: { depositPaid: true, paidAt: new Date(), ...(to ? { status: to } : {}), ...(input.amountCents ? { depositCents: input.amountCents } : {}) } });
      await this.event(tx, order, 'deposit_paid', order.status, to, { eventId: input.eventId, amountCents: input.amountCents ?? null });
      const conv = order.conversation ?? (await this.customerConversation(tx, order));
      await this.messaging.addSystem(tx, conv, `Deposit paid${input.amountCents ? ` (${formatMoney(input.amountCents)})` : ''} for order ${order.number}.`);
      await this.notifications.notifyOwner(tx, { title: 'Deposit paid', body: `Deposit paid for ${order.number}, ${order.address}.`, href: `/orders/${order.id}` });
    });
    await this.outbox.kick();
    return this.queries.orderDto(order.id);
  }
}
