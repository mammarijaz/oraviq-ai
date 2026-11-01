import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import type { ReviewRequestJobDto, ReviewRequestSettingsDto } from '@oraviq/shared';
import type { Conversation, Order, ReviewRequestSettings } from '@prisma/client';
import { ConflictActionException } from '../../common/errors';
import { clockLabel, isoDateIn } from '../../common/time';
import { OutboxService } from '../../jobs/outbox.service';
import { ScheduledActionsService } from '../../jobs/scheduled-actions.service';
import { DbService } from '../../prisma/db.service';
import type { TenantTx } from '../../prisma/tenant-prisma';
import { AuditService } from '../audit/audit.service';
import { ContactsService } from '../contacts/contacts.service';
import { MessagingService } from '../messaging/messaging.service';

export const DEFAULT_REVIEW_TEMPLATE = (business: string, link: string | null) =>
  `Thanks for renting with ${business}, {first name}. Would you leave us a quick Google review? It helps a small business a lot: ${link ?? '{review link}'}`;

/** Review requests: texted a set delay after pickup (scheduled_actions), or sent by hand. */
@Injectable()
export class ReviewRequestsService implements OnModuleInit {
  constructor(
    private readonly dbs: DbService,
    private readonly scheduled: ScheduledActionsService,
    private readonly messaging: MessagingService,
    private readonly contacts: ContactsService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.scheduled.registerHandler('review_request.send', async (p) => {
      await this.send(String(p.orderId), { automatic: true });
    });
  }

  async settings(tx: TenantTx = this.dbs.db): Promise<ReviewRequestSettings> {
    const s = await tx.reviewRequestSettings.findFirst();
    if (!s) throw new NotFoundException('Review request settings missing.');
    return s;
  }

  toSettingsDto(s: ReviewRequestSettings): ReviewRequestSettingsDto {
    return { enabled: s.enabled, delayMinutes: s.delayMinutes, template: s.template, reviewLink: s.reviewLink };
  }

  async updateSettings(body: Partial<ReviewRequestSettingsDto>): Promise<ReviewRequestSettingsDto> {
    const s = await this.settings();
    const data: Partial<ReviewRequestSettings> = {};
    if (body.enabled !== undefined) data.enabled = !!body.enabled;
    if (body.delayMinutes !== undefined) {
      const d = Number(body.delayMinutes);
      if (!Number.isInteger(d) || d < 0 || d > 60 * 24 * 14) throw new BadRequestException('The delay must be between 0 minutes and 14 days.');
      data.delayMinutes = d;
    }
    if (body.template !== undefined) {
      const t = String(body.template).trim();
      if (!t) throw new BadRequestException('Write the review request message.');
      if (t.length > 480) throw new BadRequestException('Keep the message under 480 characters.');
      data.template = t;
    }
    if (body.reviewLink !== undefined) data.reviewLink = body.reviewLink ? String(body.reviewLink).trim() : null;
    const updated = await this.dbs.db.reviewRequestSettings.update({ where: { id: s.id }, data });
    await this.audit.log('review_requests.settings', 'review_request_settings', s.id, data as Record<string, unknown>);
    return this.toSettingsDto(updated);
  }

  render(template: string, firstName: string, link: string | null): string {
    return template.replace(/\{first name\}/gi, firstName).replace(/\{review link\}/gi, link ?? '');
  }

  /** On confirm: the order appears in "Recent jobs" as waiting for pickup. */
  async ensurePending(tx: TenantTx, order: Pick<Order, 'id' | 'contactId'>): Promise<void> {
    await tx.reviewRequest.upsert({
      where: { tenantId_orderId: { tenantId: this.dbs.tenantId, orderId: order.id } },
      create: { tenantId: this.dbs.tenantId, orderId: order.id, contactId: order.contactId, status: 'scheduled' },
      update: {},
    });
  }

  /** picked_up: schedule the text `delayMinutes` later when automatic requests are on. */
  async onPickedUp(tx: TenantTx, order: Pick<Order, 'id' | 'contactId' | 'pickedUpAt'>): Promise<void> {
    const s = await this.settings(tx);
    const optedOut = await this.contacts.isOptedOut(order.contactId, 'sms', tx);
    const sendAt = s.enabled && !optedOut ? new Date((order.pickedUpAt ?? new Date()).getTime() + s.delayMinutes * 60000) : null;
    await tx.reviewRequest.upsert({
      where: { tenantId_orderId: { tenantId: this.dbs.tenantId, orderId: order.id } },
      create: { tenantId: this.dbs.tenantId, orderId: order.id, contactId: order.contactId, status: optedOut ? 'skipped' : 'ready', sendAt },
      update: { status: optedOut ? 'skipped' : 'ready', sendAt },
    });
    if (sendAt) {
      await this.scheduled.schedule(tx, { tenantId: this.dbs.tenantId, kind: 'review_request.send', runAt: sendAt, payload: { orderId: order.id }, dedupeKey: `review_request:${order.id}` });
    }
  }

  async onCancelled(tx: TenantTx, order: Pick<Order, 'id'>): Promise<void> {
    await tx.reviewRequest.updateMany({ where: { orderId: order.id, status: { in: ['scheduled', 'ready'] } }, data: { status: 'skipped', sendAt: null } });
    await tx.scheduledAction.updateMany({ where: { dedupeKey: `review_request:${order.id}`, status: 'pending' }, data: { status: 'cancelled' } });
  }

