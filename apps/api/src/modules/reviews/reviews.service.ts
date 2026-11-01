import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ReviewDto, ReviewSource, ReviewStatsDto } from '@oraviq/shared';
import { Prisma } from '@prisma/client';
import { normalizePhone } from '../../common/phone';
import { TenantContext } from '../../core/tenant-context';
import { LLM_PROVIDER, REVIEWS_ADAPTER, type LlmProvider, type ReviewsAdapter } from '../../integrations/types';
import { OutboxService } from '../../jobs/outbox.service';
import { DbService } from '../../prisma/db.service';
import { AuditService } from '../audit/audit.service';
import { toReviewDto } from '../inbox/mappers';
import { NotificationsService } from '../notifications/notifications.service';

/** Google and Facebook reviews: list, AI reply drafts, owner-approved replies through the reviews adapter. */
@Injectable()
export class ReviewsService {
  private readonly logger = new Logger('Reviews');

  constructor(
    private readonly dbs: DbService,
    private readonly ctx: TenantContext,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    @Inject(REVIEWS_ADAPTER) private readonly adapter: ReviewsAdapter,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(q: { replied?: string; source?: string[]; rating?: string[] }): Promise<{ items: ReviewDto[]; stats: ReviewStatsDto }> {
    const where: Prisma.ReviewWhereInput = {};
    if (q.replied === 'true') where.reply = { not: null };
    if (q.replied === 'false') where.reply = null;
    if (q.source?.length) where.source = { in: q.source as ReviewSource[] };
    if (q.rating?.length) where.rating = { in: q.rating.map(Number).filter((n) => n >= 1 && n <= 5) };
    const rows = await this.dbs.db.review.findMany({ where, include: { drafts: true }, orderBy: { createdAt: 'desc' }, take: 200 });
    return { items: rows.map(toReviewDto), stats: await this.stats() };
  }

  async stats(): Promise<ReviewStatsDto> {
    const db = this.dbs.db;
    const tenant = await this.dbs.system.tenant.findUniqueOrThrow({ where: { id: this.dbs.tenantId } });
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const [summaries, google, facebook, newThisMonth, requestsThisMonth, waiting] = await Promise.all([
      db.reviewSourceStats.findMany(),
      db.review.aggregate({ where: { source: 'google', rating: { not: null } }, _avg: { rating: true }, _count: { _all: true } }),
      db.review.findMany({ where: { source: 'facebook' }, select: { recommends: true } }),
      db.review.count({ where: { createdAt: { gte: monthStart } } }),
      db.reviewRequest.count({ where: { sentAt: { gte: monthStart } } }),
      db.review.count({ where: { reply: null } }),
    ]);
    void tenant;
    // Profile-level aggregates come from the provider (Google/Meta) when synced; otherwise from stored reviews.
    const g = summaries.find((s) => s.source === 'google');
    const f = summaries.find((s) => s.source === 'facebook');
    const fbRec = facebook.filter((r) => r.recommends != null);
    return {
      googleRating: g?.rating ?? (google._avg.rating != null ? Math.round(google._avg.rating * 10) / 10 : null),
      googleCount: g?.count ?? google._count._all,
      facebookRecommendPct: f?.recommendPct ?? (fbRec.length ? Math.round((fbRec.filter((r) => r.recommends).length / fbRec.length) * 100) : null),
      facebookCount: f?.count ?? facebook.length,
      newThisMonth,
      requestsThisMonth,
      waitingForReply: waiting,
    };
  }

  private async load(id: string) {
    const r = await this.dbs.db.review.findUnique({ where: { id }, include: { drafts: { orderBy: { createdAt: 'asc' } } } });
    if (!r) throw new NotFoundException('Review not found.');
    return r;
  }

  /** POST /reviews/:id/draft — a new AI draft (never posted without the owner). */
  async draft(id: string): Promise<ReviewDto> {
    const r = await this.load(id);
    if (r.reply) throw new BadRequestException('This review already has a reply.');
    const tenant = await this.dbs.system.tenant.findUniqueOrThrow({ where: { id: this.dbs.tenantId } });
    const current = r.drafts[r.drafts.length - 1]?.text ?? null;
    const out = await this.llm.draftReviewReply({
      businessName: tenant.name,
      source: r.source,
      author: r.author,
      rating: r.rating,
      recommends: r.recommends,
      text: r.text,
      previousDrafts: r.drafts.map((d) => d.text),
      currentDraft: current,
    });
    await this.dbs.db.reviewReplyDraft.create({ data: { tenantId: this.dbs.tenantId, reviewId: r.id, text: out.text, aiGenerated: true, aiTraceId: out.traceId } });
    return toReviewDto(await this.load(id));
  }

  /** POST /reviews/:id/reply — posts through the reviews adapter after the owner approves. */
  async reply(id: string, text: string): Promise<ReviewDto> {
    const r = await this.load(id);
    const body = String(text ?? '').trim();
    if (!body) throw new BadRequestException('Write a reply first.');
    if (body.length > 4000) throw new BadRequestException('Keep the reply under 4,000 characters.');
    if (r.reply) throw new BadRequestException('This review already has a reply.');
    const account = await this.dbs.db.channelAccount.findFirst({ where: { kind: r.source === 'google' ? 'google' : 'facebook' } });
    await this.adapter.reply({ tenantId: this.dbs.tenantId, source: r.source, externalId: r.externalId, text: body, accountId: account?.externalAccountId ?? null });
    await this.dbs.tx(async (tx) => {
      await tx.review.update({ where: { id }, data: { reply: body, repliedAt: new Date() } });
      await this.audit.log('review.reply', 'review', id, { source: r.source }, tx);
    });
    return toReviewDto(await this.load(id));
  }

  /** A new review arrived from the provider (webhook): store, draft a reply, alert on low ratings. */
  async ingest(tenantId: string, input: { source: ReviewSource; externalId: string; author: string; rating: number | null; recommends: boolean | null; text: string; createdAt?: Date; reply?: string | null }): Promise<void> {
    await this.ctx.run(tenantId, async () => {
      const existing = await this.dbs.db.review.findFirst({ where: { source: input.source, externalId: input.externalId } });
      if (existing) {
        await this.dbs.db.review.update({ where: { id: existing.id }, data: { text: input.text, rating: input.rating, recommends: input.recommends, ...(input.reply ? { reply: input.reply } : {}) } });
        return;
      }
      const review = await this.dbs.tx(async (tx) => {
        const row = await tx.review.create({
          data: { tenantId, source: input.source, externalId: input.externalId, author: input.author, rating: input.rating, recommends: input.recommends, text: input.text, createdAt: input.createdAt ?? new Date(), reply: input.reply ?? null },
        });
        // Match the reviewer to a recent customer so the job shows "Reviewed".
        const contact = await tx.contact.findFirst({ where: { name: { equals: input.author, mode: 'insensitive' } } });
        if (contact) {
          await tx.review.update({ where: { id: row.id }, data: { contactId: contact.id } });
          const phone = await tx.contactIdentity.findFirst({ where: { contactId: contact.id, channel: { in: ['sms', 'phone'] } } });
          if (phone) await tx.review.update({ where: { id: row.id }, data: { customerPhone: normalizePhone(phone.addressNormalized) } });
          await tx.reviewRequest.updateMany({ where: { contactId: contact.id, status: 'sent' }, data: { status: 'reviewed' } });
        }
        if ((input.rating ?? 5) <= 2) {
          await this.notifications.notifyOwner(tx, { title: 'Low review', body: `A ${input.rating}-star ${input.source === 'google' ? 'Google' : 'Facebook'} review from ${input.author}. Consider calling before you reply.`, href: `/reviews`, sms: true });
        }
        await this.outbox.realtime(tx, tenantId, { event: 'review.created', id: row.id });
        return row;
      });
      if (!review.reply) {
        try {
          await this.draft(review.id);
        } catch (e) {
          this.logger.warn(`Draft failed for review ${review.id}: ${(e as Error).message}`);
        }
      }
      await this.outbox.kick();
    });
  }
}
