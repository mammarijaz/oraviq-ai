import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import webpush from 'web-push';
import { env } from '../../config/env';
import { ChannelRouter } from '../../integrations/channel-router';
import { OutboxService, type RealtimeRef } from '../../jobs/outbox.service';
import { DbService } from '../../prisma/db.service';
import type { TenantTx } from '../../prisma/tenant-prisma';
import { RealtimeService } from '../../realtime/realtime.service';
import { InboxQueries } from '../inbox/inbox.queries';
import { toReviewDto } from '../inbox/mappers';

export interface OwnerAlert {
  title: string;
  body: string;
  href?: string;
  /** Text the owner too (handoffs, new orders, missed calls). */
  sms?: boolean;
}

/**
 * Owner alerts: a Notification row, an SMS to the tenant's alert phone through
 * the messaging adapter, web push to the owner's PWA, and a realtime event.
 * Also the realtime dispatcher that turns outbox refs into contract DTOs.
 */
@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger('Notifications');
  private pushReady = false;

  constructor(
    private readonly dbs: DbService,
    private readonly outbox: OutboxService,
    private readonly router: ChannelRouter,
    private readonly realtime: RealtimeService,
    private readonly queries: InboxQueries,
  ) {}

  onModuleInit(): void {
    const e = env();
    if (e.VAPID_PUBLIC_KEY && e.VAPID_PRIVATE_KEY) {
      webpush.setVapidDetails(e.VAPID_SUBJECT, e.VAPID_PUBLIC_KEY, e.VAPID_PRIVATE_KEY);
      this.pushReady = true;
    }
    this.outbox.registerDispatcher('owner.alert', (p) => this.deliverAlert(p as OwnerAlert));
    this.outbox.registerDispatcher('realtime', (p) => this.dispatchRealtime(p as RealtimeRef));
  }

  /** Queue an owner alert inside the caller's transaction. */
  notifyOwner(tx: TenantTx, alert: OwnerAlert): Promise<void> {
    return this.outbox.add(tx, this.dbs.tenantId, 'owner.alert', alert as unknown as Record<string, unknown>);
  }

  private async deliverAlert(a: OwnerAlert): Promise<void> {
    const tenantId = this.dbs.tenantId;
    const tenant = await this.dbs.system.tenant.findUnique({ where: { id: tenantId } });
    const delivery: Record<string, unknown> = {};
    if (a.sms && tenant?.alertPhone) {
      const route = await this.router.resolve('sms');
      const res = await route.adapter.send({
        tenantId,
        channel: 'sms',
        from: route.from,
        to: tenant.alertPhone,
        body: `Oraviq: ${a.body}`,
        idempotencyKey: `alert_${tenantId}_${Buffer.from(a.body).toString('base64url').slice(0, 40)}_${Math.floor(Date.now() / 60000)}`,
      });
      delivery.sms = { to: tenant.alertPhone, provider: res.provider, providerMessageId: res.providerMessageId };
    }
    const subs = await this.dbs.db.pushSubscription.findMany();
    let pushed = 0;
    if (this.pushReady) {
      for (const s of subs) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys as { p256dh: string; auth: string } }, JSON.stringify({ title: a.title, body: a.body, href: a.href }));
          pushed++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) await this.dbs.db.pushSubscription.delete({ where: { id: s.id } });
        }
      }
    }
    delivery.push = pushed;
    await this.dbs.db.notification.create({ data: { tenantId, title: a.title, body: a.body, href: a.href ?? null, delivery: delivery as Prisma.InputJsonValue } });
    await this.realtime.publish(tenantId, 'notification', { title: a.title, body: a.body, href: a.href });
  }

  private async dispatchRealtime(ref: RealtimeRef): Promise<void> {
    const tenantId = this.dbs.tenantId;
    try {
      switch (ref.event) {
        case 'conversation.updated':
          return await this.realtime.publish(tenantId, ref.event, await this.queries.conversationSummary(ref.id!));
        case 'message.created':
          return await this.realtime.publish(tenantId, ref.event, await this.queries.messageDto(ref.id!));
        case 'order.updated':
          return await this.realtime.publish(tenantId, ref.event, await this.queries.orderDto(ref.id!));
        case 'call.updated': {
          const c = await this.queries.callDto(ref.id!);
          return await this.realtime.publish(tenantId, ref.event, c);
        }
        case 'review.created': {
          const r = await this.dbs.db.review.findUnique({ where: { id: ref.id! }, include: { drafts: true } });
          if (r) await this.realtime.publish(tenantId, ref.event, toReviewDto(r));
          return;
        }
        case 'notification':
          return await this.realtime.publish(tenantId, ref.event, ref.data);
      }
    } catch (e) {
      // A row deleted before dispatch is not worth retrying.
      if (e instanceof NotFoundException) return;
      throw e;
    }
  }
}
