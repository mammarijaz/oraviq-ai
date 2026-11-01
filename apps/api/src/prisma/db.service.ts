import { Injectable } from '@nestjs/common';
import { TenantContext } from '../core/tenant-context';
import { PrismaService } from './prisma.service';
import { createTenantClient, TenantDb, TenantTx } from './tenant-prisma';

/** Tenant-scoped database access. Every query is limited to the tenant in context. */
@Injectable()
export class DbService {
  readonly db: TenantDb;

  constructor(
    readonly system: PrismaService,
    private readonly ctx: TenantContext,
  ) {
    this.db = createTenantClient(system, () => ctx.tenantIdOrNull);
  }

  get tenantId(): string {
    return this.ctx.tenantId;
  }

  tx<T>(fn: (tx: TenantTx) => Promise<T>, opts: { timeout?: number } = {}): Promise<T> {
    return this.db.$transaction((tx) => fn(tx as unknown as TenantTx), { timeout: opts.timeout ?? 15000, maxWait: 5000 });
  }
}
