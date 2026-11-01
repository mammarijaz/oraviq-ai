import { parseZipList, type PriceTable } from '@oraviq/pricing';
import type { PriceTableDto, UpdatePriceTableRequest } from '@oraviq/shared';
import { centsToDollars, dollarsToCents } from './format';

/** The price table as the owner edits it: dollars and plain text, converted to cents only when used. */
export interface PriceDraft {
  includedDays: string;
  extraDay: string;
  overage: string;
  maxDays: string;
  sizes: Array<{ yards: number; base: string; tons: string; heavyAllowed: boolean; heavyFlat: string; active: boolean; hint: string }>;
  zones: Array<{ id: string; name: string; fee: string; zips: string }>;
  surcharges: Array<{ key: string; label: string; pluralLabel?: string; price: string }>;
  prohibited: string[];
}

export function toDraft(t: PriceTableDto | PriceTable): PriceDraft {
  return {
    includedDays: String(t.includedDays),
    extraDay: centsToDollars(t.extraDayCents),
    overage: centsToDollars(t.overagePerTonCents),
    maxDays: String(t.maxDays),
    sizes: [...t.sizes]
      .sort((a, b) => a.yards - b.yards)
      .map((s) => ({
        yards: s.yards,
        base: centsToDollars(s.baseCents),
        tons: String(s.includedTons),
        heavyAllowed: s.heavyAllowed,
        heavyFlat: s.heavyFlatCents != null ? centsToDollars(s.heavyFlatCents) : '',
        active: s.active !== false,
        hint: s.hint ?? '',
      })),
    zones: t.zones.map((z) => ({ id: z.id, name: z.name, fee: centsToDollars(z.feeCents), zips: z.zips.join(' ') })),
    surcharges: t.surcharges.map((s) => ({ key: s.key, label: s.label, pluralLabel: s.pluralLabel, price: centsToDollars(s.cents) })),
    prohibited: [...t.prohibited],
  };
}

const int = (v: string, fallback = 0) => {
  const n = Number(String(v).trim());
  return Number.isFinite(n) && String(v).trim() !== '' ? Math.round(n) : fallback;
};
const num = (v: string, fallback = 0) => {
  const n = Number(String(v).trim());
  return Number.isFinite(n) && String(v).trim() !== '' ? n : fallback;
};

/** The body for PUT /pricing. */
export function toRequest(d: PriceDraft): UpdatePriceTableRequest {
  return {
    includedDays: int(d.includedDays),
    extraDayCents: dollarsToCents(d.extraDay),
    overagePerTonCents: dollarsToCents(d.overage),
    maxDays: int(d.maxDays),
    sizes: d.sizes.map((s) => ({
      yards: s.yards,
      baseCents: dollarsToCents(s.base),
      includedTons: num(s.tons),
      heavyAllowed: s.heavyAllowed,
      heavyFlatCents: s.heavyAllowed && s.heavyFlat.trim() ? dollarsToCents(s.heavyFlat) : null,
      active: s.active,
      ...(s.hint ? { hint: s.hint } : {}),
    })),
    zones: d.zones.map((z) => ({ id: z.id, name: z.name.trim() || 'Zone', feeCents: dollarsToCents(z.fee), zips: parseZipList(z.zips) })),
    surcharges: d.surcharges.map((s) => ({ key: s.key, label: s.label, ...(s.pluralLabel ? { pluralLabel: s.pluralLabel } : {}), cents: dollarsToCents(s.price) })),
    prohibited: d.prohibited.map((w) => w.trim().toLowerCase()).filter(Boolean),
  };
}

/** A full PriceTable for the live preview (calculateQuote) from the unsaved draft. */
export function toTable(d: PriceDraft, version = 0): PriceTable {
  return { version, currency: 'USD', ...toRequest(d) };
}

/** Problems tied to one input, so the field can turn red next to the summary. */
export function fieldProblems(d: PriceDraft): Record<string, string> {
  const out: Record<string, string> = {};
  const days = int(d.includedDays, -1);
  if (days < 1) out.includedDays = 'Enter 1 or more.';
  if (int(d.maxDays, -1) < Math.max(1, days)) out.maxDays = 'At least the included days.';
  if (num(d.extraDay, -1) < 0) out.extraDay = 'Enter 0 or more.';
  if (num(d.overage, -1) < 0) out.overage = 'Enter 0 or more.';
  d.sizes.forEach((s, i) => {
    if (!(num(s.base, 0) > 0)) out[`base${i}`] = 'Enter a price.';
    if (num(s.tons, -1) < 0) out[`tons${i}`] = 'Enter 0 or more.';
    if (s.heavyAllowed && !(num(s.heavyFlat, 0) > 0)) out[`flat${i}`] = 'Enter a flat price.';
  });
  const seen = new Map<string, number>();
  d.zones.forEach((z, i) => {
    if (num(z.fee, -1) < 0) out[`fee${i}`] = 'Enter 0 or more.';
    const bad = z.zips.split(/[\s,;]+/).filter((x) => x && !/^\d{5}$/.test(x));
    if (bad.length) out[`zips${i}`] = `Not a ZIP code: ${bad.slice(0, 3).join(', ')}.`;
    for (const zip of parseZipList(z.zips)) {
      const prev = seen.get(zip);
      if (prev != null && prev !== i) out[`zips${i}`] = `ZIP ${zip} is also in ${d.zones[prev]!.name}.`;
      seen.set(zip, i);
    }
  });
  d.surcharges.forEach((s, i) => {
    if (num(s.price, -1) < 0) out[`sur${i}`] = 'Enter 0 or more.';
  });
  return out;
}
