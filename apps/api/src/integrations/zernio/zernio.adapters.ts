import type { AccountConnectAdapter, MessagingAdapter, MessagingChannel, OutboundMessage, ProvisionedNumber, ReviewSummary, ReviewsAdapter, SendResult, TelephonyAdapter } from '../types';
import { ZernioClient } from './zernio.client';

/**
 * SMS, Messenger and Instagram through Zernio.
 *  - Replies in an existing Zernio inbox thread: POST /v1/inbox/conversations/{conversationId}/messages
 *  - New SMS (no thread yet: booking-form customers, owner alerts): POST /v1/sms/messages {from, to, text}
 */
export class ZernioMessagingAdapter implements MessagingAdapter {
  readonly provider = 'zernio';
  constructor(private readonly client: ZernioClient) {}

  supports(channel: MessagingChannel): boolean {
    return channel === 'sms' || channel === 'facebook' || channel === 'instagram' || channel === 'whatsapp';
  }

  async send(msg: OutboundMessage): Promise<SendResult> {
    if (msg.externalThreadId) {
      const res = await this.client.request<any>(
        'POST',
        `/v1/inbox/conversations/${encodeURIComponent(msg.externalThreadId)}/messages`,
        { accountId: msg.accountId ?? undefined, message: msg.body },
        msg.idempotencyKey,
      );
      const id = res?.data?.messageId ?? res?.data?.id ?? res?.messageId ?? res?.id ?? msg.idempotencyKey;
      return { provider: this.provider, providerMessageId: String(id), status: 'sent', externalThreadId: msg.externalThreadId };
    }
    if (msg.channel !== 'sms' || !msg.from) throw new Error(`Zernio needs a conversation id to message on ${msg.channel}.`);
    const res = await this.client.request<{ id: string; conversationId?: string; status: string }>('POST', '/v1/sms/messages', { from: msg.from, to: msg.to, text: msg.body }, msg.idempotencyKey);
    return { provider: this.provider, providerMessageId: res.id, status: 'sent', externalThreadId: res.conversationId ?? null };
  }
}

/** Numbers through Zernio: POST /v1/phone-numbers/purchase (SMS-capable local number). */
export class ZernioTelephonyAdapter implements TelephonyAdapter {
  readonly provider = 'zernio';
  constructor(
    private readonly client: ZernioClient,
    private readonly profileId?: string,
  ) {}

  async provisionNumber(opts: { tenantId: string; areaCode?: string | null }): Promise<ProvisionedNumber> {
    const res = await this.client.request<any>(
      'POST',
      '/v1/phone-numbers/purchase',
      {
        profileId: this.profileId,
        country: 'US',
        numberType: 'local',
        areaCode: opts.areaCode ?? undefined,
        connectWhatsapp: false,
        wantsSms: true,
        purchaseIntentId: `oraviq_${opts.tenantId}`,
      },
    );
    const pn = res?.phoneNumber && typeof res.phoneNumber === 'object' ? res.phoneNumber : res;
    return { e164: String(pn.phoneNumber ?? res.phoneNumber), provider: this.provider, providerNumberId: String(pn.id ?? res.numberId) };
  }

  async placeTestCall(opts: { from: string; to: string }): Promise<{ ok: boolean; message: string }> {
    // Forwarding is configured on the hauler's own carrier; we ask them to call their number and watch for call.received.
    return { ok: true, message: `Call ${opts.from} from another phone and let it ring. We'll confirm here when ${opts.to} receives it.` };
  }

  async startTextingRegistration(): Promise<{ status: 'pending' | 'in_review' | 'approved' }> {
    return { status: 'pending' };
  }
}

/** Google and Facebook reviews through Zernio's inbox: POST /v1/inbox/reviews/{reviewId}/reply (accountId required). */
export class ZernioReviewsAdapter implements ReviewsAdapter {
  readonly provider = 'zernio';
  constructor(private readonly client: ZernioClient) {}

  async reply(input: { externalId: string | null; text: string; accountId?: string | null }): Promise<{ ok: true }> {
    if (!input.externalId) throw new Error('This review has no provider id to reply to.');
    await this.client.request('POST', `/v1/inbox/reviews/${encodeURIComponent(input.externalId)}/reply`, { accountId: input.accountId, message: input.text });
    return { ok: true };
  }

  async fetchSummary(input: { accountId?: string | null }): Promise<ReviewSummary | null> {
    if (!input.accountId) return null;
    const res = await this.client.request<any>('GET', `/v1/inbox/reviews?accountId=${encodeURIComponent(input.accountId)}&limit=1`);
    const s = res?.summary ?? res?.meta ?? null;
    if (!s) return null;
    return { google: s.averageRating != null ? { rating: Number(s.averageRating), count: Number(s.totalCount ?? s.total ?? 0) } : null, facebook: null };
  }
}

/** Meta and Google connections through Zernio's hosted OAuth: GET /v1/connect/{platform} → { authUrl }. */
export class ZernioConnectAdapter implements AccountConnectAdapter {
  readonly provider = 'zernio';
  constructor(
    private readonly client: ZernioClient,
    private readonly defaultProfileId?: string,
  ) {}

  async connectUrl(input: { tenantId: string; kind: 'facebook' | 'instagram' | 'google'; redirectUrl: string; profileId?: string | null }): Promise<string | null> {
    const platform = input.kind === 'google' ? 'googlebusiness' : input.kind;
    const profileId = input.profileId ?? this.defaultProfileId;
    if (!profileId) throw new Error('Set ZERNIO_PROFILE_ID (or the tenant profile) to connect accounts.');
    const q = new URLSearchParams({ profileId, redirect_url: input.redirectUrl, scopes: input.kind === 'google' ? 'reviews,messaging' : 'messaging' });
    const res = await this.client.request<{ authUrl: string }>('GET', `/v1/connect/${platform}?${q.toString()}`);
    return res.authUrl;
  }
}
