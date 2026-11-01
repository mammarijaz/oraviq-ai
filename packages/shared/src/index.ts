/**
 * @oraviq/shared: the API contract between apps/api, apps/web, apps/widgets and apps/sites.
 *
 * Conventions
 *  - JSON over HTTPS. Dates are ISO-8601 strings. Money is integer cents.
 *  - Every authenticated response is scoped to the caller's tenant.
 *  - Successful responses are the bare object or { items, nextCursor } for lists.
 *  - Errors are { statusCode, error, message } with a human-readable message.
 */
import type { DebrisType, LineItem, PriceTable, Quote, QuoteError } from '@oraviq/pricing';

export type { DebrisType, LineItem, PriceTable, Quote, QuoteError } from '@oraviq/pricing';

/* ------------------------------------------------------------------ enums */

export const CHANNELS = ['sms', 'phone', 'web_chat', 'booking_form', 'facebook', 'instagram', 'whatsapp', 'email'] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  sms: 'Text message',
  phone: 'Phone call',
  web_chat: 'Website chat',
  booking_form: 'Booking form',
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  email: 'Email',
};

export const ROLES = ['owner', 'admin', 'dispatcher', 'staff'] as const;
export type Role = (typeof ROLES)[number];

/** Who a conversation is waiting on, as shown in the inbox. */
export const CONVERSATION_STATES = ['needs_you', 'assistant', 'confirmed', 'closed'] as const;
export type ConversationState = (typeof CONVERSATION_STATES)[number];

/** auto: assistant replies; draft: assistant drafts, owner sends; off: owner took over. */
export const AI_MODES = ['auto', 'draft', 'off'] as const;
export type AiMode = (typeof AI_MODES)[number];

export const MESSAGE_AUTHORS = ['customer', 'assistant', 'owner', 'system'] as const;
export type MessageAuthor = (typeof MESSAGE_AUTHORS)[number];

export const MESSAGE_STATUSES = ['received', 'queued', 'sent', 'delivered', 'failed', 'draft'] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

/** The order state machine. Transitions are enforced by the API. */
export const ORDER_STATUSES = [
  'requested',
  'confirmed',
  'deposit_paid',
  'scheduled',
  'delivered',
  'pickup_requested',
  'picked_up',
  'closed',
  'cancelled',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  requested: ['confirmed', 'cancelled'],
  confirmed: ['deposit_paid', 'scheduled', 'delivered', 'cancelled'],
  deposit_paid: ['scheduled', 'delivered', 'cancelled'],
  scheduled: ['delivered', 'cancelled'],
  delivered: ['pickup_requested', 'picked_up'],
  pickup_requested: ['picked_up'],
  picked_up: ['closed'],
  closed: [],
  cancelled: [],
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  requested: 'To confirm',
  confirmed: 'Confirmed',
  deposit_paid: 'Deposit paid',
  scheduled: 'Scheduled',
  delivered: 'Delivered',
  pickup_requested: 'Pickup requested',
  picked_up: 'Picked up',
  closed: 'Closed',
  cancelled: 'Cancelled',
};

export type Placement = 'driveway' | 'street' | 'other';

export const DELIVERY_WINDOWS = ['Morning, 7 to 11 a.m.', 'Midday, 11 a.m. to 2 p.m.', 'Afternoon, 2 to 5 p.m.'] as const;

export type ReceptionistMode = 'missed' | 'after_hours' | 'all';
export type ReceptionistVoice = 'warm' | 'clear' | 'calm';
export type CallOutcome = 'quote_given' | 'order_requested' | 'sent_to_you' | 'message_taken' | 'no_action';

export const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  quote_given: 'Quote given',
  order_requested: 'Order requested',
  sent_to_you: 'Sent to you',
  message_taken: 'Message taken',
  no_action: 'No action',
};

export type ReviewSource = 'google' | 'facebook';
export type ConsentPurpose = 'transactional' | 'marketing';
export type ConsentSource = 'inbound_message' | 'widget_checkbox' | 'booking_form' | 'verbal_on_call' | 'owner_entered';

export type SetupStepKey =
  | 'business'
  | 'pricing'
  | 'number'
  | 'forwarding'
  | 'receptionist'
  | 'texting_registration'
  | 'meta'
  | 'google'
  | 'website'
  | 'payments';
