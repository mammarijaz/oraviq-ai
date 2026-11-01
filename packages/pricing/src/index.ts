/**
 * @oraviq/pricing: the deterministic dumpster pricing engine.
 *
 * Rules of the road:
 *  - Pure functions only. No I/O, no clocks, no randomness.
 *  - All money is integer cents.
 *  - The AI never produces a price. It gathers facts and calls `calculateQuote`.
 *  - Every quote records the price table version it was calculated from.
 */

export type DebrisType = 'household' | 'construction' | 'heavy';

export const DEBRIS_TYPES: readonly DebrisType[] = ['household', 'construction', 'heavy'] as const;

export const DEBRIS_LABELS: Record<DebrisType, string> = {
  household: 'Household junk',
  construction: 'Construction or remodel debris',
  heavy: 'Concrete, dirt or brick',
};

export interface SizeRule {
  /** Container size in cubic yards, e.g. 10, 15, 20, 30, 40. */
  yards: number;
  /** Base price for the included days, in cents. */
  baseCents: number;
  /** Tons included in the base price. */
  includedTons: number;
  /** Whether clean fill (concrete, dirt, brick) is allowed in this size. */
  heavyAllowed: boolean;
  /** Flat price for clean fill in this size, in cents (no weight charge). Required when heavyAllowed. */
  heavyFlatCents?: number | null;
  /** Inactive sizes are kept for history but can't be quoted. */
  active?: boolean;
  /** Short hint shown to customers, e.g. "Kitchen remodel, flooring, roofing". */
  hint?: string;
}

export interface DeliveryZone {
  id: string;
  name: string;
  feeCents: number;
  /** 5-digit ZIP codes served in this zone. */
  zips: string[];
}

export interface Surcharge {
  /** Stable key used by the AI and the widgets, e.g. "mattress". */
  key: string;
  /** Singular label, e.g. "mattress", "appliance with refrigerant". */
  label: string;
  /** Plural label when simple pluralising is wrong, e.g. "appliances with refrigerant". */
  pluralLabel?: string;
  cents: number;
}

export interface PriceTable {
  version: number;
  currency: 'USD';
  includedDays: number;
  extraDayCents: number;
  overagePerTonCents: number;
  /** Longest rental the hauler accepts without talking to the owner. */
  maxDays: number;
  sizes: SizeRule[];
  zones: DeliveryZone[];
  surcharges: Surcharge[];
  /** Lower-case words that make a load unacceptable (sent to the owner). */
  prohibited: string[];
}

export interface QuoteInput {
  yards: number;
  days?: number | null;
  zip: string;
  debris: DebrisType;
  /** Surcharge key → count, e.g. { mattress: 2 }. */
  items?: Record<string, number>;
}

export type LineItemCode = 'base' | 'heavy_flat' | 'extra_days' | 'delivery' | 'surcharge';

export interface LineItem {
  code: LineItemCode;
  label: string;
  amountCents: number;
  quantity?: number;
  unitCents?: number;
  key?: string;
}

export interface Quote {
  yards: number;
  days: number;
  zip: string;
  zoneId: string;
  zoneName: string;
  debris: DebrisType;
  heavyFlat: boolean;
  lineItems: LineItem[];
  totalCents: number;
  /** Tons included; null for flat clean-fill loads. */
  includedTons: number | null;
  /** Price per ton over the included weight; null for flat clean-fill loads. */
  overagePerTonCents: number | null;
  includedDays: number;
  priceTableVersion: number;
}

export type QuoteErrorCode =
  | 'unknown_size'
  | 'inactive_size'
  | 'invalid_zip'
  | 'zone_not_served'
  | 'heavy_not_allowed'
  | 'invalid_days'
  | 'too_many_days'
  | 'unknown_item'
  | 'invalid_item_count';

export interface QuoteError {
  code: QuoteErrorCode;
  message: string;
  /** Sizes that would work instead, when relevant. */
  suggestYards?: number[];
}

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; error: QuoteError };

/* ------------------------------------------------------------------ helpers */

