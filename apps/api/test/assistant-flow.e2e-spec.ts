import { TEXT_CONSENT_VERSION, textConsentDisclosure } from '@oraviq/shared';
import { signZernio } from '../src/integrations/zernio/zernio.client';
import { signRetell, MockVoiceAgentAdapter } from '../src/integrations/mock/mock-voice-agent.adapter';
import { ScheduledActionsService } from '../src/jobs/scheduled-actions.service';
import { createTestApp, registerTenant, type TestApp } from './helpers';

const KITCHEN = 'need a 20 yard in 30319 for 10 days, kitchen remodel';

describe('assistant pipeline (simulator → quote → order → confirm → deposit)', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('quotes from @oraviq/pricing, books, confirms with a deposit link, and takes the mock payment', async () => {
    const reg = await registerTenant(t, 'Flow');
    const from = '(404) 555-0181';
    const r1 = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: KITCHEN }).expect(200);
    expect(r1.body.replies).toHaveLength(1);
    const reply = r1.body.replies[0];
    expect(reply.author).toBe('assistant');
    expect(reply.body).toContain('$720');
    expect(reply.body).toContain('3 tons');
    expect(reply.body).toMatch(/automated assistant/); // first reply discloses automation
    expect(reply.status).toBe('sent'); // went out through the mock provider

    const quote = await t.prisma.quote.findFirst({ where: { tenantId: reg.tenant.id, conversationId: r1.body.conversationId } });
    expect(quote).toBeTruthy();
    expect(quote!.totalCents).toBe(72000);
    expect(quote!.priceTableVersion).toBe(1);
    expect(reply.quoteId).toBe(quote!.id);

    const r2 = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: '2215 Briarwood Rd, Thursday. Driveway is fine' }).expect(200);
    expect(r2.body.conversationId).toBe(r1.body.conversationId);
    expect(r2.body.replies[0].body).toContain('Got it: 20-yard to 2215 Briarwood Rd, delivery Thursday, $720');

    const detail = await t.http().get(`/api/v1/conversations/${r1.body.conversationId}`).set(reg.auth).expect(200);
    expect(detail.body.state).toBe('needs_you');
    expect(detail.body.tag).toBe('Order to confirm');
    expect(detail.body.facts).toMatchObject({ yards: 20, zip: '30319', days: 10, debris: 'construction', address: '2215 Briarwood Rd', date: 'Thursday' });
    expect(detail.body.latestQuote.totalCents).toBe(72000);
    const order = detail.body.order;
    expect(order.status).toBe('requested');
    expect(order.placement).toBe('driveway');
    expect(order.permitCheck).toBe(false);
    expect(order.deliveryDateLabel).toBe('Thursday');
    expect(order.deliveryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Owner was alerted.
    const notes = await t.prisma.notification.findMany({ where: { tenantId: reg.tenant.id } });
    expect(notes.map((n) => n.title)).toContain('New order');

    // Confirm → customer text with a deposit link (mock payments are "connected").
    const confirmed = await t.http().post(`/api/v1/orders/${order.id}/confirm`).set(reg.auth).expect(200);
    expect(confirmed.body.status).toBe('confirmed');
    expect(confirmed.body.depositUrl).toMatch(/^https:\/\/pay\.oraviq\.test\//);
    const msgs = await t.prisma.message.findMany({ where: { conversationId: r1.body.conversationId }, orderBy: { createdAt: 'asc' } });
    const confirmMsg = msgs[msgs.length - 1];
    expect(confirmMsg.body).toContain('Confirmed: 20-yard to 2215 Briarwood Rd');
    expect(confirmMsg.body).toContain(confirmed.body.depositUrl);
    expect(confirmMsg.status).toBe('sent');
    const conv = await t.http().get(`/api/v1/conversations/${r1.body.conversationId}`).set(reg.auth).expect(200);
    expect(conv.body.state).toBe('confirmed');

    // Mock Stripe: the dev endpoint runs the same handler as checkout.session.completed.
    const sessionId = confirmed.body.depositUrl.split('/').pop();
    await t.http().post(`/api/v1/dev/payments/${sessionId}/pay`).expect(200);
    const paid = await t.http().get(`/api/v1/orders/${order.id}`).set(reg.auth).expect(200);
    expect(paid.body.status).toBe('deposit_paid');
    expect(paid.body.depositPaid).toBe(true);
    // Paying twice is a no-op (webhook dedupe).
    const again = await t.http().post(`/api/v1/dev/payments/${sessionId}/pay`).expect(200);
    expect(again.body.duplicate).toBe(true);
  });

  it('street placement flags a permit check', async () => {
    const reg = await registerTenant(t, 'Street');
    const from = '(404) 555-0182';
    await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: KITCHEN }).expect(200);
    const r = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: '118 Peach Ave, Friday. Put it on the street' }).expect(200);
    expect(r.body.replies[0].body).toContain('Street placement may need a city permit');
    const orders = await t.http().get('/api/v1/orders').set(reg.auth).expect(200);
    expect(orders.body.items[0]).toMatchObject({ placement: 'street', permitCheck: true, status: 'requested' });
  });

  it('STOP revokes SMS consent with one confirmation and blocks the next owner send', async () => {
    const reg = await registerTenant(t, 'Stop');
    const from = '(404) 555-0183';
    const r1 = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: KITCHEN }).expect(200);
    const stop = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: 'STOP' }).expect(200);
    expect(stop.body.replies).toHaveLength(1);
    expect(stop.body.replies[0].body).toMatch(/unsubscribed/i);
    // A second STOP gets no second confirmation.
    const stop2 = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: 'unsubscribe' }).expect(200);
    expect(stop2.body.replies).toHaveLength(0);

    const consents = await t.prisma.consent.findMany({ where: { tenantId: reg.tenant.id }, orderBy: { capturedAt: 'asc' } });
    expect(consents.some((c) => c.status === 'revoked' && c.channel === 'sms')).toBe(true);

    const res = await t.http().post(`/api/v1/conversations/${r1.body.conversationId}/messages`).set(reg.auth).send({ body: 'Hi, still need that dumpster?' }).expect(409);
    expect(res.body.message).toMatch(/STOP/);

    // A message after STOP is recorded but the assistant stays quiet and the owner is told.
    const after = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: 'actually how much for a 10 yard?' }).expect(200);
    expect(after.body.replies).toHaveLength(0);

    // HELP gets the help text.
    const help = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from: '(404) 555-0184', body: 'HELP' }).expect(200);
    expect(help.body.replies[0].body).toMatch(/Reply STOP to opt out/);
  });

  it('prohibited items hand off to the owner (needs_you)', async () => {
    const reg = await registerTenant(t, 'Paint');
    const r = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'facebook', body: 'Can I throw out paint cans in a 10 yard?' }).expect(200);
    expect(r.body.replies[0].body).toMatch(/Paint can't go in our dumpsters/);
    expect(r.body.replies[0].body).toMatch(/automated assistant/);
    const d = await t.http().get(`/api/v1/conversations/${r.body.conversationId}`).set(reg.auth).expect(200);
    expect(d.body.state).toBe('needs_you');
    expect(d.body.handoffReason).toBe('Asked about paint');
    expect(d.body.messages.some((m: any) => m.author === 'system' && /Handed to the owner/.test(m.body))).toBe(true);
  });

  it('out-of-zone and heavy-in-big-size also hand off', async () => {
    const reg = await registerTenant(t, 'Zone');
    const z = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from: '(404) 555-0185', body: '20 yard in 99999 for a week, construction' }).expect(200);
    expect(z.body.replies[0].body).toMatch(/outside our usual delivery area/);
    const h = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'web_chat', body: 'Can I put broken concrete in a 20 yard? 30306' }).expect(200);
    expect(h.body.replies[0].body).toMatch(/only take them in 10 or 15-yard/);
    expect(h.body.replies[0].body).toContain('$525'); // backed by a heavy quote from the engine
    const d = await t.http().get(`/api/v1/conversations/${h.body.conversationId}`).set(reg.auth).expect(200);
    expect(d.body.state).toBe('needs_you');
    expect(d.body.handoffReason).toBe('Concrete or dirt in a 20-yard');
  });

  it('aiMode draft stores a draft; off does nothing; take over adds a system message', async () => {
    const reg = await registerTenant(t, 'Modes');
    const from = '(404) 555-0186';
    const r1 = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: 'I need a dumpster' }).expect(200);
    const id = r1.body.conversationId;
    await t.http().patch(`/api/v1/conversations/${id}`).set(reg.auth).send({ aiMode: 'draft' }).expect(200);
    const r2 = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: '20 yard' }).expect(200);
    expect(r2.body.replies[0].status).toBe('draft');
    const off = await t.http().patch(`/api/v1/conversations/${id}`).set(reg.auth).send({ aiMode: 'off' }).expect(200);
    expect(off.body.aiMode).toBe('off');
    const r3 = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: '30319' }).expect(200);
    expect(r3.body.replies).toHaveLength(0);
    const d = await t.http().get(`/api/v1/conversations/${id}`).set(reg.auth).expect(200);
    expect(d.body.messages.some((m: any) => /You took over/.test(m.body))).toBe(true);
    const sent = await t.http().post(`/api/v1/conversations/${id}/messages`).set(reg.auth).set('Idempotency-Key', 'tap-1').send({ body: 'This is the owner, I can help.' }).expect(201);
    expect(sent.body).toMatchObject({ author: 'owner', status: 'sent' });
    // A retried tap with the same key doesn't text the customer twice.
    const retry = await t.http().post(`/api/v1/conversations/${id}/messages`).set(reg.auth).set('Idempotency-Key', 'tap-1').send({ body: 'This is the owner, I can help.' }).expect(201);
    expect(retry.body.id).toBe(sent.body.id);
  });

  it('recognises a repeat customer and reuses their last order', async () => {
    const reg = await registerTenant(t, 'Repeat');
    const from = '(404) 555-0187';
    await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: '30 yard in 30318 for 7 days, construction' }).expect(200);
    await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: '418 Elm St, Monday' }).expect(200);
    const orders = await t.http().get('/api/v1/orders').set(reg.auth).expect(200);
    const id = orders.body.items[0].id;
    for (const status of ['confirmed', 'delivered', 'picked_up', 'closed']) {
      await t.http().post(`/api/v1/orders/${id}/status`).set(reg.auth).send({ status }).expect(200);
    }
    const r = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: 'Same as last time. Monday', newConversation: true }).expect(200);
    expect(r.body.replies[0].body).toContain('$795');
    expect(r.body.replies[0].body).toMatch(/418 Elm St/);
  });
});

