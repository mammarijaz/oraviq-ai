import { SAMPLE_PRICE_TABLE } from '@oraviq/pricing';
import { TenantContext } from '../src/core/tenant-context';
import { DbService } from '../src/prisma/db.service';
import { TenantScopeError } from '../src/prisma/tenant-prisma';
import { createTestApp, registerTenant, type TestApp } from './helpers';

describe('auth', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it('registers a tenant with sample prices, default settings and an Oraviq number', async () => {
    const reg = await registerTenant(t, 'Auth');
    expect(reg.accessToken).toBeTruthy();
    expect(reg.refreshToken).toMatch(/^rt_/);
    expect(reg.user.role).toBe('owner');
    expect(reg.tenant.oraviqNumber).toMatch(/^\+1\d{10}$/);

    const pricing = await t.http().get('/api/v1/pricing').set(reg.auth).expect(200);
    expect(pricing.body.version).toBe(1);
    expect(pricing.body.sizes).toEqual(SAMPLE_PRICE_TABLE.sizes);

    const rcp = await t.http().get('/api/v1/receptionist').set(reg.auth).expect(200);
    expect(rcp.body.greeting).toMatch(/automated assistant/);
    expect(rcp.body.greeting).toMatch(/recorded/);
    await t.http().get('/api/v1/site').set(reg.auth).expect(200);
    const widgets = await t.http().get('/api/v1/widgets').set(reg.auth).expect(200);
    expect(widgets.body.publishableKey).toMatch(/^pk_/);
    const setup = await t.http().get('/api/v1/setup').set(reg.auth).expect(200);
    expect(setup.body.find((s: any) => s.key === 'pricing').status).toBe('done');
    const conns = await t.http().get('/api/v1/connections').set(reg.auth).expect(200);
    expect(conns.body.find((c: any) => c.channel === 'sms').status).toBe('connected');
  });

  it('logs in, refreshes (rotating) and returns me', async () => {
    const reg = await registerTenant(t, 'Login');
    const login = await t.http().post('/api/v1/auth/login').send({ email: reg.user.email, password: 'secret123' }).expect(200);
    expect(login.body.tenant.id).toBe(reg.tenant.id);
    await t.http().post('/api/v1/auth/login').send({ email: reg.user.email, password: 'wrong-password' }).expect(401);

    const refreshed = await t.http().post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);
    // The old refresh token was rotated out.
    await t.http().post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(401);

    const me = await t.http().get('/api/v1/auth/me').set({ Authorization: `Bearer ${refreshed.body.accessToken}` }).expect(200);
    expect(me.body.user.email).toBe(reg.user.email);
    expect(me.body.tenant.id).toBe(reg.tenant.id);
  });

  it('rejects missing and bad tokens with the error envelope', async () => {
    const res = await t.http().get('/api/v1/conversations').expect(401);
    expect(res.body).toMatchObject({ statusCode: 401, error: 'Unauthorized' });
    expect(typeof res.body.message).toBe('string');
    await t.http().get('/api/v1/conversations').set({ Authorization: 'Bearer nope' }).expect(401);
  });

  it('refuses a duplicate email', async () => {
    const reg = await registerTenant(t, 'Dup');
    await t.http().post('/api/v1/auth/register').send({ businessName: 'Other Co', ownerName: 'X', email: reg.user.email, password: 'secret123' }).expect(409);
  });
});

describe('tenant isolation', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  it("returns 404 for another tenant's conversation and order, and never lists them", async () => {
    const a = await registerTenant(t, 'TenantA');
    const b = await registerTenant(t, 'TenantB');
    const sim = await t.http().post('/api/v1/simulator/inbound').set(a.auth).send({ channel: 'sms', from: '(404) 555-0170', body: 'need a 20 yard in 30319 for 10 days, kitchen remodel' }).expect(200);
    await t.http().post('/api/v1/simulator/inbound').set(a.auth).send({ channel: 'sms', from: '(404) 555-0170', body: '2215 Briarwood Rd, Thursday' }).expect(200);
    const convId = sim.body.conversationId;
    const orders = await t.http().get('/api/v1/orders').set(a.auth).expect(200);
    expect(orders.body.items).toHaveLength(1);
    const orderId = orders.body.items[0].id;

    await t.http().get(`/api/v1/conversations/${convId}`).set(a.auth).expect(200);
    await t.http().get(`/api/v1/conversations/${convId}`).set(b.auth).expect(404);
    await t.http().patch(`/api/v1/conversations/${convId}`).set(b.auth).send({ aiMode: 'off' }).expect(404);
    await t.http().post(`/api/v1/conversations/${convId}/messages`).set(b.auth).send({ body: 'hi' }).expect(404);
    await t.http().get(`/api/v1/orders/${orderId}`).set(b.auth).expect(404);
    await t.http().post(`/api/v1/orders/${orderId}/confirm`).set(b.auth).expect(404);
    await t.http().post(`/api/v1/orders/${orderId}/status`).set(b.auth).send({ status: 'cancelled' }).expect(404);

    const listB = await t.http().get('/api/v1/conversations').set(b.auth).expect(200);
    expect(listB.body.items.map((c: any) => c.id)).not.toContain(convId);
    const ordersB = await t.http().get('/api/v1/orders').set(b.auth).expect(200);
    expect(ordersB.body.items).toHaveLength(0);
    const contactsB = await t.http().get('/api/v1/contacts?q=0170').set(b.auth).expect(200);
    expect(contactsB.body.items).toHaveLength(0);
  });

  it('the Prisma extension scopes every query and fails closed without a tenant', async () => {
    const a = await registerTenant(t, 'ScopeA');
    const b = await registerTenant(t, 'ScopeB');
    const dbs = t.app.get(DbService);
    const ctx = t.app.get(TenantContext);
    const aTable = await ctx.run(a.tenant.id, () => dbs.db.priceTable.findFirst());
    expect(aTable?.tenantId).toBe(a.tenant.id);
    // As tenant B, A's row is invisible even by primary key, and can't be updated.
    const seen = await ctx.run(b.tenant.id, () => dbs.db.priceTable.findUnique({ where: { id: aTable!.id } }));
    expect(seen).toBeNull();
    const updated = await ctx.run(b.tenant.id, () => dbs.db.priceTable.updateMany({ where: { id: aTable!.id }, data: { version: 99 } }));
    expect(updated.count).toBe(0);
    // Creating a row for another tenant is refused.
    await expect(ctx.run(b.tenant.id, () => dbs.db.contact.create({ data: { tenantId: a.tenant.id, name: 'Sneaky' } }))).rejects.toThrow(TenantScopeError);
    // No tenant in context: fail closed.
    await expect(dbs.db.contact.findMany()).rejects.toThrow(TenantScopeError);
  });
});
