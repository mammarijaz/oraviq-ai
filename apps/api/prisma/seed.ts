/**
 * Demo seed: "Demo Roll-Off Co." (Atlanta, GA) with the approved prototype's data:
 * 8 conversations (c1–c8) with their messages, quotes and orders, 4 calls,
 * 6 reviews with AI drafts, 5 review-request jobs, site and widget settings.
 *
 * Idempotent: re-running resets the demo tenant to this state (fixed ids, so
 * existing logins keep working). Times are laid out on the most recent 7 p.m.
 * in Atlanta so the "today" in the prototype is a real, past day.
 *
 *   pnpm --filter @oraviq/api db:seed       → demo@oraviq.ai / demo1234
 */
import 'reflect-metadata';
import { calculateQuote, renderQuoteSentence, SAMPLE_PRICE_TABLE, type DebrisType, type Quote } from '@oraviq/pricing';
import { CALL_DISCLOSURE_VERSION, TEXT_CONSENT_VERSION, type Channel, type MessageAuthor } from '@oraviq/shared';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient, type Placement } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { addDaysIso, DEFAULT_BUSINESS_HOURS, isoDateIn, resolveDayPhrase, shortDateLabel, zonedParts, zonedTimeToUtc } from '../src/common/time';
import { env } from '../src/config/env';
import { priceTableRules, receptionistDefaults, widgetDefaults } from '../src/modules/tenant/defaults';
import { DEFAULT_SECTIONS } from '../src/modules/site/site.service';

const TENANT_ID = '00000000-0000-4000-8000-00000000d3e0';
const USER_ID = '00000000-0000-4000-8000-00000000d3e1';
const TZ = 'America/New_York';
const NAME = 'Demo Roll-Off Co.';
const EMAIL = 'demo@oraviq.ai';
const PASSWORD = 'demo1234';
const OWNER_CELL = '+14045550123';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env().DATABASE_URL }) });
const table = { ...SAMPLE_PRICE_TABLE };

/* ------------------------------------------------------------------ time */

const now = new Date();
const anchorIso = zonedParts(now, TZ).hour >= 19 ? isoDateIn(now, TZ) : isoDateIn(new Date(now.getTime() - 86400000), TZ);
/** Local time on (anchor day + dayOffset). */
const at = (dayOffset: number, hh: number, mm: number, ss = 0) => new Date(zonedTimeToUtc(addDaysIso(anchorIso, dayOffset), hh, mm, TZ).getTime() + ss * 1000);
const daysAgo = (n: number, hh = 12) => at(-n, hh, 0);

/* ------------------------------------------------------------------ reset */

const TENANT_TABLES = [
  'review_reply_drafts',
  'reviews',
  'review_source_stats',
  'review_requests',
  'messages',
  'calls',
  'order_events',
  'orders',
  'quotes',
  'conversations',
  'consents',
  'contact_identities',
  'contacts',
  'channel_accounts',
  'phone_numbers',
  'price_tables',
  'receptionist_settings',
  'review_request_settings',
  'site_settings',
  'widget_settings',
  'scheduled_actions',
  'audit_logs',
  'notifications',
  'push_subscriptions',
  'outbox',
  'refresh_tokens',
  'memberships',
  'webhook_events',
];

async function reset(): Promise<void> {
  const ids = new Set<string>([TENANT_ID]);
  for (const t of await prisma.tenant.findMany({ where: { OR: [{ slug: 'demo-roll-off' }, { publishableKey: 'pk_demo_rolloff' }, { oraviqNumber: '+14045550177' }] }, select: { id: true } })) ids.add(t.id);
  for (const p of await prisma.phoneNumber.findMany({ where: { e164: '+14045550177' }, select: { tenantId: true } })) ids.add(p.tenantId);
  for (const id of ids) {
    for (const tbl of TENANT_TABLES) await prisma.$executeRawUnsafe(`DELETE FROM "${tbl}" WHERE "tenantId" = $1`, id);
    await prisma.tenant.deleteMany({ where: { id } });
  }
  await prisma.siteSettings.deleteMany({ where: { slug: 'demo-roll-off' } });
}

/* ------------------------------------------------------------------ helpers */

let quoteSeq = 0;
async function quote(input: { yards: number; days: number; zip: string; debris: DebrisType }, link: { conversationId?: string | null; contactId?: string | null }, createdAt: Date) {
  const r = calculateQuote(table, input);
  if (!r.ok) throw new Error(`Seed quote failed: ${r.error.message}`);
  quoteSeq++;
  return prisma.quote.create({
    data: {
      tenantId: TENANT_ID,
      conversationId: link.conversationId ?? null,
      contactId: link.contactId ?? null,
      inputs: input as unknown as Prisma.InputJsonValue,
      quote: r.quote as unknown as Prisma.InputJsonValue,
      lineItems: r.quote.lineItems as unknown as Prisma.InputJsonValue,
      totalCents: r.quote.totalCents,
      priceTableVersion: r.quote.priceTableVersion,
      yards: r.quote.yards,
      days: r.quote.days,
      zip: r.quote.zip,
      debris: r.quote.debris,
      sentence: renderQuoteSentence(r.quote),
      createdAt,
    },
  });
}