describe('order state machine', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('enforces ORDER_TRANSITIONS and schedules the review request on pickup', async () => {
    const reg = await registerTenant(t, 'Machine');
    const from = '(404) 555-0190';
    await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: KITCHEN }).expect(200);
    await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: '2215 Briarwood Rd, Thursday' }).expect(200);
    const id = (await t.http().get('/api/v1/orders').set(reg.auth)).body.items[0].id;

    const bad = await t.http().post(`/api/v1/orders/${id}/status`).set(reg.auth).send({ status: 'delivered' }).expect(409);
    expect(bad.body).toMatchObject({ statusCode: 409, from: 'requested', to: 'delivered' });
    await t.http().post(`/api/v1/orders/${id}/status`).set(reg.auth).send({ status: 'nonsense' }).expect(400);
    await t.http().post(`/api/v1/orders/${id}/confirm`).set(reg.auth).expect(200);
    await t.http().post(`/api/v1/orders/${id}/confirm`).set(reg.auth).expect(409);
    await t.http().post(`/api/v1/orders/${id}/status`).set(reg.auth).send({ status: 'scheduled' }).expect(200);
    await t.http().post(`/api/v1/orders/${id}/status`).set(reg.auth).send({ status: 'picked_up' }).expect(409);
    await t.http().post(`/api/v1/orders/${id}/status`).set(reg.auth).send({ status: 'delivered' }).expect(200);
    const picked = await t.http().post(`/api/v1/orders/${id}/status`).set(reg.auth).send({ status: 'picked_up' }).expect(200);
    expect(picked.body.status).toBe('picked_up');

    const action = await t.prisma.scheduledAction.findFirst({ where: { tenantId: reg.tenant.id, kind: 'review_request.send' } });
    expect(action?.status).toBe('pending');
    expect(action!.runAt.getTime()).toBeGreaterThan(Date.now() + 100 * 60000);
    const rr = await t.http().get('/api/v1/review-requests').set(reg.auth).expect(200);
    expect(rr.body.jobs.find((j: any) => j.orderId === id).status).toBe('ready');

    // The poller sends it when due, through the scheduled_actions row.
    await t.app.get(ScheduledActionsService).runDue(new Date(Date.now() + 3 * 3600000));
    const rr2 = await t.http().get('/api/v1/review-requests').set(reg.auth).expect(200);
    expect(rr2.body.jobs.find((j: any) => j.orderId === id).status).toBe('sent');
    const last = await t.prisma.message.findFirst({ where: { tenantId: reg.tenant.id }, orderBy: { createdAt: 'desc' } });
    expect(last!.body).toMatch(/Would you leave us a quick Google review/);

    await t.http().post(`/api/v1/orders/${id}/status`).set(reg.auth).send({ status: 'closed' }).expect(200);
    await t.http().post(`/api/v1/orders/${id}/status`).set(reg.auth).send({ status: 'cancelled' }).expect(409);
  });

  it('reschedules with an optional customer text', async () => {
    const reg = await registerTenant(t, 'Resched');
    const from = '(404) 555-0191';
    await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: KITCHEN }).expect(200);
    const r = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: '2215 Briarwood Rd, Thursday' }).expect(200);
    const id = (await t.http().get('/api/v1/orders').set(reg.auth)).body.items[0].id;
    const res = await t.http().post(`/api/v1/orders/${id}/reschedule`).set(reg.auth).send({ deliveryDate: '2030-06-14', deliveryWindow: 'Afternoon, 2 to 5 p.m.', notifyCustomer: true }).expect(200);
    expect(res.body).toMatchObject({ deliveryDate: '2030-06-14', deliveryDateLabel: 'Fri, Jun 14', deliveryWindow: 'Afternoon, 2 to 5 p.m.' });
    const d = await t.http().get(`/api/v1/conversations/${r.body.conversationId}`).set(reg.auth).expect(200);
    expect(d.body.messages[d.body.messages.length - 1].body).toMatch(/now arrives Friday, Jun 14, afternoon, 2 to 5 p\.m\./);
  });
});

