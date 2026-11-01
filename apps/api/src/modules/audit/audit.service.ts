import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantContext } from '../../core/tenant-context';
import { DbService } from '../../prisma/db.service';
import type { TenantTx } from '../../prisma/tenant-prisma';

/** Audit log for owner actions (who did what to which record). */
@Injectable()
export class AuditService {
  constructor(
    private readonly dbs: DbService,
    private readonly ctx: TenantContext,
  ) {}

  async log(action: string, entityType: string, entityId: string | null, data?: Record<string, unknown>, tx: TenantTx = this.dbs.db): Promise<void> {
    await tx.auditLog.create({
      data: { tenantId: this.dbs.tenantId, actorUserId: this.ctx.userId ?? null, action, entityType, entityId, data: (data ?? undefined) as Prisma.InputJsonValue | undefined },
    });
  }
}
