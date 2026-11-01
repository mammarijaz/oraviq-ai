import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import type { AuthResponse } from '@oraviq/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { PrismaService } from '../src/prisma/prisma.service';

export interface TestApp {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  prisma: PrismaService;
  close: () => Promise<void>;
}

export async function createTestApp(override?: (b: TestingModuleBuilder) => TestingModuleBuilder): Promise<TestApp> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (override) builder = override(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ rawBody: true, logger: false });
  configureApp(app, { swagger: false, logger: false });
  await app.init();
  return {
    app,
    http: () => request(app.getHttpServer()),
    prisma: app.get(PrismaService),
    close: () => app.close(),
  };
}

let seq = 0;
export async function registerTenant(t: TestApp, label = 'Hauler'): Promise<AuthResponse & { auth: { Authorization: string } }> {
  seq++;
  const email = `owner${seq}.${Date.now()}@example.com`;
  const res = await t
    .http()
    .post('/api/v1/auth/register')
    .send({ businessName: `${label} ${seq} Roll-Off Co.`, ownerName: 'Pat Owner', email, password: 'secret123', phone: `(404) 555-01${String(10 + seq).padStart(2, '0')}`, city: 'Atlanta', state: 'GA' })
    .expect(201);
  return { ...res.body, auth: { Authorization: `Bearer ${res.body.accessToken}` } };
}
