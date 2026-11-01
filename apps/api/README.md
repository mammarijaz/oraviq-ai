# @oraviq/api

The Oraviq backend: REST API (`/api/v1`), provider webhooks, Socket.IO realtime and the job worker for the AI front desk + unified inbox for dumpster rental companies. NestJS 11, Prisma 7 (Postgres, `adapter-pg`), BullMQ/Redis, Socket.IO.

The API contract is [`docs/api-contract.md`](../../docs/api-contract.md) with types in `@oraviq/shared`; the rules are in [`docs/architecture.md`](../../docs/architecture.md).

## Run it

```bash
# Postgres 16 + Redis (docker compose up -d, or local services). Role oraviq/oraviq, DBs oraviq and oraviq_test.
cp ../../.env.example .env              # or put .env at the repo root; apps/api/.env wins
pnpm --filter @oraviq/shared build      # workspace packages are consumed from dist
pnpm --filter @oraviq/pricing build
pnpm --filter @oraviq/api db:deploy     # apply migrations (db:migrate in development)
pnpm --filter @oraviq/api db:seed       # demo tenant, idempotent (resets the demo data)
pnpm --filter @oraviq/api dev           # http://localhost:3000/api/v1, Swagger at /api/docs
```

Demo login: **demo@oraviq.ai / demo1234** ("Demo Roll-Off Co.", Atlanta; publishable key `pk_demo_rolloff`). The seed recreates the approved prototype: conversations c1–c8 with their messages, quotes and orders, the four calls, six reviews with reply drafts, five review-request jobs, site and widget settings. Times are laid out on the most recent 7 p.m. in Atlanta.

| Script | What it does |
|---|---|
| `dev` | API with watch. `INLINE_JOBS=true` (default outside production) runs jobs in-process, so no worker or Redis is needed. |
| `build` / `start` | Compile to `dist/` and run `dist/main.js`. |
| `start:worker` / `dev:worker` | The worker (`src/worker.ts`): BullMQ processors, outbox publisher, scheduled-actions poller. Use with `INLINE_JOBS=false`. |
| `test` | Jest: unit (`src/**/*.spec.ts`) + e2e (`test/*.e2e-spec.ts`) against `oraviq_test`; migrations are applied and tables emptied in global setup. |
| `typecheck` | `tsc --noEmit` over src, tests and prisma. |
| `db:migrate` / `db:deploy` / `db:seed` / `db:reset` | Prisma migrations and the demo seed. |

Production shape: one API process (`INLINE_JOBS=false`) and one or more workers (`start:worker`) sharing Postgres and Redis.

## Environment

Every key is listed and commented in [`/.env.example`](../../.env.example). Core: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PUBLIC_API_URL`, `WEB_URL`, `WIDGETS_URL`, `SITES_BASE_DOMAIN`, `INLINE_JOBS`, `PORT` (3000). **An empty provider key means that adapter runs in mock mode.** `GET /api/v1/health` shows the active modes.

| Adapter | Mock (no key) | Real | Switch on with |
|---|---|---|---|
| LlmProvider | prototype parser + state machine (`modules/ai/brain`) | Anthropic Messages API, tool use, cached system prompt | `ANTHROPIC_API_KEY` (`ANTHROPIC_MODEL`, default `claude-haiku-4-5`) |
| MessagingAdapter (SMS, Messenger, Instagram) | records sends, succeeds instantly; simulator loops replies | Zernio (`/v1/inbox/conversations/{id}/messages`, `/v1/sms/messages`, `Idempotency-Key`) | `ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET` |
| TelephonyAdapter | fake 555 numbers | Zernio `/v1/phone-numbers/purchase` | `ZERNIO_API_KEY` (+ `ZERNIO_PROFILE_ID`) |
| ReviewsAdapter / account connect | instant | Zernio `/v1/inbox/reviews/{id}/reply`, `/v1/connect/{platform}` | `ZERNIO_API_KEY` |
| VoiceAgentAdapter | rule-based voice brain (in-app test call) | Retell agent + LLM sync, custom functions, webhooks | `RETELL_API_KEY` (`RETELL_WEBHOOK_SECRET` optional) |
| PaymentsAdapter | `https://pay.oraviq.test/c/…` links; `POST /api/v1/dev/payments/:sessionId/pay` marks paid | Stripe Connect (Standard OAuth), Checkout Session as a direct charge on the connected account | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_CONNECT_CLIENT_ID` |
| DomainsAdapter | hostnames active instantly | Cloudflare for SaaS custom hostnames | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` |
| Web push | recorded only | `web-push` (VAPID) | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` |

The provider is also chosen **per tenant and channel**: `ChannelRouter` reads `channel_accounts.provider`, so a tenant created in mock mode keeps using the mock until it connects, and simulator conversations always use the mock.

## Architecture

