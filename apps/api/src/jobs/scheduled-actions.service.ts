import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext } from '../core/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from './jobs.service';

type ActionHandler = (payload: any, action: { id: string; tenantId: string; kind: string }) => Promise<void>;
type Writer = { scheduledAction: { upsert: (args: any) => Promise<{ id: string }> } };

/**
 * Durable delayed work in Postgres (review requests, owner reminders). A poller
 * claims due rows and hands them to BullMQ (or runs them inline); the row is the
 * source of truth, so cancelling is a status change and a lost Redis job is harmless.
 */
@Injectable()
export class ScheduledActionsService implements OnModuleInit {
  private readonly logger = new Logger('ScheduledActions');
  private readonly handlers = new Map<string, ActionHandler>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobs: JobsService,
    private readonly ctx: TenantContext,
  ) {}

  onModuleInit(): void {
    this.jobs.register('scheduled', (data) => this.execute(String(data.id)));
  }

  registerHandler(kind: string, fn: ActionHandler): void {
    this.handlers.set(kind, fn);
  }

  /** Schedules (or reschedules, by dedupeKey) an action. Use inside the caller's transaction. */
  async schedule(tx: Writer, input: { tenantId: string; kind: string; runAt: Date; payload: Record<string, unknown>; dedupeKey: string }): Promise<string> {
    const row = await tx.scheduledAction.upsert({
      where: { tenantId_dedupeKey: { tenantId: input.tenantId, dedupeKey: input.dedupeKey } },
      create: { tenantId: input.tenantId, kind: input.kind, runAt: input.runAt, payload: input.payload as Prisma.InputJsonValue, dedupeKey: input.dedupeKey, status: 'pending' },
      update: { runAt: input.runAt, payload: input.payload as Prisma.InputJsonValue, status: 'pending', attempts: 0, lastError: null },
    });
    return row.id;
  }

  async cancel(tenantId: string, dedupeKey: string): Promise<void> {
    await this.prisma.scheduledAction.updateMany({ where: { tenantId, dedupeKey, status: 'pending' }, data: { status: 'cancelled' } });
  }

  /** Claims due actions and runs/enqueues them. Returns how many were claimed. */
  async runDue(now = new Date()): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE "scheduled_actions" SET "status" = 'processing', "lockedAt" = now(), "attempts" = "attempts" + 1
      WHERE "id" IN (
        SELECT "id" FROM "scheduled_actions" WHERE "status" = 'pending' AND "runAt" <= ${now}
        ORDER BY "runAt" ASC LIMIT 50 FOR UPDATE SKIP LOCKED
      )
      RETURNING "id"`;
    for (const r of rows) await this.jobs.enqueue('scheduled', { id: r.id }, { jobId: `sa-${r.id}` });
    return rows.length;
  }

  async execute(id: string): Promise<void> {
    const action = await this.prisma.scheduledAction.findUnique({ where: { id } });
    if (!action || action.status === 'done' || action.status === 'cancelled') return;
    const fn = this.handlers.get(action.kind);
    try {
      if (!fn) throw new Error(`No handler for ${action.kind}`);
      await this.ctx.run(action.tenantId, () => fn(action.payload, action));
      await this.prisma.scheduledAction.update({ where: { id }, data: { status: 'done', lockedAt: null } });
    } catch (e) {
      const final = action.attempts >= 5;
      this.logger.warn(`${action.kind} ${id} failed: ${(e as Error).message}`);
      await this.prisma.scheduledAction.update({
        where: { id },
        data: final ? { status: 'failed', lastError: (e as Error).message, lockedAt: null } : { status: 'pending', lastError: (e as Error).message, lockedAt: null, runAt: new Date(Date.now() + 2 ** action.attempts * 30000) },
      });
    }
  }

  async releaseStuck(olderThanMs = 10 * 60 * 1000): Promise<void> {
    await this.prisma.scheduledAction.updateMany({ where: { status: 'processing', lockedAt: { lt: new Date(Date.now() - olderThanMs) } }, data: { status: 'pending', lockedAt: null } });
  }
}
