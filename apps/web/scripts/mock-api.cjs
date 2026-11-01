/* Playwright route handler that answers the API with prototype-like fixtures (layout checks without a server). */
const now = new Date();
const iso = (minsAgo) => new Date(now.getTime() - minsAgo * 60000).toISOString();
const day = (d) => { const x = new Date(now); x.setDate(x.getDate() + d); return x.toISOString().slice(0, 10); };
const contact = (id, name, phone, extra = {}) => ({ id, name, phone, email: null, company: null, isRepeat: false, orderCount: 0, firstSeenAt: iso(60 * 24 * 300), ...extra });
const quote = (yards, days, total, zone = 'Zone 2', fee = 5000) => ({
  id: 'q' + yards + days, conversationId: null, createdAt: iso(30), sentence: '', yards, days, zip: '30319', zoneId: 'z2', zoneName: zone, debris: 'construction', heavyFlat: false,
  lineItems: [{ code: 'base', label: 'Base, 7 days included', amountCents: total - fee - Math.max(0, days - 7) * 1500 }, ...(days > 7 ? [{ code: 'extra_days', label: `${days - 7} extra days at $15`, amountCents: (days - 7) * 1500 }] : []), { code: 'delivery', label: `Delivery, ${zone}`, amountCents: fee }],
  totalCents: total, includedTons: 3, overagePerTonCents: 9500, includedDays: 7, priceTableVersion: 1,
});
const jas = contact('ct1', 'Jasmine Carter', '+14045550182');
const marcus = contact('ct2', 'Marcus Bell', '+16785550147', { company: 'Bell Renovations', isRepeat: true, orderCount: 6 });
const conv = (id, c, channel, state, tag, mins, preview, extra = {}) => ({ id, contact: c, channel, state, tag, aiMode: 'auto', lastMessagePreview: preview, lastMessageAt: iso(mins), unread: false, assignedUserId: null, ...extra });
const convs = [
  conv('c1', jas, 'sms', 'needs_you', 'Order to confirm', 20, "Got it: 20-yard to 2215 Briarwood Rd, delivery Thursday, $720. I've sent this to the owner to confirm the drop-off time."),
  conv('c6', contact('ct6', 'Dana Whitfield', null), 'facebook', 'assistant', 'Quote sent', 43, "Hi Dana, this is Demo Roll-Off Co.'s automated assistant. A 10-yard for 3 days is $425 delivered."),
  conv('c7', contact('ct7', 'Atlanta Reno Co.', null), 'instagram', 'needs_you', 'Order to confirm', 75, 'Got it: 30-yard to 1180 Howell Mill Rd, delivery Tuesday, $795.'),
  conv('c2', marcus, 'sms', 'needs_you', 'Order to confirm', 111, "Done. I've sent it to the owner to confirm the drop-off time for Monday."),
  conv('c3', contact('ct3', null, '+14705550119'), 'web_chat', 'needs_you', 'Needs you', 190, "Concrete and dirt are heavy, so we only take them in 10 or 15-yard dumpsters."),
  conv('c8', contact('ct8', 'Rob Delgado', '+14045550191'), 'phone', 'assistant', 'Quote given', 600, "Sure. I've texted you the quote. Reply to that text any time to book."),
  conv('c5', contact('ct5', 'Tom Reyes', '+17705550128'), 'sms', 'confirmed', 'Confirmed', 1500, 'Confirmed for Friday between 8 and 11 a.m.'),
];
const msg = (id, author, body, mins, channel = 'sms') => ({ id, conversationId: 'c1', author, channel, body, status: 'delivered', createdAt: iso(mins) });
const order = (id, c, channel, status, q, address, date, label, extra = {}) => ({ id, number: 'RO-10' + id.slice(1), status, contact: c, conversationId: 'c1', channel, quote: q, address, zip: '30319', placement: 'driveway', permitCheck: false, deliveryDate: date, deliveryDateLabel: label, deliveryWindow: null, depositRequested: false, depositPaid: false, depositUrl: null, notes: null, createdAt: iso(20), updatedAt: iso(20), ...extra });
const orders = [
  order('o1', jas, 'sms', 'requested', quote(20, 10, 72000), '2215 Briarwood Rd', 'Thursday', 'Thursday'),
  order('o4', contact('ct7', 'Atlanta Reno Co.', null), 'instagram', 'requested', quote(30, 7, 79500, 'Zone 1', 0), '1180 Howell Mill Rd', 'Tuesday', 'Tuesday'),
  order('o2', marcus, 'sms', 'requested', quote(30, 7, 79500, 'Zone 1', 0), '418 Elm St', 'Monday', 'Monday', { placement: 'street', permitCheck: true }),
  order('o5', contact('ct9', 'Grace Lee', '+14045550188'), 'booking_form', 'requested', quote(15, 5, 59500), '12 Pine St', day(3), 'Thu, Nov 5'),
  order('o3', contact('ct5', 'Tom Reyes', '+17705550128'), 'sms', 'confirmed', quote(15, 5, 59500), '77 Oak Ln', day(1), 'Fri, Nov 6', { depositRequested: true, deliveryWindow: 'Morning, 7 to 11 a.m.' }),
];
const detail = (id) => {
  const s = convs.find((c) => c.id === id) || convs[0];
  return { ...s, messages: [
    { ...msg('m0', 'system', 'Missed call from (404) 555-0182, 6:40 p.m. The assistant texted back in 9 seconds.', 25) },
    msg('m1', 'assistant', "Sorry we missed your call. This is Demo Roll-Off Co.'s automated assistant. What size dumpster do you need, and where?", 25),
    msg('m2', 'customer', 'Kitchen remodel, need a 20 yard in 30319 for like 10 days', 23),
    msg('m3', 'assistant', 'A 20-yard for 10 days is $720 delivered. It includes 3 tons, then $95 per ton over. Want me to book it? Send the delivery address and the day you need it.', 23),
    msg('m4', 'customer', '2215 Briarwood Rd, Thursday morning please. Driveway is fine', 21),
    msg('m5', 'assistant', "Got it: 20-yard to 2215 Briarwood Rd, delivery Thursday, $720. I've sent this to the owner to confirm the drop-off time; you'll get a text with a deposit link to lock it in.", 20),
  ].map((m) => ({ ...m, conversationId: s.id })), facts: { yards: 20, zip: '30319', days: 10, debris: 'construction', address: '2215 Briarwood Rd', date: 'Thursday', placement: 'driveway' },
  latestQuote: quote(20, 10, 72000), order: id === 'c1' ? orders[0] : null, handoffReason: s.state === 'needs_you' && id === 'c3' ? 'Concrete in a 20-yard' : null, calls: [] };
};
const SAMPLE = { version: 3, currency: 'USD', includedDays: 7, extraDayCents: 1500, overagePerTonCents: 9500, maxDays: 60, updatedAt: iso(1000),
  sizes: [[10, 42500, 1.5, true, 52500], [15, 49500, 2, true, 62500], [20, 62500, 3, false, null], [30, 79500, 4, false, null], [40, 97500, 5, false, null]].map(([yards, baseCents, includedTons, heavyAllowed, heavyFlatCents]) => ({ yards, baseCents, includedTons, heavyAllowed, heavyFlatCents, active: true, hint: 'Kitchen remodel, flooring, roofing' })),
  zones: [{ id: 'z1', name: 'Zone 1', feeCents: 0, zips: '30303 30305 30306 30307 30308 30309 30310 30312 30313 30314 30315 30316 30317 30318'.split(' ') }, { id: 'z2', name: 'Zone 2', feeCents: 5000, zips: '30030 30032 30033 30080 30082 30319 30327 30328 30329'.split(' ') }, { id: 'z3', name: 'Zone 3', feeCents: 10000, zips: '30060 30062 30064 30067'.split(' ') }],
  surcharges: [{ key: 'mattress', label: 'mattress', cents: 2500 }, { key: 'tire', label: 'tire', cents: 1500 }, { key: 'appliance', label: 'appliance with refrigerant', pluralLabel: 'appliances with refrigerant', cents: 4000 }],
  prohibited: ['paint', 'batteries', 'motor oil', 'asbestos', 'chemicals', 'propane', 'hazardous'] };
