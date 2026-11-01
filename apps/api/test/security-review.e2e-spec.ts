import { textConsentDisclosure } from '@oraviq/shared';
import { env, resetEnvCache } from '../src/config/env';
import { MockVoiceAgentAdapter, signRetell } from '../src/integrations/mock/mock-voice-agent.adapter';
import { MockLlmProvider } from '../src/integrations/mock/mock-llm.provider';
import { LLM_PROVIDER, type AssistantTools, type AssistantTurnInput, type AssistantTurnOutput, type LlmProvider } from '../src/integrations/types';
import { AuthService } from '../src/modules/auth/auth.service';
import { createTestApp, registerTenant, type TestApp } from './helpers';

const KITCHEN = 'need a 20 yard in 30319 for 10 days, kitchen remodel';

/** Runs `fn` with NODE_ENV=production (mock adapters, as on Render before provider keys are set). */
async function asProduction<T>(fn: () => Promise<T>): Promise<T> {
  const saved = { NODE_ENV: process.env.NODE_ENV, JWT_SECRET: process.env.JWT_SECRET, JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET };
  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = 'prod-like-access-secret-0123456789abcdef';
  process.env.JWT_REFRESH_SECRET = 'prod-like-refresh-secret-0123456789abcdef';
  resetEnvCache();
  try {
    expect(env().isProduction).toBe(true);
    return await fn();
  } finally {
    Object.assign(process.env, saved);
    resetEnvCache();
  }
}

/** An LLM that states a price without a dollar sign (prompt-injected or careless). */
class WordyPriceLlm implements LlmProvider {
  readonly name = 'fake';
  reply = "Sure, a 20-yard is 500 dollars delivered.";
  async runAssistantTurn(input: AssistantTurnInput, _tools: AssistantTools): Promise<AssistantTurnOutput> {
    return { reply: this.reply, facts: input.facts, aiState: { ...input.aiState, introduced: true }, traceId: 'fake' };
  }
  draftReviewReply = new MockLlmProvider().draftReviewReply;
}

async function bookedOrder(t: TestApp, reg: Awaited<ReturnType<typeof registerTenant>>, from: string) {
  const r1 = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: KITCHEN }).expect(200);
  await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: '2215 Briarwood Rd, Thursday' }).expect(200);
  const d = await t.http().get(`/api/v1/conversations/${r1.body.conversationId}`).set(reg.auth).expect(200);
  return { conversationId: r1.body.conversationId as string, orderId: d.body.order.id as string };
}

describe('security review: webhooks in production with mock adapters', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('refuses an unsigned Stripe event when payments run in mock mode in production', async () => {
    const reg = await registerTenant(t, 'ProdStripe');
    const { orderId } = await bookedOrder(t, reg, '(404) 555-0301');
    await t.http().post(`/api/v1/orders/${orderId}/confirm`).set(reg.auth).expect(200);
    const forged = JSON.stringify({ id: `evt_forged_${Date.now()}`, type: 'checkout.session.completed', data: { object: { id: 'cs_x', payment_status: 'paid', amount_total: 1, metadata: { orderId, tenantId: reg.tenant.id } } } });
    await asProduction(async () => {
      await t.http().post('/api/v1/webhooks/stripe').set('Content-Type', 'application/json').send(forged).expect(401);
    });
    const o = await t.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o.depositPaid).toBe(false);
    expect(o.status).toBe('confirmed');
  });

  it('refuses unsigned or dev-key-signed Retell tool calls when voice runs in mock mode in production', async () => {
    const reg = await registerTenant(t, 'ProdRetell');
    // A known customer of this hauler, with an address on file.
    await bookedOrder(t, reg, '(404) 555-0302');
    const body = JSON.stringify({ name: 'lookup_customer', call: { call_id: 'call_probe', from_number: '+14045550302', to_number: reg.tenant.oraviqNumber }, args: {} });
    await asProduction(async () => {
      const unsigned = await t.http().post('/api/v1/voice/tools/lookup_customer').set('Content-Type', 'application/json').send(body);
      expect(unsigned.status).toBe(401);
      expect(unsigned.body.lastOrder).toBeUndefined();
      await t.http().post('/api/v1/voice/tools/lookup_customer').set('Content-Type', 'application/json').set('x-retell-signature', signRetell(body, MockVoiceAgentAdapter.DEV_KEY)).send(body).expect(401);
      await t.http().post('/api/v1/webhooks/retell').set('Content-Type', 'application/json').send(JSON.stringify({ event: 'call_started', call: { call_id: 'call_probe2', to_number: reg.tenant.oraviqNumber } })).expect(401);
    });
  });

  it('refuses placeholder JWT secrets in production', () => {
    const saved = { NODE_ENV: process.env.NODE_ENV, JWT_SECRET: process.env.JWT_SECRET, JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET };
    try {
      process.env.NODE_ENV = 'production';
      // The values shipped in .env.example.
      process.env.JWT_SECRET = 'change-me-access';
      process.env.JWT_REFRESH_SECRET = 'change-me-refresh';
      resetEnvCache();
      expect(() => env()).toThrow(/JWT_SECRET/);
      process.env.JWT_SECRET = 'same-secret-for-both-0123456789abcdef';
      process.env.JWT_REFRESH_SECRET = 'same-secret-for-both-0123456789abcdef';
      resetEnvCache();
      expect(() => env()).toThrow(/JWT_SECRET/);
    } finally {
      Object.assign(process.env, saved);
      resetEnvCache();
    }
  });
});

