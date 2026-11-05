# Widgets embed contract

One script tag per page. Works on WordPress, Wix, Squarespace and GoDaddy custom-code blocks and on Oraviq hauler sites.

```html
<!-- chat button on every page -->
<script async src="https://widgets.oraviq.com/w.js" data-key="pk_demo_rolloff"></script>

<!-- instant-price booking form where this div sits -->
<div data-oraviq-booking></div>
```

## Loader (`w.js`, vanilla TS, < 10 KB gzipped)
- Reads `data-key` (publishable key) from its own script tag. Optional: `data-chat="false"` (no launcher), `data-accent="#1F6B4F"` (overrides the hauler's colour), `data-position="left|right"`.
- `{WIDGETS}` is the folder `w.js` was loaded from (`https://widgets.oraviq.com`, or `https://host/widgets` on the one-origin test deployment); `data-widgets-url` overrides it. `{API}` comes from `data-api-url`, otherwise it is guessed: `widgets.<domain>` → `api.<domain>`, the widgets dev server (`localhost:5175`) → `localhost:3000`, anything else → the same origin. postMessage checks use the origin of `{WIDGETS}`.
- Fetches `GET {API}/api/v1/public/{key}/business` once for the accent, chat label and position.
- Chat: renders a launcher pill inside a **Shadow DOM** host (host CSS can't break it). Clicking opens an iframe `{WIDGETS}/chat.html?key=…&accent=…` in a 360×520 panel (full screen under 480px). Any element with `data-oraviq-open-chat` also opens it. `window.OraviqWidgets.openChat()` / `.closeChat()`.
- Booking: for every `[data-oraviq-booking]` element (optional per-element `data-key`), mounts an iframe `{WIDGETS}/book.html?key=…&accent=…` that auto-resizes to its content.

## iframe apps (`chat.html`, `book.html`, Vue + @oraviq/ui)
- Run on the widgets origin with their own CSP; call the public API with the publishable key only.
- Booking computes the price live with `@oraviq/pricing` from the public business data (same engine as the API) and the API re-quotes on submit (the server's number is the one stored).
- The consent checkbox is unchecked by default and shows `textConsentDisclosure(businessName)` verbatim; the exact text is sent with the booking.

## postMessage protocol (origin-checked both ways)
| From | Message |
|---|---|
| iframe → loader | `{ type: 'oraviq:resize', height }`, `{ type: 'oraviq:close' }`, `{ type: 'oraviq:booked', orderNumber }`, `{ type: 'oraviq:ready' }` |
| loader → iframe | `{ type: 'oraviq:open' }` (focus the input) |

## Accent colour
Widgets use the hauler's site colour (`--ov-accent` / `--site`), never Oraviq violet, so they look native on the hauler's site.