const tenant = { id: 't1', name: 'Demo Roll-Off Co.', slug: 'demo-roll-off', phone: '+14045550100', city: 'Atlanta', state: 'GA', timezone: 'America/New_York', oraviqNumber: '+14045550177',
  businessHours: { days: [null, { day: 1, open: '07:00', close: '18:00' }, { day: 2, open: '07:00', close: '18:00' }, { day: 3, open: '07:00', close: '18:00' }, { day: 4, open: '07:00', close: '18:00' }, { day: 5, open: '07:00', close: '18:00' }, { day: 6, open: '08:00', close: '12:00' }] } };
const user = { id: 'u1', name: 'Dana Owner', email: 'demo@oraviq.ai', role: 'owner' };
const reviews = [
  { id: 'r1', source: 'google', author: 'Kevin Osei', rating: 5, recommends: null, text: 'Texted them at 10 p.m. about a 20 yard and had a price in seconds. Driver dropped it exactly where I asked, off the grass.', createdAt: iso(2880), reply: null, repliedAt: null, draft: "Thanks, Kevin. Glad the late-night quote helped and the drop-off spot worked.", needsCall: false, customerPhone: null },
  { id: 'r2', source: 'google', author: 'Linda Marsh', rating: 2, recommends: null, text: 'Dumpster showed up 3 hours late and nobody called to say so. Price was fair, but I had a crew standing around.', createdAt: iso(5760), reply: null, repliedAt: null, draft: "Linda, we're sorry. Arriving 3 hours late without a call isn't acceptable.", needsCall: true, customerPhone: '+14045550144' },
  { id: 'r6', source: 'facebook', author: 'Dana Whitfield', rating: null, recommends: true, text: 'Asked a question on Messenger on a Sunday and got a price right away.', createdAt: iso(4320), reply: null, repliedAt: null, draft: 'Thanks, Dana. Sunday questions are always welcome.', needsCall: false, customerPhone: null },
  { id: 'r5', source: 'google', author: 'Tom Reyes', rating: 5, recommends: null, text: 'Garage cleanout done in a weekend. They were clear about the weight limit up front.', createdAt: iso(20160), reply: 'Thanks, Tom. No surprises is the goal.', repliedAt: iso(20000), draft: null, needsCall: false, customerPhone: null },
];
const stats = { googleRating: 4.8, googleCount: 127, facebookRecommendPct: 96, facebookCount: 41, newThisMonth: 9, requestsThisMonth: 23, waitingForReply: 3 };
const calls = [
  { id: 'call1', callerName: 'Rob Delgado', callerNumber: '+14045550191', startedAt: iso(600), durationSeconds: 134, afterHours: true, outcome: 'quote_given', summary: 'Roof tear-off in 30344. Quoted a 20-yard for 7 days at $675 delivered (zone 2), 3 tons included. Asked for the quote by text; sent.' },
  { id: 'call2', callerName: null, callerNumber: '+16785550110', startedAt: iso(1500), durationSeconds: 108, afterHours: true, outcome: 'quote_given', summary: 'Basement cleanout in 30318. Quoted a 30-yard for 7 days at $795 delivered.' },
  { id: 'call3', callerName: 'Angela Brooks', callerNumber: '+17705550175', startedAt: iso(2000), durationSeconds: 52, afterHours: false, outcome: 'sent_to_you', summary: 'Asked about a commercial account for 4 job sites. Transferred to your cell; you answered.' },
];
const ROUTES = {
  'GET /auth/me': () => ({ user, tenant }),
  'POST /auth/login': () => ({ accessToken: 'a', refreshToken: 'r', expiresIn: 900, user, tenant }),
  'GET /conversations': (u) => { const st = u.searchParams.get('state'); const ch = u.searchParams.get('channel'); return { items: convs.filter((c) => (!st || c.state === st) && (!ch || ch.split(',').includes(c.channel))), nextCursor: null }; },
  'GET /conversations/:id': (u, id) => detail(id),
  'GET /orders': (u) => { const st = u.searchParams.get('status'); return { items: orders.filter((o) => !st || st.split(',').includes(o.status)) }; },
  'POST /orders/:id/confirm': (u, id) => ({ ...orders.find((o) => o.id === id), status: 'confirmed', depositRequested: true }),
  'GET /pricing': () => SAMPLE,
  'GET /receptionist': () => ({ enabled: true, mode: 'missed', greeting: "Thanks for calling Demo Roll-Off Co. I'm the automated assistant, and this call may be recorded. How can I help?", voice: 'warm', transferWhenAsked: true, transferWhenOutsideRules: true, transferNumber: '+14045550123', spanish: false, voiceProvider: 'mock', agentId: null }),
  'GET /receptionist/stats': () => ({ callsThisWeek: 9, afterHours: 7, ordersBooked: 3, ordersValueCents: 219500, sentToYou: 1 }),
  'GET /calls': () => ({ items: calls }),
  'GET /reviews': () => ({ items: reviews, stats }),
  'GET /review-requests': () => ({ settings: { enabled: true, delayMinutes: 120, template: 'Thanks for renting with Demo Roll-Off Co., {first name}. Would you leave us a quick Google review? It helps a small business a lot: g.page/r/demo-roll-off', reviewLink: 'g.page/r/demo-roll-off' },
    jobs: [{ orderId: 'o9', customerName: 'Priya Natarajan', jobLabel: '20-yard · picked up today, 11:20 a.m.', status: 'ready', sendAt: iso(-120) }, { orderId: 'o1', customerName: 'Jasmine Carter', jobLabel: '20-yard · delivery Thursday', status: 'scheduled', sendAt: null }, { orderId: 'o3', customerName: 'Tom Reyes', jobLabel: '15-yard · picked up Oct 30', status: 'reviewed', sendAt: null }, { orderId: 'o7', customerName: 'Bell Renovations', jobLabel: '30-yard · picked up Oct 29', status: 'sent', sendAt: null }] }),
  'GET /site': () => ({ slug: 'demo-roll-off', freeAddress: 'demo-roll-off.oraviq.site', customDomain: null, customDomainStatus: 'none', published: true, headline: 'Dumpster rentals across Atlanta, delivered fast.', intro: 'Get an instant price online or by text, day or night. Clear weight limits, no surprise fees, and drivers who put it where you ask.', accentColor: '#1F6B4F', sections: { prices: true, how: true, area: true, reviews: true, booking: true, chat: true } }),
  'GET /widgets': () => ({ publishableKey: 'pk_demo_rolloff', chatGreeting: "Hi, I'm Demo Roll-Off Co.'s automated assistant. Need a dumpster? Tell me the job or the size, and your ZIP code.", chatButtonLabel: 'Get a price', chatPosition: 'right', accentColor: '#1F6B4F' }),
  'GET /reports/weekly': () => ({ from: '2026-10-26', to: '2026-11-01', leadsAfterHoursOrMissed: 22, newInquiries: 36, quotesSent: 31, medianReplySeconds: 11, ordersBooked: 13, ordersByAssistant: 9, bookedValueCents: 914000,
    byDay: [['2026-10-26', 4, 1], ['2026-10-27', 6, 2], ['2026-10-28', 3, 1], ['2026-10-29', 7, 3], ['2026-10-30', 8, 3], ['2026-10-31', 5, 2], ['2026-11-01', 3, 1]].map(([d, i, o]) => ({ day: d, inquiries: i, orders: o })),
    byChannel: [['phone', 9], ['sms', 12], ['web_chat', 6], ['booking_form', 4], ['facebook', 3], ['instagram', 2]].map(([channel, count]) => ({ channel, count })), receptionistAnswered: 9 }),
  'GET /setup': () => [
    { key: 'business', title: 'Business details', description: 'Name, yard address, hours and the phone you want alerts on.', status: 'done' },
    { key: 'pricing', title: 'Pricing rules', description: 'Sizes, base prices, included tons, zones and item fees.', status: 'done', actionLabel: 'Edit', actionHref: '/pricing' },
    { key: 'number', title: 'Your Oraviq number', description: '(404) 555-0177 is reserved for you. Customers keep calling your usual number.', status: 'done' },
    { key: 'forwarding', title: 'Forward unanswered calls', description: "On your business phone, forward calls you don't answer to (404) 555-0177, then make a test call. Verizon: dial `*71 4045550177`. AT&T and T-Mobile: dial `**004*4045550177#`.", status: 'todo', actionLabel: 'Run test call' },
    { key: 'receptionist', title: 'AI receptionist', description: 'Answers calls you miss with your greeting and your prices.', status: 'done', actionLabel: 'Settings', actionHref: '/receptionist' },
    { key: 'texting_registration', title: 'Texting registration', description: 'US carriers require business texting to be registered (A2P 10DLC).', status: 'in_review' },
    { key: 'meta', title: 'Connect Facebook and Instagram', description: 'Messages to your Facebook Page and Instagram account arrive in your inbox.', status: 'todo' },
    { key: 'google', title: 'Connect your Google Business Profile', description: 'So you can read and reply to Google reviews here.', status: 'done' },
    { key: 'payments', title: 'Take deposits with Stripe', description: 'Confirmed orders get a deposit link.', status: 'todo' },
    { key: 'website', title: 'Website', description: 'Your free site is live at demo-roll-off.oraviq.site.', status: 'done', actionLabel: 'Open', actionHref: '/website' },
  ],
  'GET /team': () => [user, { id: 'u2', name: 'Luis Ortega', email: 'luis@demo-rolloff.com', role: 'dispatcher' }],
  'GET /connections': () => ['sms', 'phone', 'facebook', 'instagram', 'google', 'stripe'].map((channel) => ({ channel, provider: 'mock', status: ['sms', 'phone', 'google'].includes(channel) ? 'connected' : 'not_connected', externalName: channel === 'google' ? 'Demo Roll-Off Co.' : null })),
};
module.exports.mockApi = async (route) => {
  const req = route.request();
  const u = new URL(req.url());
  const path = u.pathname.replace(/^\/api\/v1/, '');
  for (const [k, fn] of Object.entries(ROUTES)) {
    const [method, pattern] = k.split(' ');
    if (method !== req.method()) continue;
    const re = new RegExp('^' + pattern.replace(/:id/g, '([^/]+)') + '$');
    const m = re.exec(path);
    if (m) return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(fn(u, m[1])) });
  }
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
  return route.fulfill({ status: 404, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ statusCode: 404, message: 'Not mocked: ' + req.method() + ' ' + path }) });
};
