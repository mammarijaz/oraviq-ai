import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AuthGuard } from './common/auth.guard';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { env } from './config/env';
import { CoreModule } from './core/core.module';
import { HealthController } from './health.controller';
import { IntegrationsModule } from './integrations/integrations.module';
import { AuthController } from './modules/auth/auth.controller';
import { DevController } from './modules/dev/dev.controller';
import { DomainModule } from './modules/domain.module';
import { InboxController } from './modules/inbox/inbox.controller';
import { NotificationsController } from './modules/notifications/notifications.controller';
import { OrdersController } from './modules/orders/orders.controller';
import { PricingController } from './modules/pricing/pricing.controller';
import { PublicController } from './modules/public/public.controller';
import { ReportsController } from './modules/reports/reports.controller';
import { ReviewsController } from './modules/reviews/reviews.controller';
import { SiteController } from './modules/site/site.controller';
import { TenantController } from './modules/tenant/tenant.controller';
import { ReceptionistController } from './modules/voice/receptionist.controller';
import { WebhooksController } from './modules/webhooks/webhooks.controller';
import { InboxGateway } from './realtime/inbox.gateway';

export const loggerModule = () =>
  LoggerModule.forRoot({
    pinoHttp: {
      level: env().LOG_LEVEL ?? (env().isTest ? 'silent' : 'info'),
      transport: env().isProduction || env().isTest ? undefined : { target: 'pino-pretty', options: { singleLine: true, ignore: 'pid,hostname,req,res' } },
      autoLogging: { ignore: (req) => (req.url ?? '').startsWith('/api/v1/health') },
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
  });

@Module({
  imports: [
    loggerModule(),
    ThrottlerModule.forRoot({ throttlers: [{ name: 'default', ttl: 60000, limit: 120 }], skipIf: () => env().isTest }),
    CoreModule,
    IntegrationsModule,
    DomainModule,
  ],
  controllers: [
    HealthController,
    AuthController,
    TenantController,
    InboxController,
    OrdersController,
    PricingController,
    ReceptionistController,
    ReviewsController,
    SiteController,
    ReportsController,
    PublicController,
    WebhooksController,
    NotificationsController,
    DevController,
  ],
  providers: [
    InboxGateway,
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
