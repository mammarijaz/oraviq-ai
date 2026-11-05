# Oraviq API contract (v1)

Base URL: `/api/v1`. Types live in `packages/shared/src/index.ts` (named in brackets below). Auth is `Authorization: Bearer <accessToken>` unless marked **public** or **webhook**. Every authenticated route is scoped to the caller's tenant; ids from another tenant return 404.

Errors: `{ statusCode, error, message }` (+ `problems: string[]` for price-table validation).

## Auth
| Method | Path | Body → Response |
|---|---|---|
| POST | /auth/register | [RegisterRequest] → [AuthResponse]. Creates tenant, owner user, sample price table, default settings, an Oraviq number from the telephony adapter. |
| POST | /auth/login | [LoginRequest] → [AuthResponse] |
| POST | /auth/refresh | `{ refreshToken }` → [AuthTokens] |
| GET | /auth/me | → `{ user: UserDto, tenant: TenantDto }` |

## Tenant, team, setup
| GET | /tenant | → [TenantDto] |
| PATCH | /tenant | partial TenantDto fields (name, phone, city, state, timezone, businessHours) → [TenantDto] |
| GET | /team | → `UserDto[]` |
| POST | /team/invite | `{ name, email, role }` → [UserDto] (owner/admin only) |
| GET | /setup | → [SetupStepDto][] |
| POST | /setup/number | → `{ e164, display }` (owner/admin). Buys the tenant's Oraviq number through the telephony adapter; idempotent. Sign-up only buys one in mock mode or with `PROVISION_NUMBER_ON_SIGNUP=true`. |
| POST | /setup/test-call | → `{ ok: boolean, message: string }` (telephony adapter places a test call) |
| GET | /connections | → [ChannelConnectionDto][] |
| POST | /connections/:channel/connect | → [ChannelConnectionDto] (mock: connects immediately; real: returns `{ redirectUrl }`) |

## Inbox
| GET | /conversations?state=needs_you&channel=sms,facebook&q=text&cursor=&limit=50 | → `{ items: ConversationSummaryDto[], nextCursor }` |
| GET | /conversations/:id | → [ConversationDetailDto] (marks read) |
| PATCH | /conversations/:id | [UpdateConversationRequest] → [ConversationSummaryDto]. `aiMode: 'off'` = take over (adds a system message). |
| POST | /conversations/:id/messages | [SendMessageRequest] → [MessageDto]. Owner reply; sends on the conversation's channel (phone/booking_form reply by SMS). Send an `Idempotency-Key` header per reply. Refused with 409 if the contact opted out. |
| GET | /contacts?q= | → `{ items: ContactDto[] }` |

## Quotes, orders
| POST | /quotes | [QuoteRequest] → [QuoteResponse] (owner-side quote preview; not stored unless `conversationId` given) |
| GET | /orders?q=&status=requested,confirmed&channel=sms&sort=total_desc | → `{ items: OrderDto[] }` |
| GET | /orders/:id | → [OrderDto] |
| POST | /orders | [CreateOrderRequest] → [OrderDto] |
| POST | /orders/:id/confirm | → [OrderDto]. requested → confirmed; texts the customer; if Stripe is connected, creates a deposit link and includes it. |
| POST | /orders/:id/deposit-link | → [OrderDto] (sends/re-sends the deposit link) |
| POST | /orders/:id/reschedule | [RescheduleOrderRequest] → [OrderDto] |
| POST | /orders/:id/status | `{ status: OrderStatus }` → [OrderDto] (enforces ORDER_TRANSITIONS; picked_up schedules the review request) |

## Pricing
| GET | /pricing | → [PriceTableDto] |
| PUT | /pricing | [UpdatePriceTableRequest] → [PriceTableDto] (validates with `validatePriceTable`; bumps version; purges site cache) |

## AI receptionist and calls
| GET | /receptionist | → [ReceptionistSettingsDto] |
| PUT | /receptionist | partial [ReceptionistSettingsDto] → [ReceptionistSettingsDto] (syncs the voice agent via the voice adapter) |
| GET | /receptionist/stats | → [ReceptionistStatsDto] |
| GET | /calls?outcome=quote_given,sent_to_you | → `{ items: CallSummaryDto[] }` |
| GET | /calls/:id | → [CallDto] |
| POST | /receptionist/test-call | [TestCallTurnRequest] → [TestCallTurnResponse] (in-app simulator: runs the same voice tools and the mock voice brain; `end: true` hangs up and returns the summary) |

