# @oraviq/web

The Oraviq AI owner app: a Vue 3 single-page app, installable as a PWA. Inbox, AI receptionist, Try it out, Orders, Reviews, Website & widgets, Pricing rules, Weekly report, Setup and Settings. It looks and behaves like the approved prototype; all data comes from the Oraviq API (`docs/api-contract.md`) and the live inbox from Socket.IO.

## Run

```bash
pnpm --filter @oraviq/web dev          # http://localhost:5173 (the API on :3000 by default)
VITE_API_URL=http://localhost:3100 pnpm --filter @oraviq/web dev   # point at another API
pnpm --filter @oraviq/web test         # vitest (jsdom)
pnpm --filter @oraviq/web typecheck    # vue-tsc
pnpm --filter @oraviq/web build        # vue-tsc + vite build → dist/ (with sw.js + manifest)
```

Sign in with the seeded demo account `demo@oraviq.ai` / `demo1234`, or create an account at `/register`.

Browser checks (Playwright, uses the preinstalled browsers):

```bash
node scripts/screenshots.cjs --out /tmp/web-shots            # every route at 1440 and 390, against the real API
node scripts/screenshots.cjs --mock --out /tmp/web-shots     # same, with a mocked API (no server needed)
node scripts/e2e-flow.cjs                                    # login → Try it out → $720 quote → order → Orders → Confirm
node scripts/interactions.cjs                                # test call, reschedule + Undo, review reply, pricing problems, take over + reply
```

## Environment

| Variable | Default | Used for |
|---|---|---|
| `VITE_API_URL` | `http://localhost:3000` | REST (`/api/v1`) and Socket.IO (`/inbox`) |
| `VITE_SITES_URL` | `http://localhost:4321` | Live website preview (`/?key=pk_…`); an in-app preview is shown when it isn't reachable |
| `VITE_WIDGETS_URL` | `http://localhost:5175` | Chat and booking widget previews and the embed code (`w.js`) |
| `VITE_DEMO_TOOLS` | off (on in `vite dev`) | Shows "Mark deposit paid (demo)", which calls the API's dev-only mock checkout |

The API must allow this origin in CORS (`WEB_URL`).

## Structure

```
index.html              Red Hat fonts, favicon, body.ov-app
vite.config.ts          Vue, Tailwind (utilities only), PWA (injectManifest → src/sw.ts), alias @ → src
src/
  main.ts, App.vue      Pinia, router, the toaster; sends you to sign in when the session ends
  sw.ts                 Service worker: precache, offline shell, web push + notificationclick (Declarative Web Push aware)
  api/
    client.ts           fetch wrapper: bearer token, single-flight refresh on 401 via /auth/refresh, ApiError { status, message, problems }
    session.ts          token pair in localStorage
    index.ts            every endpoint, typed with @oraviq/shared
  stores/               auth (user, tenant), inbox (list, filters, threads, live events), orders, nav (sidebar counts),
                        pricing (saved table), tryit (simulator session)
  composables/
    useRealtime.ts      Socket.IO /inbox client wired to the stores; reconnects with fresh tokens, resyncs after gaps
    useOrderActions.ts  confirm, deposit link, reschedule (Undo), status steps; one toast per result
    useAsync.ts, useConnect.ts, useReachable.ts
  lib/                  realtime client, event bus, formatting (Thu, Nov 5 · 6:42 p.m. · $720), statuses, price-table draft, hours
  router/               routes + auth guard (meta.public), page titles
  components/           AppShell (sidebar, skip link, focus on navigation), OrderCard, RescheduleModal, TestCallPhone,
                        SitePreview, ErrorState, AuthLayout
  views/                one file per screen
  styles/app.css        app shell and screen layouts ported from the prototype; components come from @oraviq/ui/styles.css
public/                 favicon and app icons (PNG 192/512/maskable, apple-touch)
test/                   client refresh logic, stores + socket events, realtime client, views with a mocked API
scripts/                Playwright screenshots, mocked API fixtures, end-to-end flow
```

## Notes

- Every control is an `@oraviq/ui` component: no native `<select>` or `<input type="date">`.
- Prices shown in the app come from the API's quotes; the Pricing rules preview runs `calculateQuote` from `@oraviq/pricing` on the unsaved table, and the save uses the same `validatePriceTable` the server does (server problems are shown inline too).
- Realtime events update the stores in place: `conversation.updated`, `message.created`, `order.updated` (inbox, orders, sidebar counts), `call.updated` and `review.created` (call log, reviews), `notification` (toast, and a system notification when the app is in the background and notifications are allowed).
- Owner replies send an `Idempotency-Key` (reused if the same reply is retried after a failure). Refused actions (409, e.g. the customer replied STOP) show the API's message in a toast.
- Web push: the service worker shows `push` payloads in either the Declarative Web Push shape (`{ web_push: 8030, notification: { title, body, navigate } }`) or `{ title, body, href }`, and focuses or opens the app on click. Settings → Notifications on this device subscribes with the API's VAPID key (`GET /notifications/push-key`, `POST /notifications/push-subscriptions`), preferring Declarative Web Push (`window.pushManager`) where the browser has it.
