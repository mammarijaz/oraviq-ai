-- CreateEnum
CREATE TYPE "Role" AS ENUM ('owner', 'admin', 'dispatcher', 'staff');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('sms', 'phone', 'web_chat', 'booking_form', 'facebook', 'instagram', 'whatsapp', 'email');

-- CreateEnum
CREATE TYPE "ConnectionKind" AS ENUM ('sms', 'phone', 'facebook', 'instagram', 'google', 'stripe');

-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('connected', 'not_connected', 'pending', 'error');

-- CreateEnum
CREATE TYPE "ConversationState" AS ENUM ('needs_you', 'assistant', 'confirmed', 'closed');

-- CreateEnum
CREATE TYPE "AiMode" AS ENUM ('auto', 'draft', 'off');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound', 'internal');

-- CreateEnum
CREATE TYPE "MessageAuthor" AS ENUM ('customer', 'assistant', 'owner', 'system');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('received', 'queued', 'sent', 'delivered', 'failed', 'draft');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('transactional', 'marketing');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('granted', 'revoked');

-- CreateEnum
CREATE TYPE "ConsentSource" AS ENUM ('inbound_message', 'widget_checkbox', 'booking_form', 'verbal_on_call', 'owner_entered');

-- CreateEnum
CREATE TYPE "DebrisType" AS ENUM ('household', 'construction', 'heavy');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('requested', 'confirmed', 'deposit_paid', 'scheduled', 'delivered', 'pickup_requested', 'picked_up', 'closed', 'cancelled');

-- CreateEnum
CREATE TYPE "Placement" AS ENUM ('driveway', 'street', 'other');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('quote_given', 'order_requested', 'sent_to_you', 'message_taken', 'no_action');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('in_progress', 'ended');

-- CreateEnum
CREATE TYPE "ReceptionistMode" AS ENUM ('missed', 'after_hours', 'all');

-- CreateEnum
CREATE TYPE "ReceptionistVoice" AS ENUM ('warm', 'clear', 'calm');

-- CreateEnum
CREATE TYPE "ReviewSource" AS ENUM ('google', 'facebook');

