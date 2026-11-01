import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { Role } from '@oraviq/shared';

export interface RequestActor {
  tenantId: string;
  userId?: string;
  role?: Role;
}

/** The request/job context: which tenant (and user) the current code runs for. */
@Injectable()
export class TenantContext {
  constructor(private readonly cls: ClsService) {}

  get tenantIdOrNull(): string | undefined {
    return this.cls.isActive() ? this.cls.get<string>('tenantId') : undefined;
  }

  get tenantId(): string {
    const id = this.tenantIdOrNull;
    if (!id) throw new Error('No tenant in context');
    return id;
  }

  get userId(): string | undefined {
    return this.cls.isActive() ? this.cls.get<string>('userId') : undefined;
  }

  get role(): Role | undefined {
    return this.cls.isActive() ? this.cls.get<Role>('role') : undefined;
  }

  set(actor: RequestActor): void {
    this.cls.set('tenantId', actor.tenantId);
    if (actor.userId) this.cls.set('userId', actor.userId);
    if (actor.role) this.cls.set('role', actor.role);
  }

  /** Run `fn` as `tenantId` (webhooks, jobs, public endpoints). Nested calls get a fresh scope. */
  run<T>(tenantId: string, fn: () => PromiseLike<T> | T, actor: Omit<RequestActor, 'tenantId'> = {}): Promise<T> {
    return this.cls.run({ ifNested: 'override' }, async () => {
      this.cls.set('tenantId', tenantId);
      if (actor.userId) this.cls.set('userId', actor.userId);
      if (actor.role) this.cls.set('role', actor.role);
      // Await inside the scope: Prisma queries are lazy and must start while the tenant is set.
      return await fn();
    });
  }
}