  /** POST /review-requests/:orderId/send, and the scheduled job. */
  async send(orderId: string, opts: { automatic?: boolean } = {}): Promise<ReviewRequestJobDto> {
    const order = await this.dbs.db.order.findUnique({ where: { id: orderId }, include: { contact: true, conversation: true, quote: true } });
    if (!order) throw new NotFoundException('Order not found.');
    const s = await this.settings();
    const rr = await this.dbs.db.reviewRequest.findFirst({ where: { orderId } });
    if (opts.automatic && (!s.enabled || !rr || rr.status !== 'ready')) return this.jobDto(orderId);
    if (rr && ['sent', 'reviewed'].includes(rr.status) && !opts.automatic) throw new ConflictActionException('A review request was already sent for this order.');
    if (order.status === 'cancelled') throw new ConflictActionException("This order was cancelled, so there's nothing to review.");
    const optedOut = await this.contacts.isOptedOut(order.contactId);
    if (optedOut) {
      await this.dbs.db.reviewRequest.upsert({
        where: { tenantId_orderId: { tenantId: this.dbs.tenantId, orderId } },
        create: { tenantId: this.dbs.tenantId, orderId, contactId: order.contactId, status: 'skipped' },
        update: { status: 'skipped', sendAt: null },
      });
      if (opts.automatic) return this.jobDto(orderId);
      throw new ConflictActionException('This customer replied STOP, so review requests are skipped.', { reason: 'opted_out' });
    }
    const first = (order.contact.name ?? '').trim().split(/\s+/)[0] || 'there';
    const body = this.render(s.template, first, s.reviewLink);
    await this.dbs.tx(async (tx) => {
      let conv: Conversation | null = order.conversation;
      if (!conv || !['sms', 'phone', 'booking_form'].includes(conv.channel)) {
        conv =
          (await tx.conversation.findFirst({ where: { contactId: order.contactId, channel: { in: ['sms', 'phone', 'booking_form'] } }, orderBy: { lastMessageAt: 'desc' } })) ??
          (await tx.conversation.create({ data: { tenantId: this.dbs.tenantId, contactId: order.contactId, channel: 'sms', state: 'closed', origin: 'owner', unread: false } }));
      }
      const msg = await this.messaging.addMessage(tx, conv, { author: 'assistant', body, channel: conv.channel === 'phone' || conv.channel === 'booking_form' ? conv.channel : 'sms' });
      await tx.reviewRequest.upsert({
        where: { tenantId_orderId: { tenantId: this.dbs.tenantId, orderId } },
        create: { tenantId: this.dbs.tenantId, orderId, contactId: order.contactId, status: 'sent', sentAt: new Date(), messageId: msg.id },
        update: { status: 'sent', sentAt: new Date(), sendAt: null, messageId: msg.id },
      });
      await tx.scheduledAction.updateMany({ where: { dedupeKey: `review_request:${orderId}`, status: 'pending' }, data: { status: 'cancelled' } });
      if (!opts.automatic) await this.audit.log('review_request.send', 'order', orderId, {}, tx);
    });
    await this.outbox.kick();
    return this.jobDto(orderId);
  }

  private label(order: Order & { quote: { yards: number } | null }, tz: string, now = new Date()): string {
    const size = order.quote ? `${order.quote.yards}-yard` : 'Dumpster';
    if (order.pickedUpAt) {
      const sameDay = isoDateIn(order.pickedUpAt, tz) === isoDateIn(now, tz);
      const when = sameDay ? `today, ${clockLabel(order.pickedUpAt, tz)}` : order.pickedUpAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: tz });
      return `${size} · picked up ${when}`;
    }
    return `${size} · delivery ${order.deliveryDateLabel || order.deliveryDate || 'to be scheduled'}`;
  }

  async jobDto(orderId: string): Promise<ReviewRequestJobDto> {
    const jobs = await this.jobs([orderId]);
    if (!jobs[0]) throw new NotFoundException('Order not found.');
    return jobs[0];
  }

  /** Recent jobs for the Reviews page. */
  async jobs(onlyOrderIds?: string[]): Promise<ReviewRequestJobDto[]> {
    const tenant = await this.dbs.system.tenant.findUnique({ where: { id: this.dbs.tenantId } });
    const tz = tenant?.timezone ?? 'America/New_York';
    const rows = await this.dbs.db.reviewRequest.findMany({ where: onlyOrderIds ? { orderId: { in: onlyOrderIds } } : {}, orderBy: { updatedAt: 'desc' }, take: 20 });
    const orders = await this.dbs.db.order.findMany({ where: { id: { in: rows.map((r) => r.orderId).concat(onlyOrderIds ?? []) } }, include: { contact: true, quote: true } });
    const byId = new Map(orders.map((o) => [o.id, o]));
    const rank: Record<string, number> = { ready: 0, scheduled: 1, sent: 2, reviewed: 3, skipped: 4 };
    const list = rows
      .filter((r) => byId.has(r.orderId))
      .map((r) => {
        const o = byId.get(r.orderId)!;
        return {
          orderId: o.id,
          customerName: o.contact.company ?? o.contact.name ?? 'Customer',
          jobLabel: this.label(o, tz),
          status: r.status,
          sendAt: r.sendAt?.toISOString() ?? null,
          _sort: r.status === 'sent' || r.status === 'reviewed' ? -(o.pickedUpAt?.getTime() ?? 0) : 0,
        };
      });
    if (onlyOrderIds && !list.length) {
      const o = byId.get(onlyOrderIds[0]);
      if (o) return [{ orderId: o.id, customerName: o.contact.company ?? o.contact.name ?? 'Customer', jobLabel: this.label(o, tz), status: 'scheduled', sendAt: null }];
    }
    list.sort((a, b) => rank[a.status] - rank[b.status] || a._sort - b._sort);
    return list.map(({ _sort, ...j }) => j);
  }
}