-- CreateEnum
CREATE TYPE "ReviewRequestStatus" AS ENUM ('ready', 'scheduled', 'sent', 'reviewed', 'skipped');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('not_started', 'pending', 'in_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "VoiceRoute" AS ENUM ('receptionist', 'forward', 'voicemail');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('none', 'pending', 'active', 'error');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('pending', 'processing', 'done', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('received', 'processing', 'processed', 'failed', 'ignored');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT,
    "state" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "businessHours" JSONB NOT NULL,
    "publishableKey" TEXT NOT NULL,
    "oraviqNumber" TEXT,
    "alertPhone" TEXT,
    "depositCents" INTEGER NOT NULL DEFAULT 10000,
    "orderSeq" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'staff',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "company" TEXT,
    "notes" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contact_identities" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "addressNormalized" TEXT NOT NULL,
    "displayAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "purpose" "ConsentPurpose" NOT NULL,
    "status" "ConsentStatus" NOT NULL,
    "source" "ConsentSource" NOT NULL,
    "evidence" JSONB NOT NULL,
    "textVersion" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "ConnectionKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "externalAccountId" TEXT,
    "externalName" TEXT,
    "status" "ConnectionStatus" NOT NULL DEFAULT 'not_connected',
    "credentialsRef" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_numbers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "e164" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerNumberId" TEXT,
    "forwardingFrom" TEXT,
    "registrationStatus" "RegistrationStatus" NOT NULL DEFAULT 'not_started',
    "voiceRoute" "VoiceRoute" NOT NULL DEFAULT 'receptionist',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "phone_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "state" "ConversationState" NOT NULL DEFAULT 'assistant',
    "tag" TEXT,
    "aiMode" "AiMode" NOT NULL DEFAULT 'auto',
    "facts" JSONB NOT NULL DEFAULT '{}',
    "aiState" JSONB NOT NULL DEFAULT '{}',
    "handoffReason" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastMessagePreview" TEXT NOT NULL DEFAULT '',
    "unread" BOOLEAN NOT NULL DEFAULT true,
    "assignedUserId" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'inbound_message',
    "externalThreadId" TEXT,
    "simulated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "author" "MessageAuthor" NOT NULL,
    "channel" "Channel" NOT NULL,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "provider" TEXT,
    "providerMessageId" TEXT,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
    "aiTraceId" TEXT,
    "idempotencyKey" TEXT,
    "quoteId" TEXT,
    "meta" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calls" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT,
    "contactId" TEXT,
    "provider" TEXT NOT NULL,
    "providerCallId" TEXT,
    "agentId" TEXT,
    "callerNumber" TEXT NOT NULL,
    "callerName" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "afterHours" BOOLEAN NOT NULL DEFAULT false,
    "status" "CallStatus" NOT NULL DEFAULT 'in_progress',
    "outcome" "CallOutcome" NOT NULL DEFAULT 'no_action',
    "summary" TEXT,
    "transcript" JSONB NOT NULL DEFAULT '[]',
    "transferredTo" TEXT,
    "recordingKey" TEXT,
    "disclosureVersion" TEXT,
    "analysis" JSONB,
    "aiState" JSONB NOT NULL DEFAULT '{}',
    "isTest" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_tables" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "rules" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT,
    "contactId" TEXT,
    "inputs" JSONB NOT NULL,
    "quote" JSONB NOT NULL,
    "lineItems" JSONB NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "priceTableVersion" INTEGER NOT NULL,
    "yards" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "zip" TEXT NOT NULL,
    "debris" "DebrisType" NOT NULL,
    "sentence" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'requested',
    "contactId" TEXT NOT NULL,
    "conversationId" TEXT,
    "quoteId" TEXT,
    "channel" "Channel" NOT NULL,
    "address" TEXT NOT NULL,
    "zip" TEXT,
    "placement" "Placement" NOT NULL DEFAULT 'driveway',
    "permitCheck" BOOLEAN NOT NULL DEFAULT false,
    "deliveryDate" TEXT,
    "deliveryDateLabel" TEXT NOT NULL DEFAULT '',
    "deliveryWindow" TEXT,
    "depositRequested" BOOLEAN NOT NULL DEFAULT false,
    "depositPaid" BOOLEAN NOT NULL DEFAULT false,
    "depositUrl" TEXT,
    "depositCents" INTEGER,
    "paymentProvider" TEXT,
    "paymentSessionId" TEXT,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'owner',
    "createdByAi" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus",
    "data" JSONB,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receptionist_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "mode" "ReceptionistMode" NOT NULL DEFAULT 'missed',
    "greeting" TEXT NOT NULL,
    "voice" "ReceptionistVoice" NOT NULL DEFAULT 'warm',
    "transferWhenAsked" BOOLEAN NOT NULL DEFAULT true,
    "transferWhenOutsideRules" BOOLEAN NOT NULL DEFAULT true,
    "transferNumber" TEXT,
    "spanish" BOOLEAN NOT NULL DEFAULT false,
    "voiceProvider" TEXT NOT NULL DEFAULT 'mock',
    "agentId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receptionist_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_request_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "delayMinutes" INTEGER NOT NULL DEFAULT 120,
    "template" TEXT NOT NULL,
    "reviewLink" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_request_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "customDomain" TEXT,
    "customDomainStatus" "DomainStatus" NOT NULL DEFAULT 'none',
    "customHostnameId" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "headline" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL DEFAULT '#1F6B4F',
    "sections" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "widget_settings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chatGreeting" TEXT NOT NULL,
    "chatButtonLabel" TEXT NOT NULL DEFAULT 'Get a price',
    "chatPosition" TEXT NOT NULL DEFAULT 'right',
    "accentColor" TEXT NOT NULL DEFAULT '#1F6B4F',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "widget_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" "ReviewSource" NOT NULL,
    "externalId" TEXT,
    "author" TEXT NOT NULL,
    "rating" INTEGER,
    "recommends" BOOLEAN,
    "text" TEXT NOT NULL,
    "customerPhone" TEXT,
    "contactId" TEXT,
    "reply" TEXT,
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_reply_drafts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "aiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "aiTraceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_reply_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_source_stats" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" "ReviewSource" NOT NULL,
    "rating" DOUBLE PRECISION,
    "recommendPct" INTEGER,
    "count" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_source_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "ReviewRequestStatus" NOT NULL,
    "sendAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tenantId" TEXT,
    "payload" JSONB NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'received',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_actions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "dedupeKey" TEXT,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "delivery" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "keys" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_publishableKey_key" ON "tenants"("publishableKey");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "memberships_userId_idx" ON "memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_tenantId_userId_key" ON "memberships"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_tenantId_userId_idx" ON "refresh_tokens"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "contacts_tenantId_createdAt_idx" ON "contacts"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "contact_identities_tenantId_contactId_idx" ON "contact_identities"("tenantId", "contactId");

-- CreateIndex
CREATE INDEX "contact_identities_tenantId_addressNormalized_idx" ON "contact_identities"("tenantId", "addressNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "contact_identities_tenantId_channel_addressNormalized_key" ON "contact_identities"("tenantId", "channel", "addressNormalized");

-- CreateIndex
CREATE INDEX "consents_tenantId_contactId_channel_capturedAt_idx" ON "consents"("tenantId", "contactId", "channel", "capturedAt");

-- CreateIndex
CREATE INDEX "channel_accounts_provider_externalAccountId_idx" ON "channel_accounts"("provider", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "channel_accounts_tenantId_kind_key" ON "channel_accounts"("tenantId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "phone_numbers_e164_key" ON "phone_numbers"("e164");

-- CreateIndex
CREATE INDEX "phone_numbers_tenantId_idx" ON "phone_numbers"("tenantId");

-- CreateIndex
CREATE INDEX "phone_numbers_provider_providerNumberId_idx" ON "phone_numbers"("provider", "providerNumberId");

-- CreateIndex
CREATE INDEX "conversations_tenantId_lastMessageAt_idx" ON "conversations"("tenantId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "conversations_tenantId_state_lastMessageAt_idx" ON "conversations"("tenantId", "state", "lastMessageAt");

-- CreateIndex
CREATE INDEX "conversations_tenantId_channel_lastMessageAt_idx" ON "conversations"("tenantId", "channel", "lastMessageAt");

-- CreateIndex
CREATE INDEX "conversations_tenantId_contactId_idx" ON "conversations"("tenantId", "contactId");

-- CreateIndex
CREATE INDEX "conversations_tenantId_externalThreadId_idx" ON "conversations"("tenantId", "externalThreadId");

-- CreateIndex
CREATE INDEX "messages_tenantId_conversationId_createdAt_idx" ON "messages"("tenantId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_tenantId_createdAt_idx" ON "messages"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "messages_provider_providerMessageId_key" ON "messages"("provider", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "messages_tenantId_idempotencyKey_key" ON "messages"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "calls_tenantId_startedAt_idx" ON "calls"("tenantId", "startedAt");

-- CreateIndex
CREATE INDEX "calls_tenantId_outcome_startedAt_idx" ON "calls"("tenantId", "outcome", "startedAt");

-- CreateIndex
CREATE INDEX "calls_tenantId_conversationId_idx" ON "calls"("tenantId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "calls_provider_providerCallId_key" ON "calls"("provider", "providerCallId");

-- CreateIndex
CREATE UNIQUE INDEX "price_tables_tenantId_version_key" ON "price_tables"("tenantId", "version");

-- CreateIndex
CREATE INDEX "quotes_tenantId_conversationId_createdAt_idx" ON "quotes"("tenantId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "quotes_tenantId_createdAt_idx" ON "quotes"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_tenantId_status_createdAt_idx" ON "orders"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_tenantId_contactId_idx" ON "orders"("tenantId", "contactId");

-- CreateIndex
CREATE INDEX "orders_tenantId_conversationId_idx" ON "orders"("tenantId", "conversationId");

-- CreateIndex
CREATE INDEX "orders_paymentSessionId_idx" ON "orders"("paymentSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tenantId_number_key" ON "orders"("tenantId", "number");

-- CreateIndex
CREATE INDEX "order_events_tenantId_orderId_createdAt_idx" ON "order_events"("tenantId", "orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "receptionist_settings_tenantId_key" ON "receptionist_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "review_request_settings_tenantId_key" ON "review_request_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "site_settings_tenantId_key" ON "site_settings"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "site_settings_slug_key" ON "site_settings"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "site_settings_customDomain_key" ON "site_settings"("customDomain");

-- CreateIndex
CREATE UNIQUE INDEX "widget_settings_tenantId_key" ON "widget_settings"("tenantId");

-- CreateIndex
CREATE INDEX "reviews_tenantId_createdAt_idx" ON "reviews"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_tenantId_source_externalId_key" ON "reviews"("tenantId", "source", "externalId");

-- CreateIndex
CREATE INDEX "review_reply_drafts_tenantId_reviewId_createdAt_idx" ON "review_reply_drafts"("tenantId", "reviewId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "review_source_stats_tenantId_source_key" ON "review_source_stats"("tenantId", "source");

-- CreateIndex
CREATE INDEX "review_requests_tenantId_createdAt_idx" ON "review_requests"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "review_requests_tenantId_orderId_key" ON "review_requests"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "webhook_events_status_receivedAt_idx" ON "webhook_events"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_externalEventId_key" ON "webhook_events"("provider", "externalEventId");

-- CreateIndex
CREATE INDEX "outbox_status_availableAt_idx" ON "outbox"("status", "availableAt");

-- CreateIndex
CREATE INDEX "outbox_tenantId_createdAt_idx" ON "outbox"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "scheduled_actions_status_runAt_idx" ON "scheduled_actions"("status", "runAt");

-- CreateIndex
CREATE INDEX "scheduled_actions_tenantId_kind_idx" ON "scheduled_actions"("tenantId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_actions_tenantId_dedupeKey_key" ON "scheduled_actions"("tenantId", "dedupeKey");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_createdAt_idx" ON "audit_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_entityType_entityId_idx" ON "audit_logs"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "notifications_tenantId_createdAt_idx" ON "notifications"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_tenantId_userId_idx" ON "push_subscriptions"("tenantId", "userId");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contact_identities" ADD CONSTRAINT "contact_identities_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calls" ADD CONSTRAINT "calls_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reply_drafts" ADD CONSTRAINT "review_reply_drafts_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
