import { Injectable, NotFoundException } from '@nestjs/common';
import { calculateQuote, findZone, renderQuoteSentence, SAMPLE_PRICE_TABLE, validatePriceTable, type PriceTable, type QuoteInput, type QuoteResult } from '@oraviq/pricing';
import type { PriceTableDto, UpdatePriceTableRequest } from '@oraviq/shared';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ProblemsException } from '../../common/errors';
import { OutboxService } from '../../jobs/outbox.service';
import { DbService } from '../../prisma/db.service';
import type { TenantTx } from '../../prisma/tenant-prisma';
import { AuditService } from '../audit/audit.service';

const int = z.number().int();
const money = int.min(0, 'cannot be negative');
const tableSchema = z.object({
  includedDays: int,
  extraDayCents: int,
  overagePerTonCents: int,
  maxDays: int,
  sizes: z
    .array(
      z.object({
        yards: int.positive(),
        baseCents: int,
        includedTons: z.number(),
        heavyAllowed: z.boolean(),
        heavyFlatCents: int.nullable().optional(),
        active: z.boolean().optional(),
        hint: z.string().max(120).optional(),
      }),
    )
    .min(1, 'Add at least one size.'),
  zones: z.array(z.object({ id: z.string().min(1), name: z.string().min(1), feeCents: int, zips: z.array(z.string().regex(/^\d{5}$/, 'must be 5-digit ZIP codes')) })),
  surcharges: z.array(z.object({ key: z.string().regex(/^[a-z0-9_]+$/), label: z.string().min(1), pluralLabel: z.string().optional(), cents: money })),
  prohibited: z.array(z.string().min(1).transform((s) => s.toLowerCase().trim())),
});

/** Price tables: versioned rows; the current table is the highest version. All prices come from @oraviq/pricing. */
@Injectable()
export class PricingService {
  constructor(
    private readonly dbs: DbService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async currentRow(tx: TenantTx = this.dbs.db) {
    const row = await tx.priceTable.findFirst({ orderBy: { version: 'desc' } });
    if (!row) throw new NotFoundException('No price table yet. Add your prices in Pricing rules.');
    return row;
  }

  async current(tx: TenantTx = this.dbs.db): Promise<PriceTable> {
    const row = await this.currentRow(tx);
    return { ...(row.rules as unknown as PriceTable), version: row.version, currency: 'USD' };
  }

  async getDto(): Promise<PriceTableDto> {
    const row = await this.currentRow();
    return { ...(row.rules as unknown as PriceTable), version: row.version, currency: 'USD', updatedAt: row.createdAt.toISOString() };
  }

  /** Validates (shape, then validatePriceTable) and stores a new version. 400 with `problems` on failure. */
  async update(body: UpdatePriceTableRequest): Promise<PriceTableDto> {
    const parsed = tableSchema.safeParse(body);
    if (!parsed.success) {
      const problems = parsed.error.issues.map((i) => `${i.path.join('.') || 'table'}: ${i.message}`);
      throw new ProblemsException('The price table has problems.', problems);
    }
    const current = await this.currentRow();
    const next: PriceTable = { ...(parsed.data as Omit<PriceTable, 'version' | 'currency'>), version: current.version + 1, currency: 'USD' };
    const problems = validatePriceTable(next);
    if (problems.length) throw new ProblemsException('The price table has problems.', problems);
    const { version: _v, currency: _c, ...rules } = next;
    const tenantId = this.dbs.tenantId;
    const row = await this.dbs.tx(async (tx) => {
      const r = await tx.priceTable.create({ data: { tenantId, version: next.version, rules: rules as unknown as Prisma.InputJsonValue, createdById: null } });
      await this.audit.log('pricing.update', 'price_table', r.id, { version: next.version }, tx);
      // Sites render prices; purge their cache.
      await this.outbox.add(tx, tenantId, 'site.purge', { reason: 'pricing' });
      return r;
    });
    await this.outbox.kick();
    return { ...next, updatedAt: row.createdAt.toISOString() };
  }

  /** Seeds a new tenant with the sample table (each hauler then enters their own). */
  async createInitial(tx: TenantTx, tenantId: string): Promise<void> {
    const { version: _v, currency: _c, ...rules } = SAMPLE_PRICE_TABLE;
    await tx.priceTable.create({ data: { tenantId, version: 1, rules: rules as unknown as Prisma.InputJsonValue } });
  }

  quote(table: PriceTable, input: QuoteInput): QuoteResult {
    return calculateQuote(table, input);
  }

  sentence = renderQuoteSentence;

  serviceArea(table: PriceTable, zip: string): { served: boolean; zoneName: string | null } {
    const z = findZone(table, zip);
    return { served: !!z, zoneName: z?.name ?? null };
  }
}
