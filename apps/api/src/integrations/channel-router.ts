import { Inject, Injectable } from '@nestjs/common';
import type { Channel } from '@oraviq/shared';
import { DbService } from '../prisma/db.service';
import { MESSAGING_ADAPTERS, type MessagingAdapter, type MessagingChannel } from './types';

export interface MessagingAdapters {
  mock: MessagingAdapter;
  webchat: MessagingAdapter;
  /** Real providers by name (e.g. zernio), present only when keys are set. */
  real: Record<string, MessagingAdapter>;
}

/** The channel a reply actually goes out on: phone calls and booking forms are answered by SMS. */
export function deliveryChannel(channel: Channel): MessagingChannel {
  if (channel === 'facebook' || channel === 'instagram' || channel === 'whatsapp' || channel === 'web_chat') return channel;
  return 'sms';
}

/**
 * Picks the messaging provider per tenant and channel: simulator conversations and
 * tenants whose channel account is in mock mode use the mock; otherwise the
 * provider recorded on the tenant's channel account (Zernio today, Telnyx later).
 */
@Injectable()
export class ChannelRouter {
  constructor(
    @Inject(MESSAGING_ADAPTERS) private readonly adapters: MessagingAdapters,
    private readonly dbs: DbService,
  ) {}

  async resolve(channel: Channel, opts: { simulated?: boolean } = {}): Promise<{ adapter: MessagingAdapter; channel: MessagingChannel; accountId: string | null; from: string | null }> {
    const ch = deliveryChannel(channel);
    if (ch === 'web_chat') return { adapter: this.adapters.webchat, channel: ch, accountId: null, from: null };
    const kind = ch === 'sms' || ch === 'whatsapp' ? 'sms' : ch;
    const [account, tenant] = await Promise.all([
      this.dbs.db.channelAccount.findFirst({ where: { kind } }),
      this.dbs.system.tenant.findUnique({ where: { id: this.dbs.tenantId }, select: { oraviqNumber: true } }),
    ]);
    const from = tenant?.oraviqNumber ?? null;
    if (opts.simulated) return { adapter: this.adapters.mock, channel: ch, accountId: account?.externalAccountId ?? null, from };
    const real = account && account.provider !== 'mock' ? this.adapters.real[account.provider] : undefined;
    if (real && real.supports(ch)) return { adapter: real, channel: ch, accountId: account?.externalAccountId ?? null, from };
    return { adapter: this.adapters.mock, channel: ch, accountId: account?.externalAccountId ?? null, from };
  }

  /** The provider name a new tenant's channels should use. */
  defaultProvider(): string {
    return Object.keys(this.adapters.real)[0] ?? 'mock';
  }
}
