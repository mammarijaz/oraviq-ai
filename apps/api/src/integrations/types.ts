/**
 * Provider-neutral adapter interfaces. Services depend on these, never on a
 * vendor SDK. Each interface has a mock (first-class, used when keys are unset)
 * and a real implementation selected by env vars in integrations.module.ts.
 */
import type { Channel, ConversationFacts, Placement, ReceptionistSettingsDto } from '@oraviq/shared';
import type { DebrisType, PriceTable, Quote, QuoteError, QuoteInput } from '@oraviq/pricing';

/* ------------------------------------------------------------------ DI tokens */

export const MESSAGING_ADAPTERS = Symbol('MESSAGING_ADAPTERS');
export const TELEPHONY_ADAPTER = Symbol('TELEPHONY_ADAPTER');
export const VOICE_AGENT_ADAPTER = Symbol('VOICE_AGENT_ADAPTER');
export const REVIEWS_ADAPTER = Symbol('REVIEWS_ADAPTER');
export const PAYMENTS_ADAPTER = Symbol('PAYMENTS_ADAPTER');
export const DOMAINS_ADAPTER = Symbol('DOMAINS_ADAPTER');
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
export const ACCOUNT_CONNECT_ADAPTER = Symbol('ACCOUNT_CONNECT_ADAPTER');

/* ------------------------------------------------------------------ messaging */

export type MessagingChannel = Extract<Channel, 'sms' | 'facebook' | 'instagram' | 'whatsapp' | 'web_chat'>;

export interface OutboundMessage {
  tenantId: string;
  channel: MessagingChannel;
  /** Tenant's sending number (E.164) for SMS; page/account id for social. */
  from: string | null;
  /** Recipient: E.164 for SMS, PSID/IGSID for social, session id for web chat. */
  to: string;
  body: string;
  /** Sent as Idempotency-Key so provider retries never double-send. */
  idempotencyKey: string;
  /** Provider conversation/thread id when known (replies in-thread). */
  externalThreadId?: string | null;
  /** Provider account id (ChannelAccount.externalAccountId). */
  accountId?: string | null;
}

export interface SendResult {
  provider: string;
  providerMessageId: string;
  status: 'sent' | 'queued';
  externalThreadId?: string | null;
}

export interface MessagingAdapter {
  readonly provider: string;
  supports(channel: MessagingChannel): boolean;
  send(msg: OutboundMessage): Promise<SendResult>;
}

/** Normalised inbound message, produced by webhook parsers and the simulator. */
export interface InboundMessageEvent {
  provider: string;
  channel: Channel;
  /** Sender address (E.164 or provider user id). */
  from: string;
  fromName?: string | null;
  /** Number/account the message was sent to (resolves the tenant). */
  to?: string | null;
  accountId?: string | null;
  body: string;
  providerMessageId?: string | null;
  externalThreadId?: string | null;
  receivedAt?: Date;
  simulated?: boolean;
}

/* ------------------------------------------------------------------ telephony */

export interface ProvisionedNumber {
  e164: string;
  provider: string;
  providerNumberId: string;
}

export interface TelephonyAdapter {
  readonly provider: string;
  provisionNumber(opts: { tenantId: string; areaCode?: string | null }): Promise<ProvisionedNumber>;
  placeTestCall(opts: { from: string; to: string }): Promise<{ ok: boolean; message: string }>;
  /** A2P 10DLC registration for business texting. */
  startTextingRegistration(opts: { tenantId: string; businessName: string; e164: string }): Promise<{ status: 'pending' | 'in_review' | 'approved' }>;
}

/* ------------------------------------------------------------------ voice agent */

export interface VoiceAgentSync {
  tenantId: string;
  businessName: string;
  settings: ReceptionistSettingsDto;
  /** Public URL prefix for custom functions, e.g. https://api…/api/v1/voice/tools */
  toolsBaseUrl: string;
  webhookUrl: string;
  numberE164: string | null;
}

export interface VoiceAgentAdapter {
  readonly provider: 'retell' | 'mock';
  syncAgent(input: VoiceAgentSync): Promise<{ agentId: string }>;
  /** Verifies x-retell-signature (or the mock equivalent) on webhooks and custom functions. */
  verifySignature(rawBody: string, signature: string | undefined): boolean;
}

/* ------------------------------------------------------------------ reviews */

export interface ReviewSummary {
  google: { rating: number | null; count: number } | null;
  facebook: { recommendPct: number | null; count: number } | null;
}

export interface ReviewsAdapter {
  readonly provider: string;
  reply(input: { tenantId: string; source: 'google' | 'facebook'; externalId: string | null; text: string; accountId?: string | null }): Promise<{ ok: true }>;
  fetchSummary(input: { tenantId: string; accountId?: string | null }): Promise<ReviewSummary | null>;
}

/* ------------------------------------------------------------------ account connections (Meta, Google) */

