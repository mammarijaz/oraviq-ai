import { Global, Logger, Module } from '@nestjs/common';
import { adapterModes, env } from '../config/env';
import { AnthropicLlmProvider } from './anthropic/anthropic-llm.provider';
import { ChannelRouter, type MessagingAdapters } from './channel-router';
import { CloudflareDomainsAdapter } from './cloudflare/cloudflare-domains.adapter';
import { MockDomainsAdapter } from './mock/mock-domains.adapter';
import { MockLlmProvider } from './mock/mock-llm.provider';
import { MockMessagingAdapter, WebChatMessagingAdapter } from './mock/mock-messaging.adapter';
import { MockPaymentsAdapter } from './mock/mock-payments.adapter';
import { MockReviewsAdapter } from './mock/mock-reviews.adapter';
import { MockTelephonyAdapter } from './mock/mock-telephony.adapter';
import { MockVoiceAgentAdapter } from './mock/mock-voice-agent.adapter';
import { RetellVoiceAgentAdapter } from './retell/retell-voice.adapter';
import { StripePaymentsAdapter } from './stripe/stripe-payments.adapter';
import {
  ACCOUNT_CONNECT_ADAPTER,
  DOMAINS_ADAPTER,
  LLM_PROVIDER,
  MESSAGING_ADAPTERS,
  PAYMENTS_ADAPTER,
  REVIEWS_ADAPTER,
  TELEPHONY_ADAPTER,
  VOICE_AGENT_ADAPTER,
} from './types';
import { ZernioConnectAdapter, ZernioMessagingAdapter, ZernioReviewsAdapter, ZernioTelephonyAdapter } from './zernio/zernio.adapters';
import { ZernioClient } from './zernio/zernio.client';

const zernio = () => new ZernioClient(env().ZERNIO_API_KEY!, env().ZERNIO_API_URL ?? 'https://zernio.com/api');

/** Adapter selection: env keys present → real provider; otherwise the first-class mock. */
@Global()
@Module({
  providers: [
    {
      provide: MESSAGING_ADAPTERS,
      useFactory: (): MessagingAdapters => ({
        mock: new MockMessagingAdapter(),
        webchat: new WebChatMessagingAdapter(),
        real: env().ZERNIO_API_KEY ? { zernio: new ZernioMessagingAdapter(zernio()) } : {},
      }),
    },
    { provide: TELEPHONY_ADAPTER, useFactory: () => (env().ZERNIO_API_KEY ? new ZernioTelephonyAdapter(zernio(), process.env.ZERNIO_PROFILE_ID) : new MockTelephonyAdapter()) },
    { provide: REVIEWS_ADAPTER, useFactory: () => (env().ZERNIO_API_KEY ? new ZernioReviewsAdapter(zernio()) : new MockReviewsAdapter()) },
    {
      provide: VOICE_AGENT_ADAPTER,
      useFactory: () => (env().RETELL_API_KEY ? new RetellVoiceAgentAdapter(env().RETELL_API_KEY!, env().RETELL_WEBHOOK_SECRET ?? env().RETELL_API_KEY!) : new MockVoiceAgentAdapter()),
    },
    {
      provide: PAYMENTS_ADAPTER,
      useFactory: () => (env().STRIPE_SECRET_KEY ? new StripePaymentsAdapter(env().STRIPE_SECRET_KEY!, env().STRIPE_WEBHOOK_SECRET, env().STRIPE_CONNECT_CLIENT_ID) : new MockPaymentsAdapter()),
    },
    {
      provide: DOMAINS_ADAPTER,
      useFactory: () =>
        adapterModes().domains === 'cloudflare' ? new CloudflareDomainsAdapter(env().CLOUDFLARE_API_TOKEN!, env().CLOUDFLARE_ZONE_ID!, `sites.${env().SITES_BASE_DOMAIN}`) : new MockDomainsAdapter(),
    },
    { provide: LLM_PROVIDER, useFactory: () => (env().ANTHROPIC_API_KEY ? new AnthropicLlmProvider(env().ANTHROPIC_API_KEY!, env().ANTHROPIC_MODEL) : new MockLlmProvider()) },
    {
      provide: ACCOUNT_CONNECT_ADAPTER,
      useFactory: () => (env().ZERNIO_API_KEY ? new ZernioConnectAdapter(zernio(), process.env.ZERNIO_PROFILE_ID) : { provider: 'mock', connectUrl: async () => null }),
    },
    ChannelRouter,
  ],
  exports: [ACCOUNT_CONNECT_ADAPTER, MESSAGING_ADAPTERS, TELEPHONY_ADAPTER, REVIEWS_ADAPTER, VOICE_AGENT_ADAPTER, PAYMENTS_ADAPTER, DOMAINS_ADAPTER, LLM_PROVIDER, ChannelRouter],
})
export class IntegrationsModule {
  constructor() {
    new Logger('Integrations').log(`Adapter modes: ${JSON.stringify(adapterModes())}`);
  }
}
