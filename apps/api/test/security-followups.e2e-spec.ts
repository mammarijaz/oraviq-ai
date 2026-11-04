import { textConsentDisclosure } from '@oraviq/shared';
import { createTestApp, registerTenant, type TestApp } from './helpers';

const KITCHEN = 'need a 20 yard in 30319 for 10 days, kitchen remodel';

describe('security follow-ups', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  const booking = (name: string, phone: string) => ({
    yards: 20, days: 7, debris: 'household', address: '1 Main St', zip: '30319', deliveryDate: '2030-01-10',
    name, phone, consent: true, consentText: textConsentDisclosure(name),
  });

  async function stop(reg: Awaited<ReturnType<typeof registerTenant>>, from: string) {
    await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: KITCHEN }).expect(200);
    await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from, body: 'STOP' }).expect(200);
  }

  async function revoked(tenantId: string, digits: string) {
    const id = await t.prisma.contactIdentity.findFirst({ where: { tenantId, addressNormalized: { contains: digits } } });
    const c = await t.prisma.consent.findFirst({ where: { tenantId, contactId: id!.contactId, channel: 'sms' }, orderBy: { capturedAt: 'desc' } });
    return c?.status === 'revoked';
  }

  it('a simulated START does not undo a STOP', async () => {
    const reg = await registerTenant(t, 'StopSim');
    await stop(reg, '(404) 555-0411');
    await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from: '(404) 555-0411', body: 'START' }).expect(200);
    expect(await revoked(reg.tenant.id, '4045550411')).toBe(true);
  });

  it('the booking form does not undo a STOP and sends no text', async () => {
    const reg = await registerTenant(t, 'StopForm');
    await stop(reg, '(404) 555-0412');
    const key = (await t.prisma.tenant.findUniqueOrThrow({ where: { id: reg.tenant.id } })).publishableKey;
    const tenantName = reg.tenant.name;
    const body = { ...booking('Ann Lee', '(404) 555-0412'), consentText: textConsentDisclosure(tenantName) };
    await t.http().post(`/api/v1/public/${key}/booking`).send(body).expect(201);
    expect(await revoked(reg.tenant.id, '4045550412')).toBe(true);
    const order = await t.prisma.order.findFirstOrThrow({ where: { tenantId: reg.tenant.id, source: 'booking_form' } });
    const conv = await t.prisma.conversation.findUniqueOrThrow({ where: { id: order.conversationId! } });
    expect(conv.handoffReason).toMatch(/STOP/);
    const sent = await t.prisma.message.count({ where: { conversationId: conv.id, author: 'assistant' } });
    expect(sent).toBe(0);
  });

  it('booking refuses Caribbean premium-rate numbers', async () => {
    const reg = await registerTenant(t, 'Premium');
    const key = (await t.prisma.tenant.findUniqueOrThrow({ where: { id: reg.tenant.id } })).publishableKey;
    const body = { ...booking('Bo Day', '(876) 555-0199'), consentText: textConsentDisclosure(reg.tenant.name) };
    await t.http().post(`/api/v1/public/${key}/booking`).send(body).expect(400);
  });

  it('staff cannot mark a deposit paid by hand', async () => {
    const reg = await registerTenant(t, 'StaffPay');
    const r1 = await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from: '(404) 555-0413', body: KITCHEN }).expect(200);
    await t.http().post('/api/v1/simulator/inbound').set(reg.auth).send({ channel: 'sms', from: '(404) 555-0413', body: '2215 Briarwood Rd, Thursday' }).expect(200);
    const d = await t.http().get(`/api/v1/conversations/${r1.body.conversationId}`).set(reg.auth).expect(200);
    await t.http().post(`/api/v1/orders/${d.body.order.id}/confirm`).set(reg.auth).expect(200);
    await t.prisma.membership.updateMany({ where: { tenantId: reg.tenant.id }, data: { role: 'staff' } });
    const login = await t.http().post('/api/v1/auth/login').send({ email: reg.user.email, password: 'secret123' });
    const staff = { Authorization: `Bearer ${login.body.accessToken}` };
    await t.http().post(`/api/v1/orders/${d.body.order.id}/status`).set(staff).send({ status: 'deposit_paid' }).expect(403);
  });

  it('POST /setup/number is idempotent', async () => {
    const reg = await registerTenant(t, 'Number');
    const a = await t.http().post('/api/v1/setup/number').set(reg.auth).expect(200);
    const b = await t.http().post('/api/v1/setup/number').set(reg.auth).expect(200);
    expect(a.body.e164).toBe(b.body.e164);
    expect(await t.prisma.phoneNumber.count({ where: { tenantId: reg.tenant.id } })).toBe(1);
  });
});
