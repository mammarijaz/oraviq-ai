import { Injectable } from '@nestjs/common';
import { calculateQuote, renderQuoteSentence, type PriceTable, type QuoteInput } from '@oraviq/pricing';
import type { QuoteDto, QuoteRequest, QuoteResponse } from '@oraviq/shared';
import { Prisma, type Quote as QuoteRow } from '@prisma/client';
import { NotFoundException } from '@nestjs/common';
import type { QuoteToolResult } from '../../integrations/types';
import { DbService } from '../../prisma/db.service';
import type { TenantTx } from '../../prisma/tenant-prisma';
import { toQuoteDto } from '../inbox/mappers';
import { PricingService } from '../pricing/pricing.service';

/** Quotes are calculated by @oraviq/pricing and stored with the price table version they came from. */
@Injectable()
export class QuotesService {
  constructor(
    private readonly dbs: DbService,
    private readonly pricing: PricingService,
  ) {}

  /** Calculates and stores a quote. Returns the tool-shaped result the assistant uses. */
  async createFromTable(table: PriceTable, input: QuoteInput, link: { conversationId?: string | null; contactId?: string | null }, tx: TenantTx = this.dbs.db): Promise<QuoteToolResult & { row?: QuoteRow }> {
    const res = calculateQuote(table, input);
    if (!res.ok) return { ok: false, error: res.error };
    const sentence = renderQuoteSentence(res.quote);
    const row = await tx.quote.create({
      data: {
        tenantId: this.dbs.tenantId,
        conversationId: link.conversationId ?? null,
        contactId: link.contactId ?? null,
        inputs: input as unknown as Prisma.InputJsonValue,
        quote: res.quote as unknown as Prisma.InputJsonValue,
        lineItems: res.quote.lineItems as unknown as Prisma.InputJsonValue,
        totalCents: res.quote.totalCents,
        priceTableVersion: res.quote.priceTableVersion,
        yards: res.quote.yards,
        days: res.quote.days,
        zip: res.quote.zip,
        debris: res.quote.debris,
        sentence,
      },
    });
    return { ok: true, quoteId: row.id, quote: res.quote, sentence, row };
  }

  /** POST /quotes: owner-side preview; stored only when a conversation is given. */
  async preview(req: QuoteRequest & { conversationId?: string }): Promise<QuoteResponse> {
    const table = await this.pricing.current();
    const input: QuoteInput = { yards: Number(req.yards), days: req.days, zip: String(req.zip), debris: req.debris, items: req.items };
    if (req.conversationId) {
      const conv = await this.dbs.db.conversation.findUnique({ where: { id: req.conversationId } });
      if (!conv) throw new NotFoundException('Conversation not found.');
      const r = await this.createFromTable(table, input, { conversationId: conv.id, contactId: conv.contactId });
      if (!r.ok) return { ok: false, error: r.error };
      return { ok: true, quote: toQuoteDto(r.row!) };
    }
    const res = calculateQuote(table, input);
    if (!res.ok) return { ok: false, error: res.error };
    const dto: QuoteDto = { ...res.quote, id: 'preview', conversationId: null, createdAt: new Date().toISOString(), sentence: renderQuoteSentence(res.quote) };
    return { ok: true, quote: dto };
  }
}
