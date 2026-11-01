import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { loggerModule } from './app.module';
import { env, loadDotenv } from './config/env';
import { CoreModule } from './core/core.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { JobsService } from './jobs/jobs.service';
import { PollersService } from './jobs/pollers.service';
import { DomainModule } from './modules/domain.module';

/** The worker: same modules as the API, no HTTP. Runs BullMQ processors, the outbox publisher and the scheduler. */
@Module({ imports: [loggerModule(), CoreModule, IntegrationsModule, DomainModule] })
class WorkerModule {}

async function bootstrap() {
  loadDotenv();
  if (env().inlineJobs) {
    console.warn('INLINE_JOBS=true: the API runs jobs itself. Set INLINE_JOBS=false for the API and the worker to use BullMQ.');
  }
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.get(JobsService).startWorkers();
  app.get(PollersService).start();
  console.log('Oraviq worker running (webhooks, outbox, scheduled actions).');
}

void bootstrap();