describe('security review: tenant isolation, payments and order races', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it("a Stripe event from tenant B's connected account cannot mark tenant A's order paid via metadata", async () => {
    const a = await registerTenant(t, 'StripeVictim');
    const b = await registerTenant(t, 'StripeAttacker');
    const { orderId } = await bookedOrder(t, a, '(404) 555-0311');
    await t.http().post(`/api/v1/orders/${orderId}/confirm`).set(a.auth).expect(200);
    await t.prisma.channelAccount.updateMany({ where: { tenantId: b.tenant.id, kind: 'stripe' }, data: { externalAccountId: `acct_attacker_${b.tenant.id.slice(0, 8)}`, status: 'connected' } });
    // B creates and pays a session on its own Stripe account, with A's ids in the metadata.
    const ev = JSON.stringify({ id: `evt_xt_${Date.now()}`, type: 'checkout.session.completed', account: `acct_attacker_${b.tenant.id.slice(0, 8)}`, data: { object: { id: 'cs_attacker', payment_status: 'paid', amount_total: 100, metadata: { orderId, tenantId: a.tenant.id } } } });
    await t.http().post('/api/v1/webhooks/stripe').set('Content-Type', 'application/json').send(ev).expect(200);
    const o = await t.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(o.depositPaid).toBe(false);
    expect(o.status).toBe('confirmed');
  });

  it('two concurrent confirms text the customer once and the loser gets 409', async () => {
    const reg = await registerTenant(t, 'DoubleConfirm');
    const { orderId, conversationId } = await bookedOrder(t, reg, '(404) 555-0312');
    const res = await Promise.all([1, 2, 3].map(() => t.http().post(`/api/v1/orders/${orderId}/confirm`).set(reg.auth)));
    expect(res.map((r) => r.status).sort()).toEqual([200, 409, 409]);
    const confirms = await t.prisma.message.findMany({ where: { conversationId, body: { startsWith: 'Confirmed:' } } });
    expect(confirms).toHaveLength(1);
    const events = await t.prisma.orderEvent.findMany({ where: { orderId, toStatus: 'confirmed' } });
    expect(events).toHaveLength(1);
  });

  it('two different "paid" events for one deposit record it once', async () => {
    const reg = await registerTenant(t, 'DoublePaid');
    const { orderId, conversationId } = await bookedOrder(t, reg, '(404) 555-0313');
    await t.http().post(`/api/v1/orders/${orderId}/confirm`).set(reg.auth).expect(200);
    const ev = (n: number) => JSON.stringify({ id: `evt_paid_${n}_${Date.now()}`, type: 'checkout.session.completed', data: { object: { id: 'cs_same', payment_status: 'paid', amount_total: 10000, metadata: { orderId, tenantId: reg.tenant.id } } } });
    await Promise.all([1, 2, 3].map((n) => t.http().post('/api/v1/webhooks/stripe').set('Content-Type', 'application/json').send(ev(n)).expect(200)));
    const sys = await t.prisma.message.findMany({ where: { conversationId, body: { startsWith: 'Deposit paid' } } });
    expect(sys).toHaveLength(1);
    const events = await t.prisma.orderEvent.findMany({ where: { orderId, kind: 'deposit_paid' } });
    expect(events).toHaveLength(1);
  });
});

