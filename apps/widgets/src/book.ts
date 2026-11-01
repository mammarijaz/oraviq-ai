/* Instant-price booking widget (iframe). The price shown comes from the API's pricing engine. */
import './vendor/kit.js';
import './styles/widget.css';
import { DEBRIS_LABELS, formatMoney, formatTons, type DebrisType, type Quote, type QuoteError } from '@oraviq/pricing';
import { textConsentDisclosure, type PublicBookingResponse, type PublicBusinessDto } from '@oraviq/shared';
import { api, applyAccent, autoResize, esc, post } from './common';

type Kit = {
  dropdown(o: Record<string, unknown>): string;
  datePicker(o: Record<string, unknown>): string;
  today(): string;
  formatDate(iso: string, long?: boolean): string;
  restore(): void;
  icons: Record<string, string>;
};
const O = (window as unknown as { Oraviq: Kit }).Oraviq;

const root = document.getElementById('app')!;
const state = {
  biz: null as PublicBusinessDto | null,
  yards: '20',
  days: '7',
  debris: 'household' as DebrisType,
  address: '',
  zip: '',
  date: '',
  name: '',
  phone: '',
  consent: false,
  error: '',
  busy: false,
  quote: null as Quote | null,
  quoteError: null as QuoteError | null,
  done: null as null | { orderNumber: string; message: string },
};

const HINTS: Record<DebrisType, string> = {
  household: 'Furniture, boxes, yard waste',
  construction: 'Drywall, flooring, roofing, wood',
  heavy: 'Heavy loads go in a 10 or 15-yard',
};

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function render() {
  const b = state.biz;
  if (!b) {
    root.innerHTML = '<div class="bw"><p class="muted">Loading prices…</p></div>';
    return;
  }
  if (state.done) {
    root.innerHTML = `<div class="bw"><div class="bw-done" role="status"><b>Request sent</b><p class="muted">${esc(state.done.message)}</p>
      <p class="small muted">Order ${esc(state.done.orderNumber)}</p><p style="margin-top:16px"><button type="button" class="btn-ghost" data-again>Book another</button></p></div></div>`;
    return;
  }
  const sizes = b.sizes.map((s) => ({ value: String(s.yards), label: `${s.yards}-yard`, hint: s.hint ?? undefined }));
  const debris = (Object.keys(DEBRIS_LABELS) as DebrisType[]).map((k) => ({ value: k, label: DEBRIS_LABELS[k], hint: HINTS[k] }));
  root.innerHTML = `<form class="bw" id="bw-form" novalidate>
    <h1>Get an instant price</h1><p class="small muted" style="margin:0">Prices come straight from ${esc(b.name)}'s price list. No account needed.</p>
    <div class="bw-grid">
      <div><span class="l" id="size-l">Dumpster size</span>${O.dropdown({ id: 'bw-size', label: 'Dumpster size', variant: 'field', labelledBy: 'size-l', value: state.yards, options: sizes })}</div>
      <div><label class="l" for="bw-days">Days</label><input class="input" id="bw-days" data-f="days" type="number" inputmode="numeric" min="1" max="60" value="${esc(state.days)}"></div>
      <div class="full"><span class="l" id="debris-l">What's going in</span>${O.dropdown({ id: 'bw-debris', label: "What's going in", variant: 'field', labelledBy: 'debris-l', value: state.debris, options: debris })}</div>
      <div class="full"><label class="l" for="bw-address">Delivery address</label><input class="input" id="bw-address" data-f="address" autocomplete="street-address" value="${esc(state.address)}"></div>
      <div><label class="l" for="bw-zip">ZIP code</label><input class="input" id="bw-zip" data-f="zip" inputmode="numeric" autocomplete="postal-code" maxlength="5" value="${esc(state.zip)}"></div>
      <div><span class="l" id="date-l">Delivery date</span>${O.datePicker({ id: 'bw-date', label: 'Delivery date', labelledBy: 'date-l', value: state.date, min: tomorrow(), placeholder: 'Pick a day' })}</div>
      <div><label class="l" for="bw-name">Your name</label><input class="input" id="bw-name" data-f="name" autocomplete="name" value="${esc(state.name)}"></div>
      <div><label class="l" for="bw-phone">Mobile number</label><input class="input" id="bw-phone" data-f="phone" type="tel" autocomplete="tel" value="${esc(state.phone)}"></div>
    </div>
    <div class="bw-quote" id="bw-quote" aria-live="polite">${quoteHtml()}</div>
    <label class="bw-consent ov-checkbox"><input type="checkbox" data-f="consent" ${state.consent ? 'checked' : ''}> <span id="consent-text">${esc(textConsentDisclosure(b.name))}</span></label>
    <p class="bw-err" id="bw-err" role="alert">${esc(state.error)}</p>
    <button class="btn-site" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Sending…' : 'Request this dumpster'}</button>
    <p class="bw-foot">Secure booking by Oraviq AI</p>
  </form>`;
  O.restore();
}