export function formatMoney(cents: number, opts: { showZeroCents?: boolean } = {}): string {
  const negative = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rest = abs % 100;
  const d = dollars.toLocaleString('en-US');
  const s = rest === 0 && !opts.showZeroCents ? `$${d}` : `$${d}.${String(rest).padStart(2, '0')}`;
  return negative ? `-${s}` : s;
}

export function formatTons(tons: number): string {
  return `${Number.isInteger(tons) ? tons : tons.toFixed(1)} ton${tons === 1 ? '' : 's'}`;
}

export function normalizeZip(zip: string): string | null {
  const m = /^\s*(\d{5})(?:-\d{4})?\s*$/.exec(String(zip ?? ''));
  return m ? m[1]! : null;
}

export function parseZipList(text: string): string[] {
  return Array.from(new Set(String(text).split(/[\s,;]+/).map((z) => normalizeZip(z)).filter((z): z is string => !!z)));
}

export function findZone(table: PriceTable, zip: string): DeliveryZone | null {
  const z = normalizeZip(zip);
  if (!z) return null;
  return table.zones.find((zone) => zone.zips.includes(z)) ?? null;
}

export function findSize(table: PriceTable, yards: number): SizeRule | null {
  return table.sizes.find((s) => s.yards === Number(yards)) ?? null;
}

export function activeSizes(table: PriceTable): SizeRule[] {
  return table.sizes.filter((s) => s.active !== false).sort((a, b) => a.yards - b.yards);
}

/** Words in free text that match the hauler's prohibited list. */
export function findProhibited(table: PriceTable, text: string): string[] {
  const t = ` ${String(text).toLowerCase()} `;
  return table.prohibited.filter((w) => new RegExp(`[^a-z]${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^a-z]`).test(t));
}

export function pluralize(word: string, n: number, pluralForm?: string): string {
  if (n === 1) return word;
  if (pluralForm) return pluralForm;
  return /(s|x|z|ch|sh)$/.test(word) ? `${word}es` : `${word}s`;
}
const plural = (n: number, word: string, pluralForm?: string) => `${n} ${pluralize(word, n, pluralForm)}`;

/* ------------------------------------------------------------------ engine */

