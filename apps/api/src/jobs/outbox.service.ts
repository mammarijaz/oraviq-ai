import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext } from '../core/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from './jobs.service';

type OutboxWriter = { outbox: { create: (args: { data: Prisma.OutboxUncheckedCreateInput }) => Promise<unknown> } };
type Dispatcher = (payload: any, row: { id: string; tenantId: string | null; attempts: number }) => Promise<void>;

export interface RealtimeRef {
  event: 'conversation.updated' | 'message.created' | 'order.updated' | 'call.updated' | 'review.created' | 'notification';
  id?: string;
  data?: Record<string, unknown>;
}

const MAX_ATTEMPTS = 6;

/**
 * Transactional outbox. Side effects (sending a message, alerting the owner,
 * realtime events) are written in the same transaction as the state change and
 * dispatched after commit, so nothing is emitted for a rolled-back change and
 * nothing is lost if the process dies.
 */
@Injectable()
export class OutboxService implements OnModuleInit {
  private readonly logger = new Logger('Outbox');
  private readonly dispatchers = new Map<string, Dispatcher>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly ctx: TenantContext,
  ) {}

  onModuleInit(): void {
    this.jobs.register('outbox', async () => {
      await this.flush();
    });
  }

  registerDispatcher(kind: string, fn: Dispatcher): void {
    this.dispatchers.set(kind, fn);
  }

  async add(tx: OutboxWriter, tenantId: string | null, kind: string, payload: Record<string, unknown>): Promise<void> {
    await tx.outbox.create({ data: { tenantId, kind, payload: payload as Prisma.InputJsonValue } });
  }

  realtime(tx: OutboxWriter, tenantId: string, ref: RealtimeRef): Promise<void> {
    return this.add(tx, tenantId, 'realtime', ref as unknown as Record<string, unknown>);
  }

  /** After commit: dispatch now (inline) or wake the worker. */
  async kick(): Promise<void> {
    await this.jobs.enqueue('outbox', {}, { jobId: `flush-${Math.floor(Date.now() / 250)}` });
  }

  /** Claims pending rows (SKIP LOCKED) and dispatches them until none are due. */
  async flush(maxRounds = 20): Promise<number> {
    let total = 0;
    for (let round = 0; round < maxRounds; round++) {
      const rows = await this.prisma.$queryRaw<Array<{ id: string; tenantId: string | null; kind: string; payload: any; attempts: number; createdAt: Date }>>`
        UPDATE "outbox" SET "status" = 'processing', "lockedAt" = now(), "attempts" = "attempts" + 1
        WHERE "id" IN (
          SELECT "id" FROM "outbox" WHERE "status" = 'pending' AND "availableAt" <= now()
          ORDER BY "createdAt" ASC LIMIT 50 FOR UPDATE SKIP LOCKED
        )
        RETURNING "id", "tenantId", "kind", "payload", "attempts", "createdAt"`;
      if (!rows.length) break;
      rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      for (const row of rows) {
        total++;
        await this.dispatch(row);
      }
    }
    return total;
  }

  private async dispatch(row: { id: string; tenantId: string | null; kind: string; payload: any; attempts: number }): Promise<void> {
    const fn = this.dispatchers.get(row.kind);
    try {
      if (!fn) throw new Error(`No dispatcher for ${row.kind}`);
      if (row.tenantId) await this.ctx.run(row.tenantId, () => fn(row.payload, row));
      else await fn(row.payload, row);
      await this.prisma.outbox.update({ where: { id: row.id }, data: { status: 'done', processedAt: new Date(), lockedAt: null } });
    } catch (e) {
      const err = (e as Error).message ?? String(e);
      const final = row.attempts >= MAX_ATTEMPTS;
      this.logger.warn(`${row.kind} ${row.id} attempt ${row.attempts} failed: ${err}${final ? ' (giving up)' : ''}`);
      await this.prisma.outbox.update({
        where: { id: row.id },
        data: final
          ? { status: 'failed', lastError: err, lockedAt: null }
          : { status: 'pending', lastError: err, lockedAt: null, availableAt: new Date(Date.now() + 2 ** row.attempts * 2000) },
      });
      if (final) {
        const onFail = this.dispatchers.get(`${row.kind}:failed`);
        if (onFail && row.tenantId) await this.ctx.run(row.tenantId, () => onFail(row.payload, row)).catch(() => undefined);
      }
    }
  }

  /** Rows stuck in "processing" (crashed worker) go back to pending. */
  async releaseStuck(olderThanMs = 5 * 60 * 1000): Promise<void> {
    await this.prisma.outbox.updateMany({ where: { status: 'processing', lockedAt: { lt: new Date(Date.now() - olderThanMs) } }, data: { status: 'pending', lockedAt: null } });
  }
}
