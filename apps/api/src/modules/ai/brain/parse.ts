/**
 * Ported from the approved prototype (proto/template.html: parse(), recommendSize()).
 * Pure, deterministic extraction of booking facts from a customer's words.
 */
import type { DebrisType } from '@oraviq/pricing';
import type { Placement } from '@oraviq/shared';

export interface Parsed {
  size?: number;
  days?: number;
  zip?: string;
  debris?: DebrisType;
  items?: Record<string, number>;
  prohibited?: string;
  address?: string;
  date?: string;
  placement?: Placement;
  yes?: boolean;
  human?: boolean;
  sizeHelp?: boolean;
  name?: string;
  sameAsLast?: boolean;
  extension?: number | true;
  pickup?: boolean;
}

const SIZE_WORDS: Record<string, number> = { ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40 };
const COUNT_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * @param prohibitedWords the hauler's prohibited list (price table), checked in order.
 */
export function parse(text: string, prohibitedWords: string[] = []): Parsed {
  const t = ' ' + String(text).toLowerCase().replace(/[’]/g, "'") + ' ';
  const out: Parsed = {};

  let m = t.match(/\b(10|15|20|30|40)\s*-?\s*(yd|yds|yard|yards|y|cy|cubic|yarder)\b/) || t.match(/\b(ten|fifteen|twenty|thirty|forty)\s*-?\s*(yard|yd|yarder)/);
  if (m) out.size = SIZE_WORDS[m[1]] || Number(m[1]);
  // "a 30 for a reroof", "need a 20" (prototype seed phrasing): a bare size after "a/the" with no other number unit.
  if (!out.size) {
    const bare = t.match(/\b(?:a|the|probably a|maybe a)\s+(10|15|20|30|40)\b(?!\s*(?:day|days|ton|tons|min|minutes|\/|%|-?\s*\d))/);
    if (bare) out.size = Number(bare[1]);
  }

  m = t.match(/\b(\d{1,2})\s*(day|days)\b/);
  if (m) out.days = Number(m[1]);
  else if (/\b(two|2) weeks?\b/.test(t)) out.days = 14;
  else if (/\b(a|one|1) week\b|\bweek\b/.test(t) && !/\bnext week\b|\bthis week\b/.test(t)) out.days = 7;
  else if (/\bweekend\b/.test(t)) out.days = 3;
  else if (/\b(a|one) month\b/.test(t)) out.days = 30;

  m = t.match(/\b(\d{5})\b/);
  if (m) out.zip = m[1];

  if (/concrete|dirt|brick|rock|asphalt(?! shingle)|soil|gravel|clean fill/.test(t)) out.debris = 'heavy';
  else if (/remodel|renovat|construction|\bdemo\b|demolition|drywall|kitchen|bathroom|roof|shingle|deck|flooring|contractor/.test(t)) out.debris = 'construction';
  else if (/clean ?out|junk|household|garage|moving|furniture|basement|attic|estate|yard waste|declutter/.test(t)) out.debris = 'household';

  const items: Record<string, number> = {};
  m = t.match(/(\d+|a|an|one|two|three)\s+mattress/);
  if (m || /mattress/.test(t)) items.mattress = m ? Number(m[1]) || COUNT_WORDS[m[1]] || 1 : 1;
  m = t.match(/(\d+|a|one|two|three|four)\s+tires?\b/);
  if (m || /\btires?\b/.test(t)) items.tire = m ? Number(m[1]) || COUNT_WORDS[m[1]] || 1 : 1;
  if (/fridge|refrigerator|freezer|air condition|\bac unit|dehumidifier/.test(t)) items.appliance = 1;
  if (Object.keys(items).length) out.items = items;

  const bad = prohibitedWords.find((p) => new RegExp('\\b' + escapeRe(p) + '\\b').test(t));
  if (bad) out.prohibited = bad;

  // Street address. Skip candidates that are really "30 yd to the Elm St" (a size, not a house number).
  for (const am of String(text).matchAll(/\b\d{2,6}\s+[A-Za-z0-9.' ]+?\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|way|blvd|pl|place|pkwy|cir|circle|ter|trail|hwy)\b\.?/gi)) {
    if (/^\d+\s*(yd|yds|yard|yards|y|cy|cubic|yarder|day|days|ton|tons)\b/i.test(am[0])) continue;
    out.address = am[0].trim();
    break;
  }

  m = t.match(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|this week)\b/) || t.match(/\b(\d{1,2}\/\d{1,2})\b/);
  if (m) out.date = /day$/.test(m[1]) && !/today/.test(m[1]) ? m[1].replace(/^\w/, (c) => c.toUpperCase()) : m[1];

  if (/(on|in) the street|on the road|curb|street parking/.test(t)) out.placement = 'street';
  if (/driveway/.test(t)) out.placement = 'driveway';

  if (/\b(yes|yep|yeah|sure|book it|book|go ahead|sounds good|let'?s do it|please do|ok|okay|confirm)\b/.test(t)) out.yes = true;
  if (/\b(person|human|owner|someone|call me|manager|real person)\b/.test(t)) out.human = true;
  if (/what size|which size|not sure|don'?t know|recommend|how big/.test(t)) out.sizeHelp = true;

  m = String(text).replace(/[’]/g, "'").match(/\b(?:[Ii]'?m|[Ii] am|[Tt]his is|[Mm]y name is|[Nn]ame'?s)\s+([A-Z][a-z]+)/);
  if (m) out.name = m[1];

  if (/same as (last time|before|last)|same again|the usual|same one again/.test(t)) out.sameAsLast = true;
  m = t.match(/\b(\d{1,2}|one|two|three|four|five)\s+more\s+days?\b/);
  if (m) out.extension = Number(m[1]) || COUNT_WORDS[m[1]] || true;
  else if (/\bextend|extension|keep (it|the dumpster) (longer|another)/.test(t)) out.extension = true;
  if (/\b(pick (it )?up|come get it|haul it away|ready for pickup|done with (it|the dumpster))\b/.test(t)) out.pickup = true;

  return out;
}

/** True when the parse found nothing actionable. */
export function isEmptyParse(p: Parsed): boolean {
  return Object.keys(p).length === 0;
}

/** The prototype's size recommendation by job type. */
export function recommendSize(debris: DebrisType | null | undefined, text: string): number {
  const t = (text || '').toLowerCase();
  if (debris === 'heavy') return 10;
  if (/roof|shingle/.test(t)) return 20;
  if (/kitchen|bathroom|remodel/.test(t)) return 20;
  if (/whole house|estate|construction|new build/.test(t)) return 30;
  return 15;
}

/** Caller asked for a person (used by the voice brain's transfer rule). */
export function parseHuman(text: string): boolean {
  return /\b(person|human|owner|someone|manager|real person|talk to)\b/i.test(text);
}

/** STOP / HELP / START keywords (CTIA). Matched on the whole trimmed message. */
export type ComplianceKeyword = 'stop' | 'help' | 'start' | null;
export function complianceKeyword(body: string): ComplianceKeyword {
  const t = String(body).trim().toUpperCase().replace(/[.!]+$/, '');
  if (['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'REVOKE', 'OPTOUT', 'OPT OUT'].includes(t)) return 'stop';
  if (['HELP', 'INFO'].includes(t)) return 'help';
  if (['START', 'UNSTOP', 'YES START', 'SUBSCRIBE'].includes(t)) return 'start';
  return null;
}