## Reviews
| GET | /reviews?replied=true|false&source=google,facebook&rating=1,2 | → `{ items: ReviewDto[], stats: ReviewStatsDto }` |
| POST | /reviews/:id/draft | → [ReviewDto] (new AI draft) |
| POST | /reviews/:id/reply | `{ text }` → [ReviewDto] (posts through the reviews adapter; only after owner action) |
| GET | /review-requests | → `{ settings: ReviewRequestSettingsDto, jobs: ReviewRequestJobDto[] }` |
| PUT | /review-requests | partial [ReviewRequestSettingsDto] → [ReviewRequestSettingsDto] |
| POST | /review-requests/:orderId/send | → [ReviewRequestJobDto] |

## Website and widgets
| GET | /site | → [SiteSettingsDto] |
| PUT | /site | partial [SiteSettingsDto] → [SiteSettingsDto] |
| POST | /site/publish | → [SiteSettingsDto] |
| POST | /site/domain | `{ domain }` → [SiteSettingsDto] (custom hostname via the domains adapter; status pending) |
| GET | /widgets | → [WidgetSettingsDto] |
| PUT | /widgets | partial [WidgetSettingsDto] → [WidgetSettingsDto] |

## Reports and simulator
| GET | /reports/weekly?to=YYYY-MM-DD | → [WeeklyReportDto] |
| POST | /simulator/inbound | [SimulatorInboundRequest] `{ channel: 'sms'|'facebook'|'instagram'|'web_chat', from?, name?, body, newConversation? }` → [SimulatorInboundResponse] `{ conversationId, replies: MessageDto[] }`. Runs the real inbound pipeline through the mock provider (the "Try it out" screen). |
| POST | /simulator/missed-call | `{ from?: string }` → `{ conversationId }` |

## Notifications and health
| GET | /health | → `{ ok, inlineJobs, demoMode, adapters: { llm, messaging, telephony, reviews, voice, payments, domains } }` (**public**; each adapter is `mock` or `real`) |
| GET | /notifications | → [NotificationDto][] (owner alerts, newest first) |
| GET | /notifications/push-key | → `{ publicKey }` (VAPID) |
| POST | /notifications/push-subscriptions | a browser PushSubscription JSON → `{ ok: true }` |

## Dev only (refused with 403 in production, unless `DEMO_MODE=true` on a test deployment)
| POST | /dev/payments/:sessionId/pay | marks a mock deposit paid (drives the same webhook path as Stripe); only while payments run the mock adapter |
| POST | /dev/jobs/run | runs due scheduled actions now |
| GET | /dev/mock/sent | messages the mock providers "sent" |

Refused actions (customer opted out, illegal order transition) return **409** with a message.

## Public (widgets and hauler sites), keyed by publishable key `pk_…`
| GET | /public/:key/business | → [PublicBusinessDto] |
| POST | /public/:key/quote | [QuoteRequest] → `{ ok, quote? (Quote), error? }` |
| POST | /public/:key/chat/start | → [PublicChatStartResponse] |
| POST | /public/:key/chat/message | [PublicChatMessageRequest] → `{ messages: [...] }` (only the assistant's new replies) |
| POST | /public/:key/booking | [PublicBookingRequest] → [PublicBookingResponse] (stores TCPA consent evidence; creates contact, conversation, order) |
| GET | /public/sites/by-host/:host | → `{ key }` (sites app resolves Host header → tenant) |

## Webhooks (signature-verified, store-then-enqueue, answer within 5 s)
| POST | /webhooks/zernio | messages, calls, reviews, registration events |
| POST | /webhooks/retell | call_started, call_ended, call_analyzed |
| POST | /webhooks/stripe | checkout.session.completed, payment_intent.succeeded, … (Connect) |
| POST | /voice/tools/:tool | Retell custom functions: get_quote, check_zip, lookup_customer, create_order_draft, send_quote_sms (signed, < 300 ms) |
| POST | /webhooks/mock/:provider | dev only: replays fixture payloads through the same pipeline |

## Realtime
Socket.IO namespace `/inbox`, auth `{ token: accessToken }`. The server joins the socket to `tenant:{tenantId}` and emits [ServerToClientEvents] after commits.