export interface AccountConnectAdapter {
  readonly provider: string;
  /** Hosted OAuth URL for connecting a Facebook Page, Instagram account or Google Business Profile; null = mock connects instantly. */
  connectUrl(input: { tenantId: string; kind: 'facebook' | 'instagram' | 'google'; redirectUrl: string; profileId?: string | null }): Promise<string | null>;
}

/* ------------------------------------------------------------------ payments */

export interface DepositLinkInput {
  tenantId: string;
  orderId: string;
  orderNumber: string;
  amountCents: number;
  description: string;
  customerPhone?: string | null;
  /** Connected account (acct_…) for direct charges. */
  connectedAccountId: string | null;
  successUrl: string;
  cancelUrl: string;
}

export interface PaymentEvent {
  id: string;
  type: 'deposit.paid' | 'other';
  rawType: string;
  account: string | null;
  orderId: string | null;
  tenantId: string | null;
  sessionId: string | null;
  amountCents: number | null;
  payload: unknown;
}

export interface PaymentsAdapter {
  readonly provider: 'stripe' | 'mock';
  /** Mock: always connectable. Stripe: needs a connected account. */
  isConnected(connectedAccountId: string | null): boolean;
  createDepositLink(input: DepositLinkInput): Promise<{ url: string; sessionId: string }>;
  /** OAuth URL (Stripe Connect Standard) or null when the mock connects instantly. */
  connectUrl(input: { tenantId: string; state: string; redirectUri: string }): string | null;
  /** Verifies and parses a webhook. Throws on bad signature. */
  parseWebhook(rawBody: Buffer | string, signature: string | undefined): PaymentEvent;
  /** Stripe Connect OAuth: exchanges the code for the connected account id (acct_…). */
  completeConnect?(code: string): Promise<string>;
}

/* ------------------------------------------------------------------ domains */

export interface DomainsAdapter {
  readonly provider: 'cloudflare' | 'mock';
  createCustomHostname(hostname: string): Promise<{ id: string; status: 'pending' | 'active' | 'error'; dnsTarget: string }>;
  getCustomHostname(id: string): Promise<{ status: 'pending' | 'active' | 'error' }>;
  purgeCache(hosts: string[]): Promise<void>;
}

/* ------------------------------------------------------------------ LLM */

/** Assistant stage, intro flag and counters. Lives in Conversation.aiState / Call.aiState. */
export interface AiState {
  stage?: 'collect' | 'booking' | 'booked';
  introduced?: boolean;
  lastText?: string;
  quoteId?: string | null;
  quoteTotalCents?: number | null;
  quoteYards?: number | null;
  quoteDays?: number | null;
  misses?: number;
  handoff?: string | null;
  orderNumber?: string | null;
}

export interface CustomerContext {
  name: string | null;
  firstName: string | null;
  isRepeat: boolean;
  lastOrder: {
    yards: number | null;
    days: number | null;
    zip: string | null;
    debris: DebrisType | null;
    address: string;
    placement: Placement;
  } | null;
}

export type QuoteToolResult =
  | { ok: true; quoteId: string; quote: Quote; sentence: string }
  | { ok: false; error: QuoteError };

/** The tools the assistant may call. Implemented by the orchestrator; prices only come from get_quote. */
export interface AssistantTools {
  getQuote(input: QuoteInput): Promise<QuoteToolResult>;
  checkServiceArea(zip: string): Promise<{ served: boolean; zoneName: string | null }>;
  createOrderDraft(input: { address: string; date: string; placement: Placement | null; name: string | null }): Promise<{ orderNumber: string }>;
  handoffToHuman(reason: string): Promise<void>;
}

export interface AssistantTurnInput {
  businessName: string;
  businessPhone: string | null;
  channel: Channel;
  /** voice replies are shaped for speech by the voice brain. */
  mode: 'text' | 'voice';
  text: string;
  history: Array<{ author: 'customer' | 'assistant' | 'owner' | 'system'; body: string }>;
  facts: ConversationFacts;
  aiState: AiState;
  customer: CustomerContext;
  /** Read-only: sizes, zones and rules. The provider must still price through tools.getQuote. */
  priceTable: PriceTable;
}

export interface AssistantTurnOutput {
  reply: string;
  facts: ConversationFacts;
  aiState: AiState;
  traceId: string;
}

export interface ReviewDraftInput {
  businessName: string;
  source: 'google' | 'facebook';
  author: string;
  rating: number | null;
  recommends: boolean | null;
  text: string;
  /** Earlier drafts, oldest first, so a new draft differs. */
  previousDrafts: string[];
  currentDraft: string | null;
}

export interface LlmProvider {
  readonly name: 'mock' | 'anthropic' | string;
  runAssistantTurn(input: AssistantTurnInput, tools: AssistantTools): Promise<AssistantTurnOutput>;
  draftReviewReply(input: ReviewDraftInput): Promise<{ text: string; traceId: string }>;
}
