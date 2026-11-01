import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ClsModule } from 'nestjs-cls';
import { env } from '../config/env';
import { JobsService } from '../jobs/jobs.service';
import { OutboxService } from '../jobs/outbox.service';
import { PollersService } from '../jobs/pollers.service';
import { ScheduledActionsService } from '../jobs/scheduled-actions.service';
import { DbService } from '../prisma/db.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import { TenantContext } from './tenant-context';

/** Infrastructure shared by the API and the worker. */
@Global()
@Module({
  imports: [
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    JwtModule.register({ global: true, secret: env().JWT_SECRET, signOptions: { issuer: 'oraviq' }, verifyOptions: { issuer: 'oraviq' } }),
  ],
  providers: [TenantContext, PrismaService, DbService, JobsService, OutboxService, ScheduledActionsService, PollersService, RealtimeService],
  exports: [TenantContext, PrismaService, DbService, JobsService, OutboxService, ScheduledActionsService, PollersService, RealtimeService, JwtModule],
})
export class CoreModule {}
