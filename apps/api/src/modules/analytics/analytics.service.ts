import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

interface DateRange {
  from: Date;
  to: Date;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(orgId: string, range: DateRange) {
    const { from, to } = range;

    const [totalConversations, resolvedConversations, totalMessages] =
      await Promise.all([
        this.prisma.conversation.count({
          where: { organizationId: orgId, createdAt: { gte: from, lte: to } },
        }),
        this.prisma.conversation.count({
          where: {
            organizationId: orgId,
            status: 'RESOLVED',
            createdAt: { gte: from, lte: to },
          },
        }),
        this.prisma.message.count({
          where: {
            conversation: { organizationId: orgId },
            createdAt: { gte: from, lte: to },
          },
        }),
      ]);

    // avg response time: first inbound → first outbound per conversation (sample)
    const avgResponseTime = await this.calcAvgResponseTime(orgId, range);

    const resolutionRate =
      totalConversations > 0
        ? Math.round((resolvedConversations / totalConversations) * 100)
        : 0;

    return {
      totalConversations,
      totalMessages,
      avgResponseTime,
      resolutionRate,
    };
  }

  async getMessagesByDay(orgId: string, range: DateRange) {
    const { from, to } = range;

    const messages = await this.prisma.message.findMany({
      where: {
        conversation: { organizationId: orgId },
        createdAt: { gte: from, lte: to },
      },
      select: { createdAt: true, direction: true },
    });

    const dayMap = new Map<string, { date: string; inbound: number; outbound: number }>();

    for (const msg of messages) {
      const date = msg.createdAt.toISOString().substring(0, 10);
      if (!dayMap.has(date)) {
        dayMap.set(date, { date, inbound: 0, outbound: 0 });
      }
      const entry = dayMap.get(date)!;
      if (msg.direction === 'INBOUND') {
        entry.inbound += 1;
      } else {
        entry.outbound += 1;
      }
    }

    return Array.from(dayMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }

  async getConversationsByChannel(orgId: string, range: DateRange) {
    const { from, to } = range;

    const grouped = await this.prisma.conversation.groupBy({
      by: ['channel'],
      where: { organizationId: orgId, createdAt: { gte: from, lte: to } },
      _count: { id: true },
    });

    return grouped.map((g) => ({
      channel: g.channel,
      count: g._count.id,
    }));
  }

  async getAgentPerformance(orgId: string, range: DateRange) {
    const { from, to } = range;

    const grouped = await this.prisma.conversation.groupBy({
      by: ['assigneeId'],
      where: {
        organizationId: orgId,
        assigneeId: { not: null },
        createdAt: { gte: from, lte: to },
      },
      _count: { id: true },
    });

    const agents = await this.prisma.user.findMany({
      where: {
        organizationId: orgId,
        id: { in: grouped.map((g) => g.assigneeId!).filter(Boolean) },
      },
      select: { id: true, name: true },
    });

    const agentMap = new Map(agents.map((a) => [a.id, a.name]));

    return Promise.all(
      grouped
        .filter((g) => g.assigneeId)
        .map(async (g) => {
          const avgResponseTime = await this.calcAvgResponseTimeForAgent(
            orgId,
            g.assigneeId!,
            range,
          );
          return {
            agentId: g.assigneeId,
            name: agentMap.get(g.assigneeId!) ?? 'Unknown',
            conversations: g._count.id,
            avgResponseTime,
          };
        }),
    );
  }

  async getAiStats(orgId: string, range: DateRange) {
    const { from, to } = range;

    const [handled, escalated, total] = await Promise.all([
      this.prisma.message.count({
        where: {
          type: 'AI',
          direction: 'OUTBOUND',
          conversation: { organizationId: orgId },
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.message.count({
        where: {
          type: 'SYSTEM',
          content: { contains: 'escalat' },
          conversation: { organizationId: orgId },
          createdAt: { gte: from, lte: to },
        },
      }),
      this.prisma.conversation.count({
        where: { organizationId: orgId, createdAt: { gte: from, lte: to } },
      }),
    ]);

    const resolutionRate = total > 0 ? Math.round((handled / total) * 100) : 0;

    return { handled, escalated, resolutionRate };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async calcAvgResponseTime(orgId: string, range: DateRange): Promise<number> {
    const { from, to } = range;

    // Get conversations with their first inbound and first outbound messages
    const conversations = await this.prisma.conversation.findMany({
      where: { organizationId: orgId, createdAt: { gte: from, lte: to } },
      select: { id: true },
      take: 500, // sample cap
    });

    if (conversations.length === 0) return 0;

    const times: number[] = [];

    await Promise.all(
      conversations.map(async (conv) => {
        const [firstInbound, firstOutbound] = await Promise.all([
          this.prisma.message.findFirst({
            where: { conversationId: conv.id, direction: 'INBOUND' },
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          }),
          this.prisma.message.findFirst({
            where: { conversationId: conv.id, direction: 'OUTBOUND' },
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          }),
        ]);

        if (firstInbound && firstOutbound) {
          const diff =
            firstOutbound.createdAt.getTime() - firstInbound.createdAt.getTime();
          if (diff > 0) times.push(diff);
        }
      }),
    );

    if (times.length === 0) return 0;
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    return Math.round(avg / 1000); // seconds
  }

  private async calcAvgResponseTimeForAgent(
    orgId: string,
    agentId: string,
    range: DateRange,
  ): Promise<number> {
    const { from, to } = range;

    const conversations = await this.prisma.conversation.findMany({
      where: {
        organizationId: orgId,
        assigneeId: agentId,
        createdAt: { gte: from, lte: to },
      },
      select: { id: true },
      take: 200,
    });

    if (conversations.length === 0) return 0;

    const times: number[] = [];

    await Promise.all(
      conversations.map(async (conv) => {
        const [firstInbound, firstOutbound] = await Promise.all([
          this.prisma.message.findFirst({
            where: { conversationId: conv.id, direction: 'INBOUND' },
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          }),
          this.prisma.message.findFirst({
            where: {
              conversationId: conv.id,
              direction: 'OUTBOUND',
              senderId: agentId,
            },
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          }),
        ]);

        if (firstInbound && firstOutbound) {
          const diff =
            firstOutbound.createdAt.getTime() - firstInbound.createdAt.getTime();
          if (diff > 0) times.push(diff);
        }
      }),
    );

    if (times.length === 0) return 0;
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    return Math.round(avg / 1000);
  }
}