describe('security review: auth', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('a refresh token can only be rotated once, even concurrently', async () => {
    const reg = await registerTenant(t, 'RefreshRace');
    // Straight to the service: over supertest the requests barely overlap, in production they do.
    const svc = t.app.get(AuthService);
    const res = await Promise.allSettled([1, 2, 3].map(() => svc.refresh(reg.refreshToken)));
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('staff cannot change customer-facing settings (review texts, site, domain, widgets)', async () => {
    const reg = await registerTenant(t, 'StaffRole');
    await t.prisma.membership.updateMany({ where: { tenantId: reg.tenant.id }, data: { role: 'staff' } });
    const login = await t.http().post('/api/v1/auth/login').send({ email: reg.user.email, password: 'secret123' }).expect(200);
    expect(login.body.user.role).toBe('staff');
    const staff = { Authorization: `Bearer ${login.body.accessToken}` };
    await t.http().put('/api/v1/review-requests').set(staff).send({ template: 'Leave a review: https://evil.example' }).expect(403);
    await t.http().put('/api/v1/site').set(staff).send({ headline: 'Defaced' }).expect(403);
    await t.http().post('/api/v1/site/publish').set(staff).expect(403);
    await t.http().post('/api/v1/site/domain').set(staff).send({ domain: 'www.example.com' }).expect(403);
    await t.http().put('/api/v1/widgets').set(staff).send({ chatButtonLabel: 'x' }).expect(403);
    // Reading stays open to the whole team.
    await t.http().get('/api/v1/review-requests').set(staff).expect(200);
    await t.http().get('/api/v1/site').set(staff).expect(200);
    const s = await t.prisma.reviewRequestSettings.findFirstOrThrow({ where: { tenantId: reg.tenant.id } });
    expect(s.template).not.toContain('evil.example');
  });
});

describe('security review: public booking', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  const base = { yards: 15, days: 7, debris: 'household', address: '12 Peach Ave', zip: '30307', deliveryDate: '2030-06-10', name: 'Ann Lee', phone: '(404) 555-0321', consent: true };

  it('refuses non-US numbers (no SMS pumping to international premium numbers)', async () => {
    const reg = await registerTenant(t, 'Pump');
    const key = (await t.http().get('/api/v1/widgets').set(reg.auth)).body.publishableKey;
    const consentText = textConsentDisclosure(reg.tenant.name);
    await t.http().post(`/api/v1/public/${key}/booking`).send({ ...base, consentText, phone: '+44 7911 123456' }).expect(400);
    await t.http().post(`/api/v1/public/${key}/booking`).send({ ...base, consentText, phone: '+882 1234 5678 90' }).expect(400);
    expect(await t.prisma.order.count({ where: { tenantId: reg.tenant.id } })).toBe(0);
  });

  it('requires the disclosure the widget actually shows as consent evidence', async () => {
    const reg = await registerTenant(t, 'Evidence');
    const key = (await t.http().get('/api/v1/widgets').set(reg.auth)).body.publishableKey;
    await t.http().post(`/api/v1/public/${key}/booking`).send({ ...base, consentText: 'ok' }).expect(400);
    expect(await t.prisma.consent.count({ where: { tenantId: reg.tenant.id } })).toBe(0);
    await t.http().post(`/api/v1/public/${key}/booking`).send({ ...base, consentText: textConsentDisclosure(reg.tenant.name) }).expect(201);
  });

  it("doesn't relay attacker text (links) to the number through the customer-name field", async () => {
    const reg = await registerTenant(t, 'Relay');
    const key = (await t.http().get('/api/v1/widgets').set(reg.auth)).body.publishableKey;
    const res = await t
      .http()
      .post(`/api/v1/public/${key}/booking`)
      .send({ ...base, phone: '(404) 555-0323', name: 'https://evil.example/pay-now', consentText: textConsentDisclosure(reg.tenant.name) })
      .expect(201);
    expect(res.body.message).not.toContain('evil.example');
    const out = await t.prisma.message.findMany({ where: { tenantId: reg.tenant.id, direction: 'outbound' } });
    expect(out.length).toBeGreaterThan(0);
    expect(out.some((m) => m.body.includes('evil.example'))).toBe(false);
  });
});

describe('security review: pricing guardrail', () => {
  let t: TestApp;
  const llm = new WordyPriceLlm();
  beforeAll(async () => {
    t = await createTestApp((b) => b.overrideProvider(LLM_PROVIDER).useValue(llm));
  });
  afterAll(() => t.close());

  it.each(['Sure, a 20-yard is 500 dollars delivered.', 'Sure, a 20-yard is USD 500 delivered.', 'Sure, a 20-yard is ＄500 delivered.', 'Sure, a 20-yard is five hundred dollars delivered.'])(
    'blocks an unbacked amount written without "$": %s',
    async (reply) => {
      llm.reply = reply;
      const reg = await registerTenant(t, 'Wordy');
      const r = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from: '(404) 555-0331', body: 'how much is a 20 yard?' }).expect(200);
      const outbound = await t.prisma.message.findMany({ where: { conversationId: r.body.conversationId, direction: 'outbound' } });
      expect(outbound.some((m) => /500|five hundred/i.test(m.body))).toBe(false);
      const d = await t.http().get(`/api/v1/conversations/${r.body.conversationId}`).set(reg.auth).expect(200);
      expect(d.body.state).toBe('needs_you');
    },
  );
});
