import type {
  AuthResponse,
  AuthTokens,
  CallDto,
  CallOutcome,
  CallSummaryDto,
  Channel,
  ChannelConnectionDto,
  ContactDto,
  ConversationDetailDto,
  ConversationState,
  ConversationSummaryDto,
  CreateOrderRequest,
  LoginRequest,
  MessageDto,
  NotificationDto,
  OrderDto,
  OrderListQuery,
  OrderStatus,
  PriceTableDto,
  QuoteRequest,
  QuoteResponse,
  ReceptionistSettingsDto,
  ReceptionistStatsDto,
  RegisterRequest,
  RescheduleOrderRequest,
  ReviewDto,
  ReviewRequestJobDto,
  ReviewRequestSettingsDto,
  ReviewSource,
  ReviewStatsDto,
  SimulatorInboundRequest,
  SimulatorInboundResponse,
  Role,
  SetupStepDto,
  SiteSettingsDto,
  TenantDto,
  TestCallTurnRequest,
  TestCallTurnResponse,
  UpdateConversationRequest,
  UpdatePriceTableRequest,
  UserDto,
  WeeklyReportDto,
  WidgetSettingsDto,
} from '@oraviq/shared';
import { createApiClient, type ApiClient } from './client';
import { sessionTokens } from './session';
import { API_BASE } from '@/lib/env';

export { ApiError, errorMessage } from './client';

type SessionExpiredHandler = () => void;
let onExpired: SessionExpiredHandler = () => {};
/** The auth store registers what happens when the refresh token is rejected. */
export function setSessionExpiredHandler(fn: SessionExpiredHandler) {
  onExpired = fn;
}

export const http: ApiClient = createApiClient({
  baseUrl: API_BASE,
  tokens: sessionTokens,
  onSessionExpired: () => onExpired(),
});

export type SimulatorChannel = SimulatorInboundRequest['channel'];