describe('pricing, public booking, voice tools, webhooks', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('PUT /pricing validates (400 with problems) and bumps the version', async () => {
    const reg = await registerTenant(t, 'Pricing');
    const current = (await t.http().get('/api/v1/pricing').set(reg.auth).expect(200)).body;
    const { version: _v, currency: _c, updatedAt: _u, ...body } = current;
    const bad = await t
      .http()
      .put('/api/v1/pricing')
      .set(reg.auth)
      .send({ ...body, includedDays: 0, sizes: [...body.sizes, { ...body.sizes[0] }] })
      .expect(400);
    expect(bad.body.statusCode).toBe(400);
    expect(bad.body.problems).toEqual(expect.arrayContaining(['Days included must be 1 or more.', 'The 10-yard is listed twice.']));
    const shape = await t.http().put('/api/v1/pricing').set(reg.auth).send({ ...body, zones: [{ id: 'z9', name: 'Zone 9', feeCents: 100, zips: ['abc'] }] }).expect(400);
    expect(shape.body.problems.length).toBeGreaterThan(0);

    const ok = await t.http().put('/api/v1/pricing').set(reg.auth).send({ ...body, extraDayCents: 2000 }).expect(200);
    expect(ok.body.version).toBe(2);
    // New quotes use the new version.
    const r = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from: '(404) 555-0192', body: KITCHEN }).expect(200);
    expect(r.body.replies[0].body).toContain('$735'); // 625 + 3 × 20 + 50
    const q = await t.prisma.quote.findFirst({ where: { tenantId: reg.tenant.id }, orderBy: { createdAt: 'desc' } });
    expect(q!.priceTableVersion).toBe(2);
  });

  it('public booking requires consent and stores TCPA evidence', async () => {
    const reg = await registerTenant(t, 'Booking');
    const key = (await t.http().get('/api/v1/widgets').set(reg.auth)).body.publishableKey;
    const base = { yards: 15, days: 7, debris: 'household', address: '12 Peach Ave', zip: '30307', deliveryDate: '2030-06-10', name: 'Ann Lee', phone: '(404) 555-0155' };
    const no = await t.http().post(`/api/v1/public/${key}/booking`).send({ ...base, consent: false, consentText: '' }).expect(400);
    expect(no.body.message).toMatch(/Tick the box/);
    const disclosure = textConsentDisclosure(reg.tenant.name);
    const res = await t
      .http()
      .post(`/api/v1/public/${key}/booking`)
      .set('User-Agent', 'jest-widget')
      .set('Origin', 'https://some-hauler-site.example')
      .send({ ...base, consent: true, consentText: disclosure, pageUrl: 'https://example.com/book' })
      .expect(201);
    expect(res.headers['access-control-allow-origin']).toBe('https://some-hauler-site.example');
    expect(res.body.orderNumber).toMatch(/^RO-\d+$/);
    expect(res.body.quote.totalCents).toBe(49500);
    expect(res.body.message).toContain('$495 delivered');

    const consent = await t.prisma.consent.findFirst({ where: { tenantId: reg.tenant.id, source: 'booking_form' } });
    expect(consent).toMatchObject({ status: 'granted', channel: 'sms', purpose: 'transactional', textVersion: TEXT_CONSENT_VERSION });
    expect(consent!.evidence).toMatchObject({ consentText: disclosure, checkbox: true, phone: '+14045550155', pageUrl: 'https://example.com/book', userAgent: 'jest-widget' });

    const orders = await t.http().get('/api/v1/orders?channel=booking_form').set(reg.auth).expect(200);
    expect(orders.body.items[0]).toMatchObject({ status: 'requested', channel: 'booking_form', address: '12 Peach Ave' });

    // Business, quote and chat work for the same key.
    const biz = await t.http().get(`/api/v1/public/${key}/business`).expect(200);
    expect(biz.body.sizes).toHaveLength(5);
    const pq = await t.http().post(`/api/v1/public/${key}/quote`).send({ yards: 40, days: 7, zip: '30303', debris: 'heavy' }).expect(200);
    expect(pq.body.ok).toBe(false);
    expect(pq.body.error.code).toBe('heavy_not_allowed');
    const chat = await t.http().post(`/api/v1/public/${key}/chat/start`).expect(200);
    expect(chat.body.messages[0].body).toMatch(/automated assistant/);
    const msg = await t.http().post(`/api/v1/public/${key}/chat/message`).send({ sessionId: chat.body.sessionId, body: 'how much for a 15 yard in 30307 for a week, garage cleanout' }).expect(200);
    expect(msg.body.messages[0].body).toContain('$495');
    await t.http().get('/api/v1/public/pk_does_not_exist/business').expect(404);
  });

  it('Retell get_quote returns the same total as the text assistant', async () => {
    const reg = await registerTenant(t, 'Voice');
    const body = JSON.stringify({
      name: 'get_quote',
      call: { call_id: 'call_test_get_quote', from_number: '+14045550177', to_number: reg.tenant.oraviqNumber, agent_id: 'agent_x' },
      args: { yards: 20, days: 10, zip: '30319', debris: 'construction' },
    });
    const res = await t
      .http()
      .post('/api/v1/voice/tools/get_quote')
      .set('Content-Type', 'application/json')
      .set('x-retell-signature', signRetell(body, MockVoiceAgentAdapter.DEV_KEY))
      .send(body)
      .expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.totalCents).toBe(72000);
    expect(res.body.sentence).toContain('$720');
    // Bad signature is refused.
    await t.http().post('/api/v1/voice/tools/get_quote').set('Content-Type', 'application/json').set('x-retell-signature', `v=${Date.now()},d=deadbeef`).send(body).expect(401);
    // The call shows up as a Call + phone conversation.
    const call = await t.prisma.call.findFirst({ where: { tenantId: reg.tenant.id, providerCallId: 'call_test_get_quote' } });
    expect(call?.conversationId).toBeTruthy();
  });

  it('in-app test call: greeting with disclosure, quote, text, booking, summary', async () => {
    const reg = await registerTenant(t, 'TestCall');
    const start = await t.http().post('/api/v1/receptionist/test-call').set(reg.auth).send({}).expect(200);
    expect(start.body.replies[0]).toMatch(/automated assistant.*recorded/);
    const callId = start.body.callId;
    const say = async (text: string) => (await t.http().post('/api/v1/receptionist/test-call').set(reg.auth).send({ callId, text }).expect(200)).body;
    await say('I need a dumpster for a kitchen remodel');
    await say('20 yard please');
    await say("It's in 30319");
    const q = await say('About 10 days');
    expect(q.replies[0]).toContain('$720');
    expect(q.replies[0]).toContain("I'll also text you this quote");
    const b = await say('2215 Briarwood Rd, Thursday');
    expect(b.replies[0]).toMatch(/Got it: 20-yard to 2215 Briarwood Rd/);
    const end = await t.http().post('/api/v1/receptionist/test-call').set(reg.auth).send({ callId, end: true }).expect(200);
    expect(end.body.ended).toBe(true);
    expect(end.body.summary).toMatch(/Quoted \$720 for 10 days/);
    const call = await t.http().get(`/api/v1/calls/${callId}`).set(reg.auth).expect(200);
    expect(call.body.outcome).toBe('order_requested');
    expect(call.body.transcript.length).toBeGreaterThan(5);
    const conv = await t.http().get(`/api/v1/conversations/${call.body.conversationId}`).set(reg.auth).expect(200);
    expect(conv.body.channel).toBe('phone');
    expect(conv.body.messages.some((m: any) => /Quote texted to/.test(m.body))).toBe(true);
    expect(conv.body.order.status).toBe('requested');

    const transfer = await t.http().post('/api/v1/receptionist/test-call').set(reg.auth).send({ text: 'Can I talk to someone?' }).expect(200);
    expect(transfer.body.ended).toBe(true);
    expect(transfer.body.transferredTo).toBeTruthy();
  });

  it('Zernio webhook: signature verified, stored once, processed once', async () => {
    const reg = await registerTenant(t, 'Webhook');
    await t.prisma.channelAccount.updateMany({ where: { tenantId: reg.tenant.id, kind: 'sms' }, data: { provider: 'zernio', externalAccountId: `zacc_${reg.tenant.id}` } });
    const event = {
      id: `evt_${Date.now()}`,
      event: 'message.received',
      timestamp: new Date().toISOString(),
      account: { accountId: `zacc_${reg.tenant.id}`, platform: 'sms' },
      conversation: { id: 'zconv_1' },
      message: { id: `zmsg_${Date.now()}`, conversationId: 'zconv_1', platform: 'sms', direction: 'incoming', text: KITCHEN, sender: { phone: '+14045550193', name: null }, sentAt: new Date().toISOString() },
    };
    const raw = JSON.stringify(event);
    await t.http().post('/api/v1/webhooks/zernio').set('Content-Type', 'application/json').set('X-Zernio-Signature', 'bad').send(raw).expect(401);
    const first = await t.http().post('/api/v1/webhooks/zernio').set('Content-Type', 'application/json').set('X-Zernio-Signature', signZernio(raw, 'test_zernio_secret')).send(raw).expect(200);
    expect(first.body.duplicate).toBe(false);
    const second = await t.http().post('/api/v1/webhooks/zernio').set('Content-Type', 'application/json').set('X-Zernio-Signature', signZernio(raw, 'test_zernio_secret')).send(raw).expect(200);
    expect(second.body.duplicate).toBe(true);

    const events = await t.prisma.webhookEvent.findMany({ where: { provider: 'zernio', externalEventId: event.id } });
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('processed');
    expect(events[0].tenantId).toBe(reg.tenant.id);
    const inbound = await t.prisma.message.findMany({ where: { tenantId: reg.tenant.id, direction: 'inbound' } });
    expect(inbound).toHaveLength(1);
    const replies = await t.prisma.message.findMany({ where: { tenantId: reg.tenant.id, author: 'assistant' } });
    expect(replies).toHaveLength(1);
    expect(replies[0].body).toContain('$720');
  });

  it('missed call → the assistant texts back', async () => {
    const reg = await registerTenant(t, 'Missed');
    const r = await t.http().post('/api/v1/simulator/missed-call').set(reg.auth).send({ from: '(404) 555-0194' }).expect(200);
    const d = await t.http().get(`/api/v1/conversations/${r.body.conversationId}`).set(reg.auth).expect(200);
    expect(d.body.messages[0].body).toMatch(/Missed call from \(404\) 555-0194/);
    expect(d.body.messages[1].body).toBe(`Sorry we missed your call. This is ${reg.tenant.name}'s automated assistant. What size dumpster do you need, and where?`);
    // The customer's text lands in the same conversation and the assistant doesn't re-introduce itself.
    const r2 = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from: '(404) 555-0194', body: KITCHEN }).expect(200);
    expect(r2.body.conversationId).toBe(r.body.conversationId);
    expect(r2.body.replies[0].body.startsWith('A 20-yard for 10 days is $720 delivered.')).toBe(true);
  });

  it('weekly report is computed from real rows', async () => {
    const reg = await registerTenant(t, 'Report');
    const from = '(404) 555-0195';
    await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: KITCHEN }).expect(200);
    // Simulator conversations are excluded from the report.
    const rep = await t.http().get('/api/v1/reports/weekly').set(reg.auth).expect(200);
    expect(rep.body).toMatchObject({ newInquiries: 0, quotesSent: 0, ordersBooked: 0 });
    expect(rep.body.byDay).toHaveLength(7);
    // A real website chat counts.
    const key = (await t.http().get('/api/v1/widgets').set(reg.auth)).body.publishableKey;
    const chat = await t.http().post(`/api/v1/public/${key}/chat/start`).expect(200);
    await t.http().post(`/api/v1/public/${key}/chat/message`).send({ sessionId: chat.body.sessionId, body: KITCHEN }).expect(200);
    const rep2 = await t.http().get('/api/v1/reports/weekly').set(reg.auth).expect(200);
    expect(rep2.body).toMatchObject({ newInquiries: 1, quotesSent: 1 });
    expect(rep2.body.byChannel).toEqual([{ channel: 'web_chat', count: 1 }]);
    expect(rep2.body.medianReplySeconds).not.toBeNull();
    await t.http().get('/api/v1/reports/weekly?to=bad').set(reg.auth).expect(400);
  });
});
