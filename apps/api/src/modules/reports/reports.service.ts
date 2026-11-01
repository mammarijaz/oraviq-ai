import { BadRequestException, Injectable } from '@nestjs/common';
import type { Channel, WeeklyReportDto } from '@oraviq/shared';
import { addDaysIso, isAfterHours, isoDateIn, zonedTimeToUtc } from '../../common/time';
import { DbService } from '../../prisma/db.service';

/** The weekly report, computed from real rows in the tenant's time zone. */
@Injectable()
export class ReportsService {
  constructor(private readonly dbs: DbService) {}

  async weekly(to?: string): Promise<WeeklyReportDto> {
    const db = this.dbs.db;
    const tenant = await this.dbs.system.tenant.findUniqueOrThrow({ where: { id: this.dbs.tenantId } });
    const tz = tenant.timezone;
    if (to && !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new BadRequestException('Use to=YYYY-MM-DD.');
    const toIso = to ?? isoDateIn(new Date(), tz);
    const fromIso = addDaysIso(toIso, -6);
    const start = zonedTimeToUtc(fromIso, 0, 0, tz);
    const end = zonedTimeToUtc(addDaysIso(toIso, 1), 0, 0, tz);
    const range = { gte: start, lt: end };

    const [convs, quotes, orders, calls] = await Promise.all([
      db.conversation.findMany({ where: { createdAt: range, simulated: false }, select: { id: true, channel: true, createdAt: true, origin: true } }),
      db.quote.count({ where: { createdAt: range, conversationId: { not: null }, conversation: { simulated: false } } }),
      db.order.findMany({ where: { createdAt: range, status: { not: 'cancelled' }, source: { not: 'seed_history' } }, select: { createdAt: true, createdByAi: true, quote: { select: { totalCents: true } }, conversation: { select: { simulated: true } } } }),
      db.call.findMany({ where: { startedAt: range, isTest: false }, select: { id: true } }),
    ]);
    const realOrders = orders.filter((o) => !o.conversation?.simulated);
    const hours = tenant.businessHours as any;
    const afterOrMissed = convs.filter((c) => c.origin === 'missed_call' || c.origin === 'call' || isAfterHours(c.createdAt, hours, tz)).length;

    // Median time from a customer's first message to the first reply (assistant or owner).
    const ids = convs.map((c) => c.id);
    const msgs = ids.length
      ? await db.message.findMany({ where: { conversationId: { in: ids }, author: { in: ['customer', 'assistant', 'owner'] }, status: { not: 'draft' } }, select: { conversationId: true, author: true, createdAt: true }, orderBy: { createdAt: 'asc' } })
      : [];
    const byConv = new Map<string, typeof msgs>();
    for (const m of msgs) byConv.set(m.conversationId, [...(byConv.get(m.conversationId) ?? []), m]);
    const delays: number[] = [];
    for (const list of byConv.values()) {
      const first = list.find((m) => m.author === 'customer');
      if (!first) continue;
      const reply = list.find((m) => m.author !== 'customer' && m.createdAt >= first.createdAt);
      if (reply) delays.push((reply.createdAt.getTime() - first.createdAt.getTime()) / 1000);
    }
    delays.sort((a, b) => a - b);
    const median = delays.length ? Math.round(delays.length % 2 ? delays[(delays.length - 1) / 2] : (delays[delays.length / 2 - 1] + delays[delays.length / 2]) / 2) : null;

    const byDay = Array.from({ length: 7 }, (_, i) => {
      const day = addDaysIso(fromIso, i);
      return {
        day,
        inquiries: convs.filter((c) => isoDateIn(c.createdAt, tz) === day).length,
        orders: realOrders.filter((o) => isoDateIn(o.createdAt, tz) === day).length,
      };
    });
    const channelCounts = new Map<Channel, number>();
    for (const c of convs) channelCounts.set(c.channel, (channelCounts.get(c.channel) ?? 0) + 1);
    // Phone leads = every call the receptionist handled this week, so "answered X of Y" never reads X > Y.
    if (calls.length) channelCounts.set('phone', Math.max(channelCounts.get('phone') ?? 0, calls.length));
    const byChannel = [...channelCounts.entries()].map(([channel, count]) => ({ channel, count })).sort((a, b) => b.count - a.count);

    return {
      from: fromIso,
      to: toIso,
      leadsAfterHoursOrMissed: afterOrMissed,
      newInquiries: convs.length,
      quotesSent: quotes,
      medianReplySeconds: median,
      ordersBooked: realOrders.length,
      ordersByAssistant: realOrders.filter((o) => o.createdByAi).length,
      bookedValueCents: realOrders.reduce((s, o) => s + (o.quote?.totalCents ?? 0), 0),
      byDay,
      byChannel,
      receptionistAnswered: calls.length,
    };
  }
}