export function calculateQuote(table: PriceTable, input: QuoteInput): QuoteResult {
  const size = findSize(table, input.yards);
  if (!size) {
    return { ok: false, error: { code: 'unknown_size', message: `We don't rent a ${input.yards}-yard dumpster.`, suggestYards: activeSizes(table).map((s) => s.yards) } };
  }
  if (size.active === false) {
    return { ok: false, error: { code: 'inactive_size', message: `The ${size.yards}-yard isn't available right now.`, suggestYards: activeSizes(table).map((s) => s.yards) } };
  }
  const zip = normalizeZip(input.zip);
  if (!zip) return { ok: false, error: { code: 'invalid_zip', message: 'That ZIP code needs 5 digits.' } };
  const zone = findZone(table, zip);
  if (!zone) return { ok: false, error: { code: 'zone_not_served', message: `ZIP ${zip} is outside the delivery zones.` } };

  const rawDays = input.days == null ? table.includedDays : Number(input.days);
  if (!Number.isFinite(rawDays) || rawDays < 1 || !Number.isInteger(rawDays)) {
    return { ok: false, error: { code: 'invalid_days', message: 'Rental days must be a whole number of 1 or more.' } };
  }
  if (rawDays > table.maxDays) {
    return { ok: false, error: { code: 'too_many_days', message: `Rentals longer than ${table.maxDays} days are arranged with the owner.` } };
  }
  const days = rawDays;

  const heavy = input.debris === 'heavy';
  if (heavy && (!size.heavyAllowed || size.heavyFlatCents == null)) {
    return {
      ok: false,
      error: {
        code: 'heavy_not_allowed',
        message: `Concrete, dirt and brick can't go in a ${size.yards}-yard; they are too heavy.`,
        suggestYards: activeSizes(table).filter((s) => s.heavyAllowed && s.heavyFlatCents != null).map((s) => s.yards),
      },
    };
  }

  const lineItems: LineItem[] = [];
  if (heavy) {
    lineItems.push({ code: 'heavy_flat', label: 'Clean fill (concrete, dirt), flat price', amountCents: size.heavyFlatCents! });
  } else {
    lineItems.push({ code: 'base', label: `Base, ${plural(table.includedDays, 'day')} included`, amountCents: size.baseCents });
  }

  const extraDays = Math.max(0, days - table.includedDays);
  if (extraDays > 0) {
    lineItems.push({
      code: 'extra_days',
      label: `${plural(extraDays, 'extra day')} at ${formatMoney(table.extraDayCents)}`,
      amountCents: extraDays * table.extraDayCents,
      quantity: extraDays,
      unitCents: table.extraDayCents,
    });
  }

  lineItems.push({ code: 'delivery', label: `Delivery, ${zone.name}`, amountCents: zone.feeCents });

  for (const [key, rawCount] of Object.entries(input.items ?? {})) {
    const count = Number(rawCount);
    if (!count) continue;
    if (!Number.isInteger(count) || count < 0 || count > 50) {
      return { ok: false, error: { code: 'invalid_item_count', message: `The number of ${key}s must be a whole number.` } };
    }
    const s = table.surcharges.find((x) => x.key === key);
    if (!s) return { ok: false, error: { code: 'unknown_item', message: `There's no set fee for "${key}".` } };
    lineItems.push({
      code: 'surcharge',
      key,
      label: `${plural(count, s.label, s.pluralLabel)} at ${formatMoney(s.cents)}`,
      amountCents: count * s.cents,
      quantity: count,
      unitCents: s.cents,
    });
  }

  const totalCents = lineItems.reduce((sum, li) => sum + li.amountCents, 0);
  return {
    ok: true,
    quote: {
      yards: size.yards,
      days,
      zip,
      zoneId: zone.id,
      zoneName: zone.name,
      debris: input.debris,
      heavyFlat: heavy,
      lineItems,
      totalCents,
      includedTons: heavy ? null : size.includedTons,
      overagePerTonCents: heavy ? null : table.overagePerTonCents,
      includedDays: table.includedDays,
      priceTableVersion: table.version,
    },
  };
}

/** Extra-day fee for extending an existing rental (swap/extension requests). */
export function extensionFee(table: PriceTable, extraDays: number): number {
  if (!Number.isInteger(extraDays) || extraDays < 0) throw new Error('extraDays must be a non-negative integer');
  return extraDays * table.extraDayCents;
}

/**
 * The customer-facing quote sentence. Rendered by code from the quote object,
 * so the dollar amounts in messages always match the engine.
 */
export function renderQuoteSentence(q: Quote): string {
  const head = `A ${q.yards}-yard for ${plural(q.days, 'day')} is ${formatMoney(q.totalCents)} delivered.`;
  const weight = q.heavyFlat
    ? 'That is a flat price for clean fill, with no weight charge.'
    : `It includes ${formatTons(q.includedTons!)}, then ${formatMoney(q.overagePerTonCents!)} per ton over.`;
  return `${head} ${weight}`;
}

/** All dollar amounts that may legitimately appear in a message about this quote. */
export function allowedAmounts(q: Quote): string[] {
  const set = new Set<string>([formatMoney(q.totalCents)]);
  for (const li of q.lineItems) {
    set.add(formatMoney(li.amountCents));
    if (li.unitCents != null) set.add(formatMoney(li.unitCents));
  }
  if (q.overagePerTonCents != null) set.add(formatMoney(q.overagePerTonCents));
  return [...set];
}

/**
 * Guardrail: returns the dollar amounts in `text` that are NOT backed by the quote.
 * The assistant refuses to send a message when this is non-empty.
 */
export function unbackedAmounts(text: string, quotes: Quote[]): string[] {
  const allowed = new Set(quotes.flatMap(allowedAmounts));
  const found = String(text).match(/\$\s?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?/g) ?? [];
  return found.map((s) => s.replace(/\s/g, '')).filter((s) => !allowed.has(s));
}