export function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
export interface ConversationListQuery {
  state?: ConversationState;
  limit?: number;
  channel?: Channel[];
  q?: string;
  cursor?: string | null;
}
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Every endpoint in docs/api-contract.md, typed with @oraviq/shared. */
export const api = {
  auth: {
    login: (b: LoginRequest) => http.post<AuthResponse>('/auth/login', b, { auth: false }),
    register: (b: RegisterRequest) => http.post<AuthResponse>('/auth/register', b, { auth: false }),
    refresh: (refreshToken: string) => http.post<AuthTokens>('/auth/refresh', { refreshToken }, { auth: false }),
    me: () => http.get<{ user: UserDto; tenant: TenantDto }>('/auth/me'),
  },
  tenant: {
    get: () => http.get<TenantDto>('/tenant'),
    update: (b: Partial<Pick<TenantDto, 'name' | 'phone' | 'city' | 'state' | 'timezone' | 'businessHours'>>) => http.patch<TenantDto>('/tenant', b),
  },
  team: {
    list: () => http.get<UserDto[]>('/team'),
    invite: (b: { name: string; email: string; role: Role }) => http.post<UserDto>('/team/invite', b),
  },
  setup: {
    steps: () => http.get<SetupStepDto[]>('/setup'),
    testCall: () => http.post<{ ok: boolean; message: string }>('/setup/test-call'),
  },
  connections: {
    list: () => http.get<ChannelConnectionDto[]>('/connections'),
    connect: (channel: ChannelConnectionDto['channel']) =>
      http.post<ChannelConnectionDto | { redirectUrl: string }>(`/connections/${channel}/connect`),
  },
  conversations: {
    list: (q: ConversationListQuery = {}, signal?: AbortSignal) =>
      http.get<Page<ConversationSummaryDto>>('/conversations', { query: { state: q.state, channel: q.channel, q: q.q, cursor: q.cursor, limit: q.limit }, signal }),
    get: (id: string) => http.get<ConversationDetailDto>(`/conversations/${id}`),
    update: (id: string, b: UpdateConversationRequest) => http.patch<ConversationSummaryDto>(`/conversations/${id}`, b),
    /** One Idempotency-Key per reply, so a retried request never texts the customer twice. */
    send: (id: string, body: string, idempotencyKey: string = newIdempotencyKey()) =>
      http.post<MessageDto>(`/conversations/${id}/messages`, { body }, { headers: { 'Idempotency-Key': idempotencyKey } }),
  },
  contacts: {
    search: (q: string) => http.get<{ items: ContactDto[] }>('/contacts', { query: { q } }),
  },
  quotes: {
    preview: (b: QuoteRequest & { conversationId?: string }) => http.post<QuoteResponse>('/quotes', b),
  },
  orders: {
    list: (q: OrderListQuery = {}, signal?: AbortSignal) =>
      http.get<{ items: OrderDto[] }>('/orders', { query: { q: q.q, status: q.status, channel: q.channel, sort: q.sort }, signal }),
    get: (id: string) => http.get<OrderDto>(`/orders/${id}`),
    create: (b: CreateOrderRequest) => http.post<OrderDto>('/orders', b),
    confirm: (id: string) => http.post<OrderDto>(`/orders/${id}/confirm`),
    depositLink: (id: string) => http.post<OrderDto>(`/orders/${id}/deposit-link`),
    reschedule: (id: string, b: RescheduleOrderRequest) => http.post<OrderDto>(`/orders/${id}/reschedule`, b),
    setStatus: (id: string, status: OrderStatus) => http.post<OrderDto>(`/orders/${id}/status`, { status }),
  },
  pricing: {
    get: () => http.get<PriceTableDto>('/pricing'),
    save: (b: UpdatePriceTableRequest) => http.put<PriceTableDto>('/pricing', b),
  },
  receptionist: {
    get: () => http.get<ReceptionistSettingsDto>('/receptionist'),
    save: (b: Partial<ReceptionistSettingsDto>) => http.put<ReceptionistSettingsDto>('/receptionist', b),
    stats: () => http.get<ReceptionistStatsDto>('/receptionist/stats'),
    /** `end: true` hangs up and writes the summary. */
    testCall: (b: TestCallTurnRequest) => http.post<TestCallTurnResponse>('/receptionist/test-call', b),
  },
  calls: {
    list: (outcome?: CallOutcome[]) => http.get<{ items: CallSummaryDto[] }>('/calls', { query: { outcome } }),
    get: (id: string) => http.get<CallDto>(`/calls/${id}`),
  },
  reviews: {
    list: (q: { replied?: boolean; source?: ReviewSource[]; rating?: number[] } = {}) =>
      http.get<{ items: ReviewDto[]; stats: ReviewStatsDto }>('/reviews', { query: { replied: q.replied, source: q.source, rating: q.rating } }),
    draft: (id: string) => http.post<ReviewDto>(`/reviews/${id}/draft`),
    reply: (id: string, text: string) => http.post<ReviewDto>(`/reviews/${id}/reply`, { text }),
    requests: () => http.get<{ settings: ReviewRequestSettingsDto; jobs: ReviewRequestJobDto[] }>('/review-requests'),
    saveRequests: (b: Partial<ReviewRequestSettingsDto>) => http.put<ReviewRequestSettingsDto>('/review-requests', b),
    sendRequest: (orderId: string) => http.post<ReviewRequestJobDto>(`/review-requests/${orderId}/send`),
  },
  site: {
    get: () => http.get<SiteSettingsDto>('/site'),
    save: (b: Partial<SiteSettingsDto>) => http.put<SiteSettingsDto>('/site', b),
    publish: () => http.post<SiteSettingsDto>('/site/publish'),
    domain: (domain: string) => http.post<SiteSettingsDto>('/site/domain', { domain }),
  },
  widgets: {
    get: () => http.get<WidgetSettingsDto>('/widgets'),
    save: (b: Partial<WidgetSettingsDto>) => http.put<WidgetSettingsDto>('/widgets', b),
  },
  reports: {
    weekly: (to?: string) => http.get<WeeklyReportDto>('/reports/weekly', { query: { to } }),
  },
  /** API extras beyond docs/api-contract.md: owner alerts and PWA push. */
  notifications: {
    list: () => http.get<{ items: NotificationDto[] }>('/notifications'),
    pushKey: () => http.get<{ publicKey: string | null }>('/notifications/push-key'),
    subscribe: (b: { endpoint: string; keys: { p256dh: string; auth: string } }) => http.post<{ ok: boolean }>('/notifications/push-subscriptions', b),
  },
  /** Dev-only helpers (refused in production). */
  dev: {
    /** Mock checkout: marks the deposit paid through the same pipeline as Stripe's webhook. */
    payDeposit: (sessionId: string) => http.post<{ ok: boolean; message?: string }>(`/dev/payments/${encodeURIComponent(sessionId)}/pay`),
  },
  simulator: {
    inbound: (b: SimulatorInboundRequest) => http.post<SimulatorInboundResponse>('/simulator/inbound', b),
    missedCall: (b: { from?: string } = {}) => http.post<{ conversationId: string }>('/simulator/missed-call', b),
  },
};

export type Api = typeof api;
