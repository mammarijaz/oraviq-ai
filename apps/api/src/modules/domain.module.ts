import { Module } from '@nestjs/common';
import { AssistantService } from './ai/assistant.service';
import { AuditService } from './audit/audit.service';
import { AuthService } from './auth/auth.service';
import { ContactsService } from './contacts/contacts.service';
import { InboundService } from './inbox/inbound.service';
import { InboxQueries } from './inbox/inbox.queries';
import { InboxService } from './inbox/inbox.service';
import { MessagingService } from './messaging/messaging.service';
import { NotificationsService } from './notifications/notifications.service';
import { OrdersService } from './orders/orders.service';
import { PricingService } from './pricing/pricing.service';
import { PublicService } from './public/public.service';
import { QuotesService } from './quotes/quotes.service';
import { ReportsService } from './reports/reports.service';
import { ReviewRequestsService } from './reviews/review-requests.service';
import { ReviewsService } from './reviews/reviews.service';
import { SimulatorService } from './simulator/simulator.service';
import { SiteService } from './site/site.service';
import { TenantService } from './tenant/tenant.service';
import { VoiceService } from './voice/voice.service';
import { WebhooksService } from './webhooks/webhooks.service';

const SERVICES = [
  AuditService,
  ContactsService,
  InboxQueries,
  MessagingService,
  NotificationsService,
  PricingService,
  QuotesService,
  ReviewRequestsService,
  OrdersService,
  AssistantService,
  InboundService,
  InboxService,
  VoiceService,
  ReviewsService,
  SiteService,
  TenantService,
  AuthService,
  ReportsService,
  PublicService,
  SimulatorService,
  WebhooksService,
];

/** All domain services. Imported by the API (with controllers) and by the worker (without). */
@Module({ providers: SERVICES, exports: SERVICES })
export class DomainModule {}
