import { Prisma, PrismaClient } from '@prisma/client';

/** Models whose rows belong to a tenant. Every query on them is scoped. */
export const TENANT_MODELS = new Set<string>([
  'Membership',
  'Contact',
  'ContactIdentity',
  'Consent',
  'ChannelAccount',
  'PhoneNumber',
  'Conversation',
  'Message',
  'Call',
  'PriceTable',
  'Quote',
  'Order',
  'OrderEvent',
  'ReceptionistSettings',
  'ReviewRequestSettings',
  'SiteSettings',
  'WidgetSettings',
  'Review',
  'ReviewReplyDraft',
  'ReviewSourceStats',
  'ReviewRequest',
  'ScheduledAction',
  'AuditLog',
  'Notification',
  'PushSubscription',
]);

const WHERE_OPS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);

export class TenantScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantScopeError';
  }
}

function withTenant<T extends Record<string, unknown>>(data: T, tenantId: string, model: string): T {
  const existing = (data as { tenantId?: unknown }).tenantId;
  if (existing !== undefined && existing !== tenantId) {
    throw new TenantScopeError(`Refusing to write ${model} for another tenant.`);
  }
  return { ...data, tenantId };
}

/**
 * Prisma client extension that scopes every tenant-owned model to the tenant in
 * the request/job context: reads and updates get `tenantId` added to `where`,
 * creates get it added to `data`. With no tenant in context it fails closed.
 *
 * Nested writes (`messages: { create: [...] }`) are not rewritten: pass
 * tenantId explicitly there (the services do).
 */
export function createTenantClient(base: PrismaClient, getTenantId: () => string | undefined) {
  return base.$extends({
    name: 'tenant-scope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);
          const tenantId = getTenantId();
          if (!tenantId) throw new TenantScopeError(`No tenant in context for ${model}.${operation}.`);
          const a = (args ?? {}) as Record<string, any>;
          if (WHERE_OPS.has(operation)) {
            a.where = { ...(a.where ?? {}), tenantId };
          }
          if (operation === 'create') {
            a.data = withTenant(a.data ?? {}, tenantId, model);
          } else if (operation === 'createMany' || operation === 'createManyAndReturn') {
            a.data = Array.isArray(a.data) ? a.data.map((d: any) => withTenant(d, tenantId, model)) : withTenant(a.data, tenantId, model);
          } else if (operation === 'upsert') {
            a.create = withTenant(a.create ?? {}, tenantId, model);
          }
          if ((operation === 'update' || operation === 'updateMany' || operation === 'upsert') && a.data && 'tenantId' in a.data && a.data.tenantId !== tenantId) {
            throw new TenantScopeError(`Refusing to move ${model} to another tenant.`);
          }
          return query(a);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof createTenantClient>;
/** The client handed to interactive transactions of the scoped client. */
export type TenantTx = Omit<TenantDb, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;
export type JsonValue = Prisma.InputJsonValue;
