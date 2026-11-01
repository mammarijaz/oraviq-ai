# Oraviq architecture (v1)

Decided in the November 2026 stack research. Short version: **a TypeScript modular monolith in a pnpm + Turborepo monorepo**. NestJS 11 + Prisma 7 + Postgres + BullMQ/Redis + Socket.IO on the backend; Vue 3 SPA (PWA) for owners; Astro for hauler sites; iframe widgets. Every outside provider sits behind an adapter, with Zernio (numbers, SMS, Meta DMs, reviews) and Retell (voice) first. Hosting: Render + Cloudflare.

## Layout

```
apps/
  api/        NestJS: REST + webhooks + Socket.IO; `src/worker.ts` runs BullMQ processors + scheduler from the same modules
  web/        Vue 3 owner app (PWA)
  widgets/    loader.js (Shadow DOM launcher) + iframe apps: chat, booking
  sites/      Astro SSR hauler websites (Host header → tenant)
packages/
  pricing/    pure TS pricing engine (no I/O); used by api, web, widgets, sites
  shared/     the API contract: types, enums, state machine, helpers
  ui-tokens/  CSS tokens + plain-CSS kit (ov- classes)
  ui/         Vue components built on the tokens (ov- design system)
docs/         this file, api-contract.md
```

## Non-negotiables

1. **Prices come only from `@oraviq/pricing`.** The AI extracts facts and calls tools; quote messages are rendered by code (`renderQuoteSentence`); any `$` amount in AI text that is not backed by a quote (`unbackedAmounts`) blocks the send and hands off to the owner.
2. **Tenant isolation.** Every tenant-owned row has `tenantId`; queries are scoped through the request context (nestjs-cls) and a Prisma extension. Jobs carry `tenantId` explicitly.
3. **Webhooks: verify → store → enqueue.** `webhook_events` is unique on (provider, externalEventId); handlers answer fast (Zernio 5 s, Retell 10 s) and do the work in the worker.
4. **Durable state in Postgres, Redis only executes.** Order state machine (`ORDER_TRANSITIONS`), `scheduled_actions` for delayed work (review requests, owner reminders), transactional `outbox` for side effects and realtime events.
5. **Provider-neutral data model.** contacts + contact_identities, consents (TCPA evidence), channel_accounts, phone_numbers, conversations, messages, calls, quotes, orders, order_events, price_tables, reviews. Moving a tenant from Zernio to Telnyx is a `channel_accounts.provider` change plus a number port.
6. **Compliance by construction.** STOP/HELP handling on every SMS path; consent ledger with disclosure text version; the voice agent says it's automated and that calls may be recorded in its first sentence; recordings in object storage with signed URLs; audit log.
7. **Mock adapters are first-class.** With no API keys set, every adapter runs in mock mode with realistic behaviour, so the whole product works locally and in CI. Real keys switch adapters via env vars only.

## Adapters (apps/api/src/integrations)

| Interface | Mock | Real (v1) | Later |
|---|---|---|---|
| MessagingAdapter (SMS, Messenger, Instagram) | in-process, loops to simulator | Zernio | Telnyx, Meta Graph |
| TelephonyAdapter (numbers, routing, 10DLC) | fake numbers | Zernio | Telnyx |
| VoiceAgentAdapter | rule-based voice brain | Retell (SIP from Zernio, custom functions, webhooks) | LiveKit/Pipecat |
| ReviewsAdapter | seeded reviews | Zernio | Google Business Profile API, Meta |
| PaymentsAdapter | fake checkout links, test "mark paid" | Stripe Connect (Standard-style, direct charges) | — |
| LlmProvider | deterministic parser (ported from the prototype) | Anthropic Claude Haiku 4.5 (tool use, structured output) | OpenAI/Gemini for bake-off |
| DomainsAdapter | instant "active" | Cloudflare for SaaS custom hostnames | — |

## Environments

`.env` keys (see `.env.example`): `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PUBLIC_API_URL`, `WEB_URL`, `WIDGETS_URL`, `SITES_BASE_DOMAIN`, `ANTHROPIC_API_KEY`, `ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET`, `RETELL_API_KEY`, `RETELL_WEBHOOK_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`. Unset provider keys = mock mode.
