import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { env, loadDotenv } from './config/env';
import { PollersService } from './jobs/pollers.service';
import { serveApps } from './preview/serve-apps';

async function bootstrap() {
  loadDotenv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });
  app.set('trust proxy', 1);
  app.useBodyParser('json', { limit: '1mb' });
  // One-origin test deployment only (SERVE_WEB_DIR etc. set); a no-op otherwise.
  const served = serveApps(app);
  configureApp(app);
  // With INLINE_JOBS the API also runs the outbox publisher and the scheduled-actions poller.
  if (env().inlineJobs && env().pollers) app.get(PollersService).start();
  await app.listen(env().PORT);
  const url = `http://localhost:${env().PORT}`;
  console.log(`Oraviq API on ${url}/api/v1  ·  docs ${url}/api/docs  ·  inline jobs: ${env().inlineJobs}${env().DEMO_MODE ? '  ·  DEMO_MODE' : ''}`);
  if (served.length) console.log(`Also serving: ${served.join(', ')}`);
}

void bootstrap();