export type SetupStepStatus = 'done' | 'todo' | 'in_review' | 'blocked';

/* ------------------------------------------------------------------ auth */

export interface RegisterRequest {
  businessName: string;
  ownerName: string;
  email: string;
  password: string;
  phone?: string;
  city?: string;
  state?: string;
}
export interface LoginRequest {
  email: string;
  password: string;
}
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
export interface AuthResponse extends AuthTokens {
  user: UserDto;
  tenant: TenantDto;
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string | null;
}

export interface TenantDto {
  id: string;
  name: string;
  slug: string;
  phone?: string | null;
  city?: string | null;
  state?: string | null;
  timezone: string;
  /** The Oraviq number customers' calls are forwarded to. */
  oraviqNumber?: string | null;
  businessHours: BusinessHours;
}

export interface BusinessHours {
  /** 0 = Sunday … 6 = Saturday; null = closed. Times are "HH:MM" in the tenant's timezone. */
  days: Array<{ day: number; open: string; close: string } | null>;
}

/* ------------------------------------------------------------------ inbox */

export interface ContactDto {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company?: string | null;
  isRepeat: boolean;
  orderCount: number;
  firstSeenAt: string;
}

export interface ConversationSummaryDto {
  id: string;
  contact: ContactDto;
  channel: Channel;
  state: ConversationState;
  /** Short label for the state chip, e.g. "Order to confirm", "Quote sent". */
  tag: string | null;
  aiMode: AiMode;
  lastMessagePreview: string;
  lastMessageAt: string;
  unread: boolean;
  assignedUserId: string | null;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  author: MessageAuthor;
  channel: Channel;
  body: string;
  status: MessageStatus;
  createdAt: string;
  /** e.g. "SMS, 6:42 p.m." — rendered by the client from channel + createdAt if absent. */
  meta?: string | null;
  quoteId?: string | null;
}

/** Facts the assistant has gathered so far (shown in "What the assistant has understood"). */
export interface ConversationFacts {
  yards?: number | null;
  zip?: string | null;
  days?: number | null;
  debris?: DebrisType | null;
  items?: Record<string, number>;
  address?: string | null;
  date?: string | null;
  placement?: Placement | null;
  name?: string | null;
}

export interface ConversationDetailDto extends ConversationSummaryDto {
  messages: MessageDto[];
  facts: ConversationFacts;
  latestQuote: QuoteDto | null;
  order: OrderDto | null;
  /** Why the assistant handed off, when state = needs_you. */
  handoffReason: string | null;
  calls: CallSummaryDto[];
}

export interface SendMessageRequest {
  body: string;
}
export interface UpdateConversationRequest {
  aiMode?: AiMode;
  state?: ConversationState;
  assignedUserId?: string | null;
}

/* ------------------------------------------------------------------ quotes and orders */

export interface QuoteDto extends Quote {
  id: string;
  conversationId: string | null;
  createdAt: string;
  /** The code-rendered sentence sent to the customer. */
  sentence: string;
}

export interface QuoteRequest {
  yards: number;
  days?: number;
  zip: string;
  debris: DebrisType;
  items?: Record<string, number>;
}
export type QuoteResponse = { ok: true; quote: QuoteDto } | { ok: false; error: QuoteError };