```
src/
  main.ts / worker.ts      HTTP API / worker entry (same modules, worker has no HTTP)
  bootstrap.ts             prefix, helmet, CORS (WEB_URL/WIDGETS_URL; any origin for /public), Swagger
  config/env.ts            zod-validated env; loads apps/api/.env then the root .env
  core/                    CoreModule (CLS, JWT), TenantContext (request/job tenant scope)
  prisma/                  PrismaService (system client) + tenant-scoping client extension (DbService)
  common/                  auth guard (@Public, @Roles), error filter, phone/time helpers
  integrations/            adapter interfaces (types.ts), mocks, zernio/, retell/, stripe/, cloudflare/, anthropic/, ChannelRouter
  jobs/                    JobsService (inline or BullMQ), transactional outbox, scheduled actions, pollers
  realtime/                Socket.IO /inbox gateway (JWT, tenant:{id} rooms) + Redis fan-out
  modules/
    ai/                    AssistantService (the orchestrator) + brain/ (parse, state machine, voiceify)
    inbox/                 inbound pipeline, owner actions, read queries, DTO mappers
    messaging/ contacts/   outbound messages via outbox; contacts, identities, consent ledger
    pricing/ quotes/ orders/   price tables (versioned), quotes, order state machine
    voice/                 receptionist settings/stats, test-call brain, Retell tools + webhooks
    reviews/               reviews, AI drafts, review requests (scheduled after pickup)
    site/ public/          site + widgets settings, publishable-key endpoints (chat, booking, quote)
    tenant/ auth/          registration/provisioning, team, setup, connections; JWT + rotating refresh tokens
    webhooks/ simulator/ reports/ notifications/ audit/ dev/
```

Non-negotiables and where they live:

- **Prices only from `@oraviq/pricing`.** The LLM calls `get_quote` (`QuotesService` → `calculateQuote`); the customer sees `renderQuoteSentence`. `AssistantService` runs `unbackedAmounts` on every reply: any `$` not backed by a quote blocks the send, posts a system note and hands off (`needs_you`).
- **One assistant loop** for SMS, web chat, Messenger, Instagram and booking follow-ups (`AssistantService.respond`). It owns the tools (`get_quote`, `check_service_area`, `create_order_draft`, `handoff_to_human`), the first-reply automated-assistant disclosure and `aiMode` (auto sends, draft stores, off does nothing). Voice uses the same tools (`VoiceService`).
- **Tenant isolation.** `TenantContext` (nestjs-cls) holds the tenant from the JWT, the webhook or the publishable key; the Prisma extension adds `tenantId` to every read/update/delete and create on tenant-owned models and throws without a tenant. Jobs carry `tenantId`. Other tenants' ids return 404.
- **Webhooks: verify → store → enqueue.** `webhook_events` is unique on `(provider, externalEventId)`; handlers answer immediately and the worker processes. Zernio: `X-Zernio-Signature` (hex HMAC-SHA256 of the raw body). Retell: `x-retell-signature` (`v=<ms>,d=<hmac(body+ts)>` with the API key). Stripe: `constructEvent`.
- **Durable state in Postgres.** Side effects (sends, owner alerts, realtime events, cache purges) are `outbox` rows written in the same transaction and dispatched after commit; delayed work (review requests) is `scheduled_actions`; Redis only executes.
- **Compliance.** STOP/STOPALL/UNSUBSCRIBE/CANCEL/END/QUIT revoke SMS consent with one confirmation and block later sends (owner sends get a 409); HELP gets help text; START resubscribes; consent ledger with evidence and disclosure version (booking widget stores the exact text, page, IP and user agent); call greeting must keep the automated + recording notice; audit log for owner actions.

Extras beyond the contract: `GET /health`, `GET /notifications`, `POST /notifications/push-subscriptions`, `GET /connections/stripe/callback`, dev-only `POST /dev/payments/:sessionId/pay`, `POST /dev/jobs/run`, `GET /dev/mock/sent`; `Idempotency-Key` header on `POST /conversations/:id/messages`; `newConversation` on the simulator; `end` on the test call.

## Adding a provider

1. Implement the interface from `src/integrations/types.ts` (e.g. `MessagingAdapter` for Telnyx) in `src/integrations/<provider>/`. Keep vendor SDKs inside that folder.
2. Register it in `integrations.module.ts` behind its env key (add the key, commented, to `/.env.example` and `config/env.ts`). For messaging, add it to `real` in `MESSAGING_ADAPTERS` under its provider name.
3. If it sends webhooks, add a verify + `store()` route in `webhooks.controller.ts`/`webhooks.service.ts` and map its events to the existing handlers (`InboundService.handle`, `missedCall`, `ReviewsService.ingest`, `OrdersService.markDepositPaid`).
4. Move a tenant by changing `channel_accounts.provider` (and porting the number); nothing else in the data model is vendor-specific.
5. Add a mock-mode test and, if the provider signs requests, a signature unit test (see `integrations/signatures.spec.ts`).