/** Validates a price table; returns human-readable problems (empty when valid). */
export function validatePriceTable(t: PriceTable): string[] {
  const p: string[] = [];
  if (!Number.isInteger(t.includedDays) || t.includedDays < 1) p.push('Days included must be 1 or more.');
  if (t.maxDays < t.includedDays) p.push('The longest rental must be at least the included days.');
  if (t.extraDayCents < 0) p.push('The extra-day fee cannot be negative.');
  if (t.overagePerTonCents < 0) p.push('The overage price cannot be negative.');
  const seen = new Set<number>();
  for (const s of t.sizes) {
    if (seen.has(s.yards)) p.push(`The ${s.yards}-yard is listed twice.`);
    seen.add(s.yards);
    if (s.baseCents <= 0) p.push(`The ${s.yards}-yard needs a base price.`);
    if (s.includedTons < 0) p.push(`The ${s.yards}-yard's included tons cannot be negative.`);
    if (s.heavyAllowed && (s.heavyFlatCents == null || s.heavyFlatCents <= 0)) p.push(`The ${s.yards}-yard allows clean fill but has no flat price.`);
  }
  const zipOwner = new Map<string, string>();
  for (const z of t.zones) {
    if (z.feeCents < 0) p.push(`${z.name} has a negative fee.`);
    for (const zip of z.zips) {
      const prev = zipOwner.get(zip);
      if (prev) p.push(`ZIP ${zip} is in both ${prev} and ${z.name}.`);
      zipOwner.set(zip, z.name);
    }
  }
  for (const s of t.surcharges) if (s.cents < 0) p.push(`The ${s.label} fee cannot be negative.`);
  return p;
}

/** The sample table used in the prototype and in demos (each hauler enters their own). */
export const SAMPLE_PRICE_TABLE: PriceTable = {
  version: 1,
  currency: 'USD',
  includedDays: 7,
  extraDayCents: 1500,
  overagePerTonCents: 9500,
  maxDays: 60,
  sizes: [
    { yards: 10, baseCents: 42500, includedTons: 1.5, heavyAllowed: true, heavyFlatCents: 52500, active: true, hint: 'Bathroom remodel, small cleanout' },
    { yards: 15, baseCents: 49500, includedTons: 2, heavyAllowed: true, heavyFlatCents: 62500, active: true, hint: 'Garage or basement cleanout' },
    { yards: 20, baseCents: 62500, includedTons: 3, heavyAllowed: false, heavyFlatCents: null, active: true, hint: 'Kitchen remodel, flooring, roofing' },
    { yards: 30, baseCents: 79500, includedTons: 4, heavyAllowed: false, heavyFlatCents: null, active: true, hint: 'Whole-home cleanout, additions' },
    { yards: 40, baseCents: 97500, includedTons: 5, heavyAllowed: false, heavyFlatCents: null, active: true, hint: 'New construction, demolition' },
  ],
  zones: [
    { id: 'z1', name: 'Zone 1', feeCents: 0, zips: parseZipList('30303 30305 30306 30307 30308 30309 30310 30312 30313 30314 30315 30316 30317 30318 30324 30326 30363') },
    { id: 'z2', name: 'Zone 2', feeCents: 5000, zips: parseZipList('30030 30032 30033 30080 30082 30319 30327 30328 30329 30339 30340 30341 30342 30344 30345') },
    { id: 'z3', name: 'Zone 3', feeCents: 10000, zips: parseZipList('30060 30062 30064 30067 30068 30092 30093 30096 30097 30022 30024 30043 30044 30101') },
  ],
  surcharges: [
    { key: 'mattress', label: 'mattress', cents: 2500 },
    { key: 'tire', label: 'tire', cents: 1500 },
    { key: 'appliance', label: 'appliance with refrigerant', pluralLabel: 'appliances with refrigerant', cents: 4000 },
  ],
  prohibited: ['paint', 'batteries', 'battery', 'motor oil', 'asbestos', 'chemicals', 'propane', 'hazardous', 'oil'],
};