function quoteHtml(): string {
  const zip = state.zip.trim();
  if (!/^\d{5}$/.test(zip)) return '<span class="small muted">Enter your ZIP code to see your price.</span>';
  const q = state.quote;
  if (q) {
    const weight = q.heavyFlat ? 'Flat clean-fill price' : `${formatTons(q.includedTons!)} included<br>then ${formatMoney(q.overagePerTonCents!)} per ton`;
    return `<div><div class="small muted">${q.yards}-yard, ${q.days} days, delivered</div><div class="t">${formatMoney(q.totalCents)}</div></div><div class="small muted" style="text-align:right">${weight}</div>`;
  }
  const e = state.quoteError;
  if (!e) return '<span class="small muted">Checking your price…</span>';
  if (e.code === 'zone_not_served') return '<span class="small">We may still reach this ZIP. Send the request and we\'ll text you a price.</span>';
  if (e.code === 'heavy_not_allowed') return '<span class="small">Concrete, dirt and brick only go in a 10 or 15-yard. Pick one of those sizes.</span>';
  return `<span class="small">${esc(e.message)}</span>`;
}

let quoteTimer: ReturnType<typeof setTimeout> | undefined;
let quoteSeq = 0;
function refreshQuote() {
  clearTimeout(quoteTimer);
  const el = () => document.getElementById('bw-quote');
  state.quote = null;
  state.quoteError = null;
  const zip = state.zip.trim();
  if (!/^\d{5}$/.test(zip)) { const q = el(); if (q) q.innerHTML = quoteHtml(); return; }
  const q0 = el(); if (q0) q0.innerHTML = quoteHtml();
  const seq = ++quoteSeq;
  quoteTimer = setTimeout(async () => {
    try {
      const r = await api<{ ok: boolean; quote?: Quote; error?: QuoteError }>('/quote', {
        yards: Number(state.yards), days: Number(state.days) || undefined, zip, debris: state.debris,
      });
      if (seq !== quoteSeq) return;
      state.quote = r.ok && r.quote ? r.quote : null;
      state.quoteError = r.ok ? null : r.error ?? null;
    } catch (e) {
      if (seq !== quoteSeq) return;
      state.quoteError = { code: 'invalid_zip', message: (e as Error).message } as QuoteError;
    }
    const q = el(); if (q) q.innerHTML = quoteHtml();
  }, 250);
}

function validate(): string {
  if (!state.address.trim()) return 'Enter the delivery address.';
  if (!/^\d{5}$/.test(state.zip.trim())) return 'Enter a 5-digit ZIP code.';
  if (!state.date) return 'Pick a delivery date.';
  if (!state.name.trim()) return 'Enter your name.';
  if (state.phone.replace(/\D/g, '').length < 10) return 'Enter a 10-digit mobile number.';
  if (!state.consent) return 'Tick the box so we can text you about this order.';
  if (state.quoteError?.code === 'heavy_not_allowed') return 'Concrete, dirt and brick only go in a 10 or 15-yard.';
  return '';
}

async function submit() {
  state.error = validate();
  if (state.error) { const e = document.getElementById('bw-err'); if (e) e.textContent = state.error; return; }
  state.busy = true;
  render();
  try {
    const r = await api<PublicBookingResponse>('/booking', {
      yards: Number(state.yards), days: Number(state.days) || 7, debris: state.debris,
      address: state.address.trim(), zip: state.zip.trim(), deliveryDate: state.date,
      name: state.name.trim(), phone: state.phone.trim(), consent: true,
      consentText: textConsentDisclosure(state.biz!.name), pageUrl: document.referrer || undefined,
    });
    state.done = { orderNumber: r.orderNumber, message: r.message };
    post('oraviq:booked', { orderNumber: r.orderNumber });
  } catch (e) {
    state.error = (e as Error).message;
  }
  state.busy = false;
  render();
}

root.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  const f = el.dataset.f as keyof typeof state | undefined;
  if (!f) return;
  (state as Record<string, unknown>)[f] = el.type === 'checkbox' ? el.checked : el.value;
  if (state.error) { state.error = ''; const er = document.getElementById('bw-err'); if (er) er.textContent = ''; }
  if (f === 'zip' || f === 'days') refreshQuote();
});
root.addEventListener('ov-change', (e) => {
  const { id, value } = (e as CustomEvent<{ id: string; value: string }>).detail;
  if (id === 'bw-size') state.yards = value;
  if (id === 'bw-debris') state.debris = value as DebrisType;
  if (id === 'bw-date') state.date = value;
  if (id !== 'bw-date') refreshQuote();
});
root.addEventListener('submit', (e) => { e.preventDefault(); void submit(); });
root.addEventListener('click', (e) => {
  if ((e.target as Element).closest('[data-again]')) {
    Object.assign(state, { done: null, address: '', zip: '', date: '', name: '', phone: '', consent: false, quote: null, quoteError: null });
    render();
  }
});

applyAccent();
render();
autoResize(document.body);
api<PublicBusinessDto>('/business')
  .then((b) => { state.biz = b; applyAccent(new URLSearchParams(location.search).get('accent') ?? b.accentColor); render(); post('oraviq:ready'); })
  .catch(() => { root.innerHTML = '<div class="bw"><p>Online booking is unavailable right now. Please call us.</p></div>'; });
