/** Test environment: oraviq_test database, inline jobs, every adapter in mock mode. */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://oraviq:oraviq@localhost:5432/oraviq_test?schema=public';
process.env.INLINE_JOBS = 'true';
process.env.JOB_POLLERS = 'false';
process.env.JWT_SECRET = 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789';
process.env.ZERNIO_WEBHOOK_SECRET = 'test_zernio_secret';
process.env.PUBLIC_API_URL = 'http://localhost:3000';
for (const k of ['ANTHROPIC_API_KEY', 'ZERNIO_API_KEY', 'RETELL_API_KEY', 'RETELL_WEBHOOK_SECRET', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_CLIENT_ID', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ZONE_ID', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY']) {
  process.env[k] = '';
}