export interface OrderDto {
  id: string;
  number: string;
  status: OrderStatus;
  contact: ContactDto;
  conversationId: string | null;
  channel: Channel;
  quote: QuoteDto | null;
  address: string;
  zip: string | null;
  placement: Placement;
  permitCheck: boolean;
  /** ISO date (YYYY-MM-DD) or a weekday phrase captured from the customer, e.g. "Thursday". */
  deliveryDate: string | null;
  deliveryDateLabel: string;
  deliveryWindow: string | null;
  depositRequested: boolean;
  depositPaid: boolean;
  depositUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrderRequest {
  conversationId?: string;
  contactId?: string;
  quoteId?: string;
  address: string;
  zip?: string;
  placement: Placement;
  deliveryDate?: string;
  deliveryWindow?: string;
  notes?: string;
}

export interface RescheduleOrderRequest {
  deliveryDate: string;
  deliveryWindow?: string;
  notifyCustomer: boolean;
}

export interface OrderListQuery {
  q?: string;
  status?: OrderStatus[];
  channel?: Channel[];
  sort?: 'total_asc' | 'total_desc' | 'created_desc';
}

/* ------------------------------------------------------------------ pricing */

export interface PriceTableDto extends PriceTable {
  updatedAt: string;
}
export type UpdatePriceTableRequest = Omit<PriceTable, 'version' | 'currency'>;
export interface PriceTableValidationError {
  statusCode: 400;
  error: 'Bad Request';
  message: string;
  problems: string[];
}

/* ------------------------------------------------------------------ receptionist and calls */

export interface ReceptionistSettingsDto {
  enabled: boolean;
  mode: ReceptionistMode;
  greeting: string;
  voice: ReceptionistVoice;
  transferWhenAsked: boolean;
  transferWhenOutsideRules: boolean;
  transferNumber: string | null;
  spanish: boolean;
  /** Provider ids, shown in settings for support. */
  voiceProvider: 'retell' | 'mock';
  agentId: string | null;
}

export interface CallSummaryDto {
  id: string;
  callerName: string | null;
  callerNumber: string;
  startedAt: string;
  durationSeconds: number;
  afterHours: boolean;
  outcome: CallOutcome;
  summary: string | null;
}

export interface CallDto extends CallSummaryDto {
  conversationId: string | null;
  transcript: Array<{ speaker: 'agent' | 'caller'; text: string }>;
  transferredTo: string | null;
  recordingAvailable: boolean;
}

export interface ReceptionistStatsDto {
  callsThisWeek: number;
  afterHours: number;
  ordersBooked: number;
  ordersValueCents: number;
  sentToYou: number;
}

/** In-app test call (the "Try a call" simulator) runs the same voice tools over HTTP. */
export interface TestCallTurnRequest {
  callId?: string;
  text: string;
  /** Hang up after this turn (the call summary is returned). Saying "bye" also ends the call. */
  end?: boolean;
}
export interface TestCallTurnResponse {
  callId: string;
  replies: string[];
  ended: boolean;
  transferredTo: string | null;
  summary: string | null;
}

/* ------------------------------------------------------------------ reviews */

export interface ReviewDto {
  id: string;
  source: ReviewSource;
  author: string;
  rating: number | null;
  recommends: boolean | null;
  text: string;
  createdAt: string;
  reply: string | null;
  repliedAt: string | null;
  draft: string | null;
  /** True for low ratings that should get a call before a public reply. */
  needsCall: boolean;
  customerPhone: string | null;
}

export interface ReviewStatsDto {
  googleRating: number | null;
  googleCount: number;
  facebookRecommendPct: number | null;
  facebookCount: number;
  newThisMonth: number;
  requestsThisMonth: number;
  waitingForReply: number;
}

export interface ReviewRequestSettingsDto {
  enabled: boolean;
  delayMinutes: number;
  template: string;
  reviewLink: string | null;
}

export interface ReviewRequestJobDto {
  orderId: string;
  customerName: string;
  jobLabel: string;
  status: 'ready' | 'scheduled' | 'sent' | 'reviewed' | 'skipped';
  sendAt: string | null;
}

/* ------------------------------------------------------------------ website and widgets */

export interface SiteSettingsDto {
  slug: string;
  freeAddress: string;
  customDomain: string | null;
  customDomainStatus: 'none' | 'pending' | 'active' | 'error';
  published: boolean;
  headline: string;
  intro: string;
  accentColor: string;
  sections: { prices: boolean; how: boolean; area: boolean; reviews: boolean; booking: boolean; chat: boolean };
}

export interface WidgetSettingsDto {
  publishableKey: string;
  chatGreeting: string;
  chatButtonLabel: string;
  chatPosition: 'left' | 'right';
  accentColor: string;
}

/** Public, unauthenticated, keyed by the tenant's publishable key (widgets and sites). */
export interface PublicBusinessDto {
  name: string;
  phone: string | null;
  city: string | null;
  state: string | null;
  accentColor: string;
  sizes: Array<{ yards: number; baseCents: number; includedTons: number; heavyAllowed: boolean; heavyFlatCents: number | null; hint: string | null }>;
  includedDays: number;
  extraDayCents: number;
  overagePerTonCents: number;
  zones: Array<{ name: string; feeCents: number; zipsPreview: string[]; zipCount: number }>;
  chat: { greeting: string; buttonLabel: string; position: 'left' | 'right' };
  site?: Pick<SiteSettingsDto, 'headline' | 'intro' | 'sections'>;
  reviews?: Array<{ author: string; rating: number; text: string }>;
  googleRating?: number | null;
  googleCount?: number;
}

export interface PublicChatStartResponse {
  sessionId: string;
  messages: Array<{ author: 'assistant' | 'customer'; body: string; createdAt: string }>;
}
export interface PublicChatMessageRequest {
  sessionId: string;
  body: string;
}
export interface PublicBookingRequest {
  yards: number;
  days: number;
  debris: DebrisType;
  address: string;
  zip: string;
  deliveryDate: string;
  name: string;
  phone: string;
  consent: boolean;
  /** The exact disclosure text the customer saw, stored with the consent record. */
  consentText: string;
  pageUrl?: string;
}
export interface PublicBookingResponse {
  orderNumber: string;
  quote: Quote | null;
  message: string;
}

/* ------------------------------------------------------------------ reports and setup */

export interface WeeklyReportDto {
  from: string;
  to: string;
  leadsAfterHoursOrMissed: number;
  newInquiries: number;
  quotesSent: number;
  medianReplySeconds: number | null;
  ordersBooked: number;
  ordersByAssistant: number;
  bookedValueCents: number;
  byDay: Array<{ day: string; inquiries: number; orders: number }>;
  byChannel: Array<{ channel: Channel; count: number }>;
  receptionistAnswered: number;
}

export interface SetupStepDto {
  key: SetupStepKey;
  title: string;
  description: string;
  status: SetupStepStatus;
  actionLabel?: string;
  actionHref?: string;
}

export interface ChannelConnectionDto {
  channel: 'sms' | 'phone' | 'facebook' | 'instagram' | 'google' | 'stripe';
  provider: string;
  status: 'connected' | 'not_connected' | 'pending' | 'error';
  externalName: string | null;
}

/* ------------------------------------------------------------------ simulator and notifications */

/** POST /simulator/inbound ("Try it out"). */
export interface SimulatorInboundRequest {
  channel: 'sms' | 'facebook' | 'instagram' | 'web_chat';
  /** Phone number (sms) or a stable visitor id; defaults to (404) 555-0199 / a per-tenant visitor. */
  from?: string;
  name?: string;
  body: string;
  /** Close the previous simulated conversation for this sender and start fresh ("Start over"). */
  newConversation?: boolean;
}
export interface SimulatorInboundResponse {
  conversationId: string;
  replies: MessageDto[];
}

/** GET /notifications: owner alerts (also texted to the alert phone and pushed to the PWA). */
export interface NotificationDto {
  id: string;
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
  read: boolean;
}

/* ------------------------------------------------------------------ realtime */

/** Socket.IO events emitted to room `tenant:{tenantId}` after the change is committed. */
export interface ServerToClientEvents {
  'conversation.updated': (c: ConversationSummaryDto) => void;
  'message.created': (m: MessageDto) => void;
  'order.updated': (o: OrderDto) => void;
  'call.updated': (c: CallSummaryDto) => void;
  'review.created': (r: ReviewDto) => void;
  'notification': (n: { title: string; body: string; href?: string }) => void;
}

/* ------------------------------------------------------------------ helpers */

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}

export function formatPhone(e164OrDigits: string | null | undefined): string {
  const d = String(e164OrDigits ?? '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(e164OrDigits ?? '');
}

export function toE164(us: string): string | null {
  const d = String(us).replace(/\D/g, '');
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith('1')) return `+${d}`;
  return null;
}

/** The TCPA disclosure shown next to the consent checkbox in widgets and sites. Version it when wording changes. */
export const TEXT_CONSENT_VERSION = '2026-11-01';
export function textConsentDisclosure(businessName: string): string {
  return `I agree to receive text messages from ${businessName} about this order at the number above. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help.`;
}

export const CALL_DISCLOSURE_VERSION = '2026-11-01';
export function defaultGreeting(businessName: string): string {
  return `Thanks for calling ${businessName}. I'm the automated assistant, and this call may be recorded. How can I help?`;
}