async function contact(input: { name: string | null; company?: string | null; phone?: string; social?: { channel: Channel; id: string; display: string }; firstSeenAt: Date }) {
  const identities: Prisma.ContactIdentityCreateWithoutContactInput[] = [];
  if (input.phone) identities.push({ tenantId: TENANT_ID, channel: 'sms', addressNormalized: input.phone });
  if (input.social) identities.push({ tenantId: TENANT_ID, channel: input.social.channel, addressNormalized: input.social.id, displayAddress: input.social.display });
  const c = await prisma.contact.create({
    data: { tenantId: TENANT_ID, name: input.name, company: input.company ?? null, firstSeenAt: input.firstSeenAt, createdAt: input.firstSeenAt, identities: { create: identities } },
  });
  if (input.phone) {
    await prisma.consent.create({
      data: { tenantId: TENANT_ID, contactId: c.id, channel: 'sms', purpose: 'transactional', status: 'granted', source: 'inbound_message', evidence: { seeded: true, from: input.phone }, capturedAt: input.firstSeenAt },
    });
  }
  return c;
}

interface SeedMsg {
  who: MessageAuthor;
  text: string;
  meta?: string;
  at: Date;
  quote?: boolean;
}

async function conversation(input: {
  contactId: string;
  channel: Channel;
  state: 'needs_you' | 'assistant' | 'confirmed';
  tag: string;
  unread: boolean;
  origin: string;
  handoff?: string | null;
  facts: Record<string, unknown>;
  aiState?: Record<string, unknown>;
  messages: SeedMsg[];
  quote?: { yards: number; days: number; zip: string; debris: DebrisType; at: Date };
  externalThreadId?: string | null;
}) {
  const last = input.messages[input.messages.length - 1];
  const conv = await prisma.conversation.create({
    data: {
      tenantId: TENANT_ID,
      contactId: input.contactId,
      channel: input.channel,
      state: input.state,
      tag: input.tag,
      aiMode: 'auto',
      facts: input.facts as Prisma.InputJsonValue,
      aiState: (input.aiState ?? { introduced: true }) as Prisma.InputJsonValue,
      handoffReason: input.handoff ?? null,
      lastMessageAt: last.at,
      lastMessagePreview: last.text.length > 160 ? `${last.text.slice(0, 157)}…` : last.text,
      unread: input.unread,
      origin: input.origin,
      externalThreadId: input.externalThreadId ?? null,
      createdAt: input.messages[0].at,
    },
  });
  const q = input.quote ? await quote(input.quote, { conversationId: conv.id, contactId: input.contactId }, input.quote.at) : null;
  for (const m of input.messages) {
    const voice = input.channel === 'phone' && m.who !== 'system';
    await prisma.message.create({
      data: {
        tenantId: TENANT_ID,
        conversationId: conv.id,
        direction: m.who === 'customer' ? 'inbound' : m.who === 'system' ? 'internal' : 'outbound',
        author: m.who,
        channel: input.channel,
        body: m.text,
        status: m.who === 'customer' ? 'received' : m.who === 'system' ? 'sent' : 'delivered',
        provider: m.who === 'system' ? null : voice ? 'voice' : 'mock',
        aiGenerated: m.who === 'assistant',
        quoteId: m.quote && q ? q.id : null,
        meta: m.meta ?? null,
        createdAt: m.at,
        sentAt: m.who === 'assistant' || m.who === 'owner' ? m.at : null,
      },
    });
  }
  if (q) await prisma.conversation.update({ where: { id: conv.id }, data: { aiState: { introduced: true, stage: input.aiState?.stage ?? 'booking', quoteId: q.id, quoteTotalCents: q.totalCents, quoteYards: q.yards, quoteDays: q.days, ...(input.aiState ?? {}) } } });
  return { conv, quote: q };
}

let orderSeq = 1030;
async function order(input: {
  number?: number;
  contactId: string;
  conversationId?: string | null;
  quoteId?: string | null;
  channel: Channel;
  status: 'requested' | 'confirmed' | 'picked_up' | 'closed';
  address: string;
  zip: string;
  placement: Placement;
  day: string;
  window?: string | null;
  createdAt: Date;
  pickedUpAt?: Date | null;
  deposit?: { url: string; session: string } | null;
  source: string;
  ai: boolean;
}) {
  const number = input.number ?? ++orderSeq;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(input.day) ? input.day : resolveDayPhrase(input.day, now, TZ);
  const o = await prisma.order.create({
    data: {
      tenantId: TENANT_ID,
      number: `RO-${number}`,
      status: input.status,
      contactId: input.contactId,
      conversationId: input.conversationId ?? null,
      quoteId: input.quoteId ?? null,
      channel: input.channel,
      address: input.address,
      zip: input.zip,
      placement: input.placement,
      permitCheck: input.placement === 'street',
      deliveryDate: iso ?? input.day,
      deliveryDateLabel: /^\d{4}-\d{2}-\d{2}$/.test(input.day) ? shortDateLabel(input.day) : input.day,
      deliveryWindow: input.window ?? null,
      depositRequested: !!input.deposit,
      depositUrl: input.deposit?.url ?? null,
      paymentSessionId: input.deposit?.session ?? null,
      paymentProvider: input.deposit ? 'mock' : null,
      depositCents: input.deposit ? 10000 : null,
      source: input.source,
      createdByAi: input.ai,
      deliveredAt: input.pickedUpAt ? new Date(input.pickedUpAt.getTime() - 6 * 86400000) : null,
      pickedUpAt: input.pickedUpAt ?? null,
      createdAt: input.createdAt,
    },
  });
  await prisma.orderEvent.create({ data: { tenantId: TENANT_ID, orderId: o.id, kind: 'created', toStatus: 'requested', data: { source: input.source }, createdAt: input.createdAt } });
  if (input.status !== 'requested') {
    await prisma.orderEvent.create({ data: { tenantId: TENANT_ID, orderId: o.id, kind: 'status', fromStatus: 'requested', toStatus: input.status, createdAt: input.pickedUpAt ?? input.createdAt } });
  }
  return o;
}

