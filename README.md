# Oraviq AI

The AI front desk and unified inbox for dumpster rental companies. Oraviq answers every call, text, website chat, Facebook and Instagram message, quotes from the hauler's own price table, and turns inquiries into confirmed, deposit-paid orders.

This is a TypeScript monorepo (pnpm + Turborepo). The architecture rules are in [docs/architecture.md](docs/architecture.md); the API contract is in [docs/api-contract.md](docs/api-contract.md); the widget embed contract is in [docs/widgets.md](docs/widgets.md).

| Path | What | Dev URL |
|---|---|---|
| `apps/api` | NestJS 11 API, webhooks, Socket.IO, job worker; Prisma 7 + Postgres; BullMQ + Redis | http://localhost:3000/api/v1 (Swagger `/api/docs`) |
| `apps/web` | Owner app: Vue 3 SPA, installable PWA | http://localhost:5173 |
| `apps/widgets` | Embeddable chat + instant-price booking (`w.js` loader + iframe apps) | http://localhost:5175 (demo host page) |
| `apps/sites` | Free hauler websites (Astro SSR, tenant from the Host header) | http://localhost:4321 |
| `packages/pricing` | Deterministic pricing engine: the only source of prices | |
| `packages/shared` | API contract types, enums, order state machine | |
| `packages/ui` | Vue component library (the Oraviq design system) | http://localhost:5174 (gallery) |
| `packages/ui-tokens` | Design tokens + plain-CSS kit | |

## Quick start

Needs Node 22, pnpm 10, Postgres 16 and Redis 7 (`docker compose up -d` starts both).

```bash
pnpm install
cp .env.example apps/api/.env          # empty provider keys = mock adapters; everything works offline
pnpm --filter @oraviq/pricing build && pnpm --filter @oraviq/shared build
pnpm --filter @oraviq/api db:deploy && pnpm --filter @oraviq/api db:seed
pnpm dev                                # api, web, widgets, sites and the ui gallery
```

Sign in at http://localhost:5173 as **demo@oraviq.ai / demo1234** ("Demo Roll-Off Co.", Atlanta). The hauler site is at http://localhost:4321 and the widgets demo page at http://localhost:5175.

## Mock mode and real providers

Every outside service sits behind an adapter. With its key unset, the adapter runs a realistic mock, so the product, the tests and CI need no accounts. Set keys in `.env` to switch to the real provider: `ANTHROPIC_API_KEY` (assistant), `ZERNIO_API_KEY` (numbers, SMS, Messenger/Instagram, reviews), `RETELL_API_KEY` (voice receptionist), `STRIPE_SECRET_KEY` (deposits via Stripe Connect), `CLOUDFLARE_API_TOKEN` (custom domains). `GET /api/v1/health` shows which mode each adapter is in.

## Tests

```bash
pnpm test                               # pricing (property tests), ui components, api unit + e2e (oraviq_test DB), web
pnpm typecheck
node e2e/widgets-and-sites.cjs          # browser e2e: hauler site + widgets against the running API
```

## Deploy

`render.yaml` is a Render Blueprint: API, worker and sites as Node services, the owner app and widgets as static sites, Render Postgres and Key Value. Put Cloudflare in front (DNS, CDN, WAF, R2, Cloudflare for SaaS custom hostnames). CI runs in GitHub Actions (`.github/workflows/ci.yml`).

## Before going live

- Get written answers from Zernio on per-hauler 10DLC (ISV) registration, SIP transfer on the trunk to Retell, and custom SIP headers.
- Apply for Google Business Profile API access and start Meta Business Verification now, so native access is ready when you outgrow Zernio.
- Have counsel review the texting consent wording (`textConsentDisclosure` in `packages/shared`), the call-recording disclosure and the data-retention defaults.
