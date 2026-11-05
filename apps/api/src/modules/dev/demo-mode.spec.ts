import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { env, resetEnvCache } from '../../config/env';
import { WebhooksService } from '../webhooks/webhooks.service';
import { DevController } from './dev.controller';

/** DEMO_MODE (render.preview.yaml): demo tools on in production, but only ever against mock adapters. */
describe('DEMO_MODE', () => {
  const saved = { ...process.env };
  const production = (extra: Record<string, string> = {}) => {
    Object.assign(process.env, {
      NODE_ENV: 'production',
      JWT_SECRET: 'a'.repeat(40),
      JWT_REFRESH_SECRET: 'b'.repeat(40),
      DEMO_MODE: '',
      STRIPE_SECRET_KEY: '',
      ZERNIO_API_KEY: '',
      ...extra,
    });
    resetEnvCache();
  };
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
    resetEnvCache();
  });

  const scheduled = { runDue: jest.fn().mockResolvedValue(0) };
  const outbox = { flush: jest.fn().mockResolvedValue(0) };
  const webhooks = { receiveMock: jest.fn().mockResolvedValue({ duplicate: false }) };
  const dbs = { system: { order: { findFirst: jest.fn().mockResolvedValue({ id: 'o1', tenantId: 't1', depositCents: 10000 }) } } };
  const dev = () => new DevController(webhooks as never, scheduled as never, outbox as never, dbs as never);

  it('is off in production by default', async () => {
    production();
    expect(env().demoTools).toBe(false);
    await expect(dev().runJobs({})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(dev().pay('cs_mock_1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('turns the demo tools on in production with DEMO_MODE', async () => {
    production({ DEMO_MODE: 'true' });
    expect(env().demoTools).toBe(true);
    await expect(dev().runJobs({})).resolves.toEqual({ scheduled: 0, outbox: 0 });
    await expect(dev().pay('cs_mock_1')).resolves.toEqual({ ok: true, duplicate: false });
  });

  it('never fakes a payment when real Stripe is configured, DEMO_MODE or not', async () => {
    production({ DEMO_MODE: 'true', STRIPE_SECRET_KEY: 'sk_test_x' });
    await expect(dev().pay('cs_live_1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('replays mock webhooks in production only for a provider on its mock adapter', async () => {
    const store = jest.fn().mockResolvedValue({ id: 'w1', duplicate: false });
    const self = { store, payments: { parseWebhook: () => ({ id: 'evt_1', rawType: 'checkout.session.completed' }) } };
    const receive = (provider: string) => WebhooksService.prototype.receiveMock.call(self as never, provider, { id: 'm1', type: 'x' });

    production();
    await expect(receive('zernio')).rejects.toBeInstanceOf(UnauthorizedException);

    production({ DEMO_MODE: 'true' });
    await expect(receive('zernio')).resolves.toEqual({ id: 'w1', duplicate: false });

    production({ DEMO_MODE: 'true', ZERNIO_API_KEY: 'zk_live' });
    await expect(receive('zernio')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