/* ------------------------------------------------------------------ seed */

async function main(): Promise<void> {
  await reset();

  await prisma.tenant.create({
    data: {
      id: TENANT_ID,
      name: NAME,
      slug: 'demo-roll-off',
      phone: '+14045550100',
      city: 'Atlanta',
      state: 'GA',
      timezone: TZ,
      businessHours: DEFAULT_BUSINESS_HOURS as unknown as Prisma.InputJsonValue,
      publishableKey: 'pk_demo_rolloff',
      oraviqNumber: '+14045550177',
      alertPhone: OWNER_CELL,
      depositCents: 10000,
      orderSeq: 1045,
    },
  });
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const existingUser = await prisma.user.findUnique({ where: { email: EMAIL } });
  const user = existingUser
    ? await prisma.user.update({ where: { id: existingUser.id }, data: { passwordHash, name: 'Demo Owner', phone: OWNER_CELL } })
    : await prisma.user.create({ data: { id: USER_ID, email: EMAIL, passwordHash, name: 'Demo Owner', phone: OWNER_CELL } });
  await prisma.membership.create({ data: { tenantId: TENANT_ID, userId: user.id, role: 'owner' } });

  await prisma.priceTable.create({ data: { tenantId: TENANT_ID, version: 1, rules: priceTableRules() as unknown as Prisma.InputJsonValue, createdAt: daysAgo(30) } });
  await prisma.phoneNumber.create({ data: { tenantId: TENANT_ID, e164: '+14045550177', provider: 'mock', providerNumberId: 'mock_num_4045550177', forwardingFrom: '+14045550100', registrationStatus: 'in_review', voiceRoute: 'receptionist' } });
  const conns: Array<[string, string, string | null]> = [
    ['sms', 'connected', '(404) 555-0177'],
    ['phone', 'connected', '(404) 555-0177'],
    ['facebook', 'not_connected', null],
    ['instagram', 'not_connected', null],
    ['google', 'connected', `${NAME} (Google Business Profile)`],
    ['stripe', 'connected', 'Test payments'],
  ];
  for (const [kind, status, externalName] of conns) {
    await prisma.channelAccount.create({
      data: { tenantId: TENANT_ID, kind: kind as any, provider: 'mock', status: status as any, externalName, externalAccountId: status === 'connected' ? `mock_${kind}_demo` : null },
    });
  }
  await prisma.receptionistSettings.create({
    data: { tenantId: TENANT_ID, ...receptionistDefaults(NAME), greeting: "Thanks for calling Demo Roll-Off Co. I'm the automated assistant, and this call may be recorded. How can I help?", transferNumber: OWNER_CELL, agentId: 'mock_agent_demo' },
  });
  await prisma.reviewRequestSettings.create({
    data: {
      tenantId: TENANT_ID,
      enabled: true,
      delayMinutes: 120,
      template: 'Thanks for renting with Demo Roll-Off Co., {first name}. Would you leave us a quick Google review? It helps a small business a lot: g.page/r/demo-roll-off',
      reviewLink: 'g.page/r/demo-roll-off',
    },
  });
  await prisma.siteSettings.create({
    data: {
      tenantId: TENANT_ID,
      slug: 'demo-roll-off',
      published: true,
      publishedAt: daysAgo(20),
      headline: 'Dumpster rentals across Atlanta, delivered fast.',
      intro: 'Get an instant price online or by text, day or night. Clear weight limits, no surprise fees, and drivers who put it where you ask.',
      accentColor: '#1F6B4F',
      sections: DEFAULT_SECTIONS,
    },
  });
  await prisma.widgetSettings.create({ data: { tenantId: TENANT_ID, ...widgetDefaults(NAME) } });
  await prisma.reviewSourceStats.createMany({
    data: [
      { tenantId: TENANT_ID, source: 'google', rating: 4.8, count: 127 },
      { tenantId: TENANT_ID, source: 'facebook', recommendPct: 96, count: 41 },
    ],
  });

  /* contacts */
  const jasmine = await contact({ name: 'Jasmine Carter', phone: '+14045550182', firstSeenAt: at(0, 18, 40) });
  const dana = await contact({ name: 'Dana Whitfield', social: { channel: 'facebook', id: 'fb_psid_dana_whitfield', display: 'Facebook profile' }, firstSeenAt: at(0, 18, 18) });
  const reno = await contact({ name: 'Atlanta Reno Co.', social: { channel: 'instagram', id: 'ig_atl_reno_co', display: '@atl.reno.co' }, firstSeenAt: at(0, 17, 44) });
  const marcus = await contact({ name: 'Marcus Bell', company: 'Bell Renovations', phone: '+16785550147', firstSeenAt: new Date('2025-03-14T15:00:00Z') });
  const visitor = await contact({ name: null, phone: '+14705550119', social: { channel: 'web_chat', id: 'cs_seed_c3_visitor_000000000', display: 'Website visitor' }, firstSeenAt: at(0, 16, 30) });
  const rob = await contact({ name: 'Rob Delgado', phone: '+14045550191', firstSeenAt: at(0, 7, 52) });
  const priya = await contact({ name: 'Priya Natarajan', phone: '+14045550163', firstSeenAt: daysAgo(14) });
  const tom = await contact({ name: 'Tom Reyes', phone: '+17705550128', firstSeenAt: daysAgo(16) });
  const jamal = await contact({ name: 'Jamal Hughes', phone: '+14045550137', firstSeenAt: daysAgo(12) });
  const linda = await contact({ name: 'Linda Marsh', phone: '+14045550144', firstSeenAt: daysAgo(20) });
  void linda;

  /* c1 Jasmine Carter — missed call → quote → order to confirm */
  const c1 = await conversation({
    contactId: jasmine.id,
    channel: 'sms',
    state: 'needs_you',
    tag: 'Order to confirm',
    unread: true,
    origin: 'missed_call',
    facts: { yards: 20, days: 10, zip: '30319', debris: 'construction', address: '2215 Briarwood Rd', date: 'Thursday', placement: 'driveway' },
    aiState: { stage: 'booked' },
    quote: { yards: 20, days: 10, zip: '30319', debris: 'construction', at: at(0, 18, 42, 4) },
    messages: [
      { who: 'system', text: 'Missed call from (404) 555-0182, 6:40 p.m. The assistant texted back in 9 seconds.', at: at(0, 18, 40) },
      { who: 'assistant', text: "Sorry we missed your call. This is Demo Roll-Off Co.'s automated assistant. What size dumpster do you need, and where?", meta: 'SMS, 6:40 p.m.', at: at(0, 18, 40, 9) },
      { who: 'customer', text: 'Kitchen remodel, need a 20 yard in 30319 for like 10 days', meta: 'SMS, 6:42 p.m.', at: at(0, 18, 42) },
      { who: 'assistant', text: 'A 20-yard for 10 days is $720 delivered. It includes 3 tons, then $95 per ton over. Want me to book it? Send the delivery address and the day you need it.', meta: 'SMS, 6:42 p.m.', at: at(0, 18, 42, 5), quote: true },
      { who: 'customer', text: '2215 Briarwood Rd, Thursday morning please. Driveway is fine', meta: 'SMS, 6:43 p.m.', at: at(0, 18, 43) },
      { who: 'assistant', text: "Got it: 20-yard to 2215 Briarwood Rd, delivery Thursday, $720. I've sent this to the owner to confirm the drop-off time; you'll get a text with a deposit link to lock it in.", meta: 'SMS, 6:43 p.m.', at: at(0, 18, 43, 6) },
    ],
  });

  /* c6 Dana Whitfield — Facebook, quote sent */
  const c6 = await conversation({
    contactId: dana.id,
    channel: 'facebook',
    state: 'assistant',
    tag: 'Quote sent',
    unread: false,
    origin: 'inbound_message',
    facts: { yards: 10, days: 3, zip: '30307', debris: 'household' },
    quote: { yards: 10, days: 3, zip: '30307', debris: 'household', at: at(0, 18, 18, 4) },
    externalThreadId: 'mock_thread_fb_dana',
    messages: [
      { who: 'customer', text: "How much for a 10 yard this weekend? Cleaning out my mom's garage in 30307", meta: 'Facebook, 6:18 p.m.', at: at(0, 18, 18) },
      { who: 'assistant', text: "Hi Dana, this is Demo Roll-Off Co.'s automated assistant. A 10-yard for 3 days is $425 delivered. It includes 1.5 tons, then $95 per ton over. Want me to book it? Send the delivery address and the day you need it.", meta: 'Facebook, 6:18 p.m.', at: at(0, 18, 18, 6), quote: true },
    ],
  });
  void c6;

  /* c7 Atlanta Reno Co. — Instagram, order to confirm */
  const c7 = await conversation({
    contactId: reno.id,
    channel: 'instagram',
    state: 'needs_you',
    tag: 'Order to confirm',
    unread: true,
    origin: 'inbound_message',
    facts: { yards: 30, days: 7, zip: '30318', debris: 'construction', address: '1180 Howell Mill Rd', date: 'Tuesday' },
    aiState: { stage: 'booked' },
    quote: { yards: 30, days: 7, zip: '30318', debris: 'construction', at: at(0, 17, 44, 4) },
    externalThreadId: 'mock_thread_ig_reno',
    messages: [
      { who: 'customer', text: 'do you take roofing shingles? need a 30 for a reroof in 30318 next tuesday, 7 days', meta: 'Instagram, 5:44 p.m.', at: at(0, 17, 44) },
      { who: 'assistant', text: "Hi, this is Demo Roll-Off Co.'s automated assistant. Yes, asphalt shingles are fine. A 30-yard for 7 days is $795 delivered. It includes 4 tons, then $95 per ton over. Shingles are heavy, so I'll note the weight on your order. Want me to book it? Send the delivery address.", meta: 'Instagram, 5:44 p.m.', at: at(0, 17, 44, 7), quote: true },
      { who: 'customer', text: '1180 Howell Mill Rd', meta: 'Instagram, 5:47 p.m.', at: at(0, 17, 47) },
      { who: 'assistant', text: "Got it: 30-yard to 1180 Howell Mill Rd, delivery Tuesday, $795. I've sent this to the owner to confirm the drop-off time.", meta: 'Instagram, 5:48 p.m.', at: at(0, 17, 48) },
    ],
  });

  /* c2 Marcus Bell — repeat customer, street placement */
  const c2 = await conversation({
    contactId: marcus.id,
    channel: 'sms',
    state: 'needs_you',
    tag: 'Order to confirm',
    unread: true,
    origin: 'inbound_message',
    facts: { yards: 30, days: 7, zip: '30318', debris: 'construction', address: '418 Elm St', date: 'Monday', placement: 'street', name: 'Marcus' },
    aiState: { stage: 'booked' },
    quote: { yards: 30, days: 7, zip: '30318', debris: 'construction', at: at(0, 17, 10, 4) },
    messages: [
      { who: 'customer', text: 'Same as last time, 30 yd to the Elm St job. Monday', meta: 'SMS, 5:10 p.m.', at: at(0, 17, 10) },
      { who: 'assistant', text: 'Welcome back, Marcus. A 30-yard for 7 days to 418 Elm St (zone 1) is $795 delivered, 4 tons included, then $95 per ton. Same as your last order. Book it for Monday?', meta: 'SMS, 5:10 p.m.', at: at(0, 17, 10, 6), quote: true },
      { who: 'customer', text: 'Yes', meta: 'SMS, 5:12 p.m.', at: at(0, 17, 12) },
      { who: 'assistant', text: "Done. I've sent it to the owner to confirm the drop-off time for Monday.", meta: 'SMS, 5:12 p.m.', at: at(0, 17, 12, 5) },
    ],
  });

  /* c3 website visitor — concrete in a 20-yard → needs you */
  const c3 = await conversation({
    contactId: visitor.id,
    channel: 'web_chat',
    state: 'needs_you',
    tag: 'Needs you',
    unread: true,
    origin: 'web_chat',
    handoff: 'Concrete in a 20-yard',
    facts: { yards: 20, debris: 'heavy' },
    aiState: { stage: 'collect', handoff: 'Concrete or dirt in a 20-yard' },
    quote: { yards: 10, days: 7, zip: '30306', debris: 'heavy', at: at(0, 16, 30, 50) },
    externalThreadId: 'cs_seed_c3_visitor_000000000',
    messages: [
      { who: 'customer', text: 'Can I put broken concrete from my patio in a 20 yard?', meta: 'Website chat, 4:30 p.m.', at: at(0, 16, 30) },
      { who: 'assistant', text: "Hi, this is Demo Roll-Off Co.'s automated assistant. Concrete and dirt are heavy, so we only take them in 10 or 15-yard dumpsters at a flat price. A 10-yard clean-fill is $525. I've also asked the owner to check your job.", meta: 'Website chat, 4:31 p.m.', at: at(0, 16, 31), quote: true },
      { who: 'system', text: 'Handed to the owner: concrete in a 20-yard.', at: at(0, 16, 31, 2) },
    ],
  });
  void c3;

  /* c8 Rob Delgado — AI receptionist call, quote given and texted */
  const robGreeting = "Thanks for calling Demo Roll-Off Co. I'm the automated assistant, and this call may be recorded. How can I help?";
  const c8 = await conversation({
    contactId: rob.id,
    channel: 'phone',
    state: 'assistant',
    tag: 'Quote given',
    unread: false,
    origin: 'call',
    facts: { yards: 20, days: 7, zip: '30344', debris: 'construction' },
    quote: { yards: 20, days: 7, zip: '30344', debris: 'construction', at: at(0, 7, 53) },
    messages: [
      { who: 'system', text: 'The AI receptionist answered at 7:52 a.m., after hours. Call lasted 2:14.', at: at(0, 7, 52) },
      { who: 'customer', text: 'Yeah hi, I need a dumpster for a roof tear-off, probably a 20, in 30344.', meta: 'Caller, 7:52 a.m.', at: at(0, 7, 52, 20) },
      { who: 'assistant', text: "A 20-yard for 7 days is $675 delivered. It includes 3 tons, then $95 per ton over. Shingles are heavy, so I'll note the weight. Want me to book it?", meta: 'AI receptionist, 7:53 a.m.', at: at(0, 7, 53, 5), quote: true },
      { who: 'customer', text: 'Let me check with my wife. Can you text me that?', meta: 'Caller, 7:54 a.m.', at: at(0, 7, 54) },
      { who: 'assistant', text: "Sure. I've texted you the quote. Reply to that text any time to book.", meta: 'AI receptionist, 7:54 a.m.', at: at(0, 7, 54, 10) },
      { who: 'system', text: 'Quote texted to (404) 555-0191.', at: at(0, 7, 54, 12) },
    ],
  });
  await prisma.consent.create({
    data: { tenantId: TENANT_ID, contactId: rob.id, channel: 'sms', purpose: 'transactional', status: 'granted', source: 'verbal_on_call', evidence: { seeded: true, note: 'Caller asked for the quote by text.' }, capturedAt: at(0, 7, 54) },
  });

  /* c4 Priya Natarajan — extension (her order's quote backs the $15 / $45) */
  const priyaQuote = await quote({ yards: 20, days: 10, zip: '30306', debris: 'construction' }, { contactId: priya.id }, daysAgo(14));
  const c4 = await conversation({
    contactId: priya.id,
    channel: 'sms',
    state: 'assistant',
    tag: 'Extension',
    unread: false,
    origin: 'inbound_message',
    facts: { yards: 20, zip: '30306', debris: 'construction' },
    messages: [
      { who: 'customer', text: 'Hey can we keep the dumpster 3 more days? Not done yet', meta: 'SMS, 2:04 p.m.', at: at(-4, 14, 4) },
      { who: 'assistant', text: "No problem. 3 extra days at $15 is $45, added to your order. Pickup moves to Saturday. I've let dispatch know.", meta: 'SMS, 2:05 p.m.', at: at(-4, 14, 5) },
    ],
  });
  await prisma.quote.update({ where: { id: priyaQuote.id }, data: { conversationId: c4.conv.id } });

  /* c5 Tom Reyes — confirmed with deposit link */
  const c5 = await conversation({
    contactId: tom.id,
    channel: 'sms',
    state: 'confirmed',
    tag: 'Confirmed',
    unread: false,
    origin: 'inbound_message',
    facts: { yards: 15, days: 5, zip: '30062', debris: 'household', address: '77 Oak Ln', date: 'Friday' },
    aiState: { stage: 'booked' },
    quote: { yards: 15, days: 5, zip: '30062', debris: 'household', at: at(-1, 21, 15, 4) },
    messages: [
      { who: 'customer', text: 'Need a 15 yard for a garage clean out in 30062, 5 days', meta: 'SMS, 9:15 p.m.', at: at(-1, 21, 15) },
      { who: 'assistant', text: 'A 15-yard for 5 days is $595 delivered. It includes 2 tons, then $95 per ton over. Want me to book it?', meta: 'SMS, 9:15 p.m.', at: at(-1, 21, 15, 6), quote: true },
      { who: 'customer', text: 'Yes, 77 Oak Ln, Friday', meta: 'SMS, 9:17 p.m.', at: at(-1, 21, 17) },
      { who: 'owner', text: 'Confirmed for Friday between 8 and 11 a.m. Deposit link: pay.example/ro-1042', meta: 'Owner, 7:02 a.m.', at: at(0, 7, 2) },
    ],
  });

  /* orders: current */
  await order({ number: 1042, contactId: tom.id, conversationId: c5.conv.id, quoteId: c5.quote!.id, channel: 'sms', status: 'confirmed', address: '77 Oak Ln', zip: '30062', placement: 'driveway', day: 'Friday', window: 'Morning, 7 to 11 a.m.', createdAt: at(-1, 21, 17, 5), deposit: { url: 'https://pay.oraviq.test/c/mock_cs_ro-1042_seed', session: 'mock_cs_ro-1042_seed' }, source: 'assistant', ai: true });
  await order({ number: 1043, contactId: marcus.id, conversationId: c2.conv.id, quoteId: c2.quote!.id, channel: 'sms', status: 'requested', address: '418 Elm St', zip: '30318', placement: 'street', day: 'Monday', createdAt: at(0, 17, 12, 5), source: 'assistant', ai: true });
  await order({ number: 1044, contactId: reno.id, conversationId: c7.conv.id, quoteId: c7.quote!.id, channel: 'instagram', status: 'requested', address: '1180 Howell Mill Rd', zip: '30318', placement: 'driveway', day: 'Tuesday', createdAt: at(0, 17, 48), source: 'assistant', ai: true });
  const o1 = await order({ number: 1045, contactId: jasmine.id, conversationId: c1.conv.id, quoteId: c1.quote!.id, channel: 'sms', status: 'requested', address: '2215 Briarwood Rd', zip: '30319', placement: 'driveway', day: 'Thursday', createdAt: at(0, 18, 43, 6), source: 'assistant', ai: true });

  /* orders: history (repeat customers, review-request jobs) */
  const marcusDates = ['2025-04-07', '2025-07-21', '2025-11-03', '2026-05-18'];
  for (const d of marcusDates) {
    const q = await quote({ yards: 30, days: 7, zip: '30318', debris: 'construction' }, { contactId: marcus.id }, new Date(`${d}T14:00:00Z`));
    await order({ contactId: marcus.id, quoteId: q.id, channel: 'sms', status: 'closed', address: '418 Elm St', zip: '30318', placement: 'street', day: d, createdAt: new Date(`${d}T14:00:00Z`), pickedUpAt: new Date(new Date(`${d}T14:00:00Z`).getTime() + 8 * 86400000), source: 'seed_history', ai: false });
  }
  const bellQ = await quote({ yards: 30, days: 7, zip: '30318', debris: 'construction' }, { contactId: marcus.id }, daysAgo(12));
  const bellOrder = await order({ contactId: marcus.id, quoteId: bellQ.id, channel: 'sms', status: 'closed', address: '418 Elm St', zip: '30318', placement: 'street', day: addDaysIso(anchorIso, -11), createdAt: daysAgo(12), pickedUpAt: at(-3, 10, 30), source: 'seed_history', ai: false });
  const jamalQ = await quote({ yards: 10, days: 7, zip: '30310', debris: 'household' }, { contactId: jamal.id }, daysAgo(12));
  const jamalOrder = await order({ contactId: jamal.id, quoteId: jamalQ.id, channel: 'sms', status: 'closed', address: '52 Lowery Blvd', zip: '30310', placement: 'driveway', day: addDaysIso(anchorIso, -11), createdAt: daysAgo(12), pickedUpAt: at(-4, 9, 45), source: 'seed_history', ai: false });
  const tomPastQ = await quote({ yards: 15, days: 7, zip: '30062', debris: 'household' }, { contactId: tom.id }, daysAgo(16));
  const tomPast = await order({ contactId: tom.id, quoteId: tomPastQ.id, channel: 'sms', status: 'closed', address: '77 Oak Ln', zip: '30062', placement: 'driveway', day: addDaysIso(anchorIso, -9), createdAt: daysAgo(16), pickedUpAt: at(-2, 15, 10), source: 'seed_history', ai: false });
  const priyaOrder = await order({ contactId: priya.id, conversationId: c4.conv.id, quoteId: priyaQuote.id, channel: 'sms', status: 'picked_up', address: '903 Ponce de Leon Ave', zip: '30306', placement: 'driveway', day: addDaysIso(anchorIso, -12), createdAt: daysAgo(14), pickedUpAt: at(0, 11, 20), source: 'seed_history', ai: true });

  /* review-request jobs j1–j5 */
  const sendAt = new Date(now.getTime() + 120 * 60000);
  await prisma.reviewRequest.createMany({
    data: [
      { tenantId: TENANT_ID, orderId: priyaOrder.id, contactId: priya.id, status: 'ready', sendAt, createdAt: at(0, 11, 20) },
      { tenantId: TENANT_ID, orderId: o1.id, contactId: jasmine.id, status: 'scheduled', createdAt: at(0, 18, 43, 7) },
      { tenantId: TENANT_ID, orderId: tomPast.id, contactId: tom.id, status: 'reviewed', sentAt: at(-2, 17, 10), createdAt: at(-2, 15, 10) },
      { tenantId: TENANT_ID, orderId: bellOrder.id, contactId: marcus.id, status: 'sent', sentAt: at(-3, 12, 30), createdAt: at(-3, 10, 30) },
      { tenantId: TENANT_ID, orderId: jamalOrder.id, contactId: jamal.id, status: 'sent', sentAt: at(-4, 11, 45), createdAt: at(-4, 9, 45) },
    ],
  });
  await prisma.scheduledAction.create({ data: { tenantId: TENANT_ID, kind: 'review_request.send', runAt: sendAt, payload: { orderId: priyaOrder.id }, dedupeKey: `review_request:${priyaOrder.id}`, status: 'pending' } });

  /* calls */
  const transcript = (lines: Array<[string, string]>) => lines.map(([w, t]) => ({ speaker: w === 'them' ? 'agent' : 'caller', text: t }));
  const callRows: Array<Prisma.CallUncheckedCreateInput> = [
    {
      tenantId: TENANT_ID,
      conversationId: c8.conv.id,
      contactId: rob.id,
      provider: 'mock',
      providerCallId: 'seed_call_rob',
      callerNumber: '+14045550191',
      callerName: 'Rob Delgado',
      startedAt: at(0, 7, 52),
      endedAt: at(0, 7, 54, 14),
      durationSeconds: 134,
      afterHours: true,
      status: 'ended',
      outcome: 'quote_given',
      summary: 'Roof tear-off in 30344. Quoted a 20-yard for 7 days at $675 delivered (zone 2), 3 tons included. Asked for the quote by text; sent.',
      transcript: transcript([
        ['them', robGreeting],
        ['me', 'Yeah hi, I need a dumpster for a roof tear-off, probably a 20, in 30344.'],
        ['them', "A 20-yard for 7 days is $675 delivered. It includes 3 tons, then $95 per ton over. Shingles are heavy, so I'll note the weight. Want me to book it?"],
        ['me', 'Let me check with my wife. Can you text me that?'],
        ['them', "Sure. I've texted you the quote. Reply to that text any time to book."],
      ]),
      disclosureVersion: CALL_DISCLOSURE_VERSION,
    },
    {
      tenantId: TENANT_ID,
      provider: 'mock',
      providerCallId: 'seed_call_unknown',
      callerNumber: '+16785550110',
      callerName: null,
      startedAt: at(-1, 20, 40),
      endedAt: at(-1, 20, 41, 48),
      durationSeconds: 108,
      afterHours: true,
      status: 'ended',
      outcome: 'quote_given',
      summary: 'Basement cleanout in 30318. Quoted a 30-yard for 7 days at $795 delivered. Caller said they would call back.',
      transcript: transcript([
        ['them', robGreeting],
        ['me', 'How much is your biggest one for a basement cleanout? 30318.'],
        ['them', 'For a basement cleanout most customers pick a 30-yard. A 30-yard for 7 days is $795 delivered, with 4 tons included. Want me to book it?'],
        ['me', "I'll call you back tomorrow."],
        ['them', "No problem. I've texted you the quote so you have it."],
      ]),
      disclosureVersion: CALL_DISCLOSURE_VERSION,
    },
    {
      tenantId: TENANT_ID,
      provider: 'mock',
      providerCallId: 'seed_call_angela',
      callerNumber: '+17705550175',
      callerName: 'Angela Brooks',
      startedAt: at(-1, 13, 15),
      endedAt: at(-1, 13, 15, 52),
      durationSeconds: 52,
      afterHours: false,
      status: 'ended',
      outcome: 'sent_to_you',
      transferredTo: OWNER_CELL,
      summary: 'Asked about a commercial account for 4 job sites. Transferred to your cell; you answered.',
      transcript: transcript([
        ['them', robGreeting],
        ['me', 'I manage four job sites and want to set up an account. Can I talk to the owner?'],
        ['them', 'Of course. Let me put you through to the owner now. One moment, please.'],
      ]),
      disclosureVersion: CALL_DISCLOSURE_VERSION,
    },
    {
      tenantId: TENANT_ID,
      contactId: priya.id,
      provider: 'mock',
      providerCallId: 'seed_call_priya',
      callerNumber: '+14045550163',
      callerName: 'Priya Natarajan',
      startedAt: at(-2, 21, 5),
      endedAt: at(-2, 21, 5, 31),
      durationSeconds: 31,
      afterHours: true,
      status: 'ended',
      outcome: 'message_taken',
      summary: 'Asked to move the pickup for her 20-yard to Monday. Added to the order notes for dispatch.',
      transcript: transcript([
        ['them', robGreeting],
        ['me', 'Can you pick up my dumpster Monday instead?'],
        ['them', "Done. I've moved your pickup request to Monday and let dispatch know. You'll get a text to confirm."],
      ]),
      disclosureVersion: CALL_DISCLOSURE_VERSION,
    },
  ];
  for (const c of callRows) await prisma.call.create({ data: c });

  /* reviews */
  const reviews: Array<{ source: 'google' | 'facebook'; author: string; rating: number | null; recommends: boolean | null; when: Date; text: string; phone?: string; reply?: string; drafts: string[] }> = [
    {
      source: 'google', author: 'Kevin Osei', rating: 5, recommends: null, when: daysAgo(2, 10),
      text: 'Texted them at 10 p.m. about a 20 yard and had a price in seconds. Driver dropped it exactly where I asked, off the grass.',
      drafts: ["Thanks, Kevin. Glad the late-night quote helped and the drop-off spot worked. Good luck with the project; we're here when you need the next one.", 'Thank you for the kind words, Kevin. Putting it exactly where you need it is the job. Call or text any time you need another dumpster.'],
    },
    {
      source: 'google', author: 'Linda Marsh', rating: 2, recommends: null, when: daysAgo(4, 15), phone: '+14045550144',
      text: 'Dumpster showed up 3 hours late and nobody called to say so. Price was fair, but I had a crew standing around.',
      drafts: ["Linda, we're sorry. Arriving 3 hours late without a call isn't acceptable, and it cost your crew time. That's on us. We'd like to make it right and will call you today. The Demo Roll-Off team", "Linda, thank you for telling us, and we're sorry about the delay and the silence. We now text customers when a truck is running late so this doesn't happen again. We'll call you today to make it right. The Demo Roll-Off team"],
    },
    {
      source: 'facebook', author: 'Dana Whitfield', rating: null, recommends: true, when: daysAgo(3, 11),
      text: 'Asked a question on Messenger on a Sunday and got a price right away. Booked it on the spot.',
      drafts: ["Thanks, Dana. Sunday questions are always welcome. Hope your mom's garage cleanout goes smoothly.", "Thank you, Dana. Glad you could book right away. We're here whenever you need us again."],
    },
    {
      source: 'google', author: 'Sofia Ramirez', rating: 4, recommends: null, when: daysAgo(7, 16),
      text: 'Easy booking and a clear price. Would have liked a text before pickup.',
      drafts: ['Thanks, Sofia, and fair point on the pickup heads-up. We now text customers the evening before pickup. Glad booking was easy.', "Thank you, Sofia. You're right about the pickup text; we've added one the evening before. Hope the project went well."],
    },
    {
      source: 'facebook', author: 'Marcus Bell', rating: null, recommends: true, when: daysAgo(8, 9),
      text: 'Our go-to for job-site roll-offs. Reordering by text takes 30 seconds.',
      reply: 'Thanks, Marcus. Always good working with Bell Renovations. See you on the next job.', drafts: [],
    },
    {
      source: 'google', author: 'Tom Reyes', rating: 5, recommends: null, when: daysAgo(14, 13),
      text: 'Garage cleanout done in a weekend. They were clear about the weight limit up front, so no surprise fees.',
      reply: 'Thanks, Tom. No surprises is the goal. Enjoy the clean garage.', drafts: [],
    },
  ];
  let i = 0;
  for (const r of reviews) {
    i++;
    const row = await prisma.review.create({
      data: {
        tenantId: TENANT_ID,
        source: r.source,
        externalId: `seed_review_${i}`,
        author: r.author,
        rating: r.rating,
        recommends: r.recommends,
        text: r.text,
        customerPhone: r.phone ?? null,
        reply: r.reply ?? null,
        repliedAt: r.reply ? new Date(r.when.getTime() + 3 * 3600000) : null,
        createdAt: r.when,
      },
    });
    // Oldest first, so the prototype's first draft is the one shown.
    const drafts = [...r.drafts].reverse();
    for (let k = 0; k < drafts.length; k++) {
      await prisma.reviewReplyDraft.create({ data: { tenantId: TENANT_ID, reviewId: row.id, text: drafts[k], aiGenerated: true, createdAt: new Date(r.when.getTime() + 60000 * (k + 1)) } });
    }
  }

  const counts = await Promise.all([prisma.conversation.count({ where: { tenantId: TENANT_ID } }), prisma.order.count({ where: { tenantId: TENANT_ID } }), prisma.call.count({ where: { tenantId: TENANT_ID } }), prisma.review.count({ where: { tenantId: TENANT_ID } })]);
  void TEXT_CONSENT_VERSION;
  void (null as unknown as Quote);
  console.log(`Seeded ${NAME}: ${counts[0]} conversations, ${counts[1]} orders, ${counts[2]} calls, ${counts[3]} reviews. Login ${EMAIL} / ${PASSWORD} (publishable key pk_demo_rolloff). Demo "today" is ${anchorIso}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
