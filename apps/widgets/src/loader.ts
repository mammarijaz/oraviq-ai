/*
 * Oraviq widgets loader (w.js). Self-contained on purpose: no imports, no exports, so it runs as a classic
 * <script> on any site (WordPress, Wix, Squarespace, GoDaddy) and stays tiny.
 *
 *   <script async src="https://widgets.oraviq.com/w.js" data-key="pk_…"></script>
 *   <div data-oraviq-booking></div>
 *
 * See docs/widgets.md for the full contract.
 */
(function () {
  type Business = { name: string; accentColor: string; chat: { buttonLabel: string; position: 'left' | 'right' } };
  const w = window as unknown as { OraviqWidgets?: { openChat: () => void; closeChat: () => void; version: string } };
  if (w.OraviqWidgets) return; // loaded twice: keep the first

  const script = (document.currentScript as HTMLScriptElement | null) ??
    (document.querySelector('script[data-key][src*="w.js"], script[data-oraviq]') as HTMLScriptElement | null);
  if (!script) return;
  const key = script.getAttribute('data-key') ?? '';
  if (!/^pk_[A-Za-z0-9_]+$/.test(key)) { console.warn('[Oraviq] data-key is missing or invalid'); return; }

  const scriptUrl = new URL(script.src || location.href, location.href);
  // Widgets base: the folder w.js came from (https://widgets.oraviq.com, or https://host/widgets on a one-origin test deployment).
  const WIDGETS = (script.getAttribute('data-widgets-url') ?? new URL('.', scriptUrl).href).replace(/\/$/, '');
  const WIDGETS_ORIGIN = new URL(WIDGETS, location.href).origin;
  // Guess the API when data-api-url is absent: the widgets dev server (:5175) → the dev API (:3000);
  // widgets.<domain> → api.<domain>; anything else (the one-origin test deployment) → the same origin.
  const devServer = /^(localhost|127\.0\.0\.1)$/.test(scriptUrl.hostname) && scriptUrl.port === '5175';
  const guessedApi = devServer ? 'http://localhost:3000' : scriptUrl.hostname.startsWith('widgets.') ? scriptUrl.origin.replace('//widgets.', '//api.') : scriptUrl.origin;
  const API = (script.getAttribute('data-api-url') ?? guessedApi).replace(/\/$/, '');
  const accentAttr = script.getAttribute('data-accent');
  const chatOn = script.getAttribute('data-chat') !== 'false';
  const posAttr = script.getAttribute('data-position') as 'left' | 'right' | null;

  const frameUrl = (page: 'chat' | 'book', accent: string, extra = '') =>
    `${WIDGETS}/${page}.html?key=${encodeURIComponent(key)}&accent=${encodeURIComponent(accent)}&api=${encodeURIComponent(API)}&origin=${encodeURIComponent(location.origin)}${extra}`;

  const fallback: Business = { name: '', accentColor: accentAttr ?? '#40454D', chat: { buttonLabel: 'Get a price', position: posAttr ?? 'right' } };
  const bizPromise: Promise<Business> = fetch(`${API}/api/v1/public/${encodeURIComponent(key)}/business`)
    .then((r) => (r.ok ? r.json() : fallback))
    .catch(() => fallback);

  /* ---------------- chat: launcher in a Shadow DOM, panel is an iframe on our origin ---------------- */
  let chatFrame: HTMLIFrameElement | null = null;
  let panel: HTMLDivElement | null = null;
  let launcher: HTMLButtonElement | null = null;
  let isOpen = false;
  let chatAccent = '#40454D';

  function mountChat(b: Business) {
    const accent = accentAttr ?? b.accentColor ?? '#40454D';
    const pos = posAttr ?? b.chat?.position ?? 'right';
    const host = document.createElement('div');
    host.setAttribute('data-oraviq-chat', '');
    host.style.cssText = 'position:fixed;z-index:2147483000;bottom:0;' + (pos === 'left' ? 'left:0;' : 'right:0;');
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      :host{all:initial}
      .l{position:fixed;bottom:20px;${pos}:20px;display:inline-flex;align-items:center;gap:8px;min-height:48px;padding:0 20px;border-radius:999px;border:0;
         background:${accent};color:#fff;font:600 15px/1 "Red Hat Text",system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(64,69,77,.22)}
      .l:focus-visible{outline:2px solid #40454D;outline-offset:3px}
      .l svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
      .p{position:fixed;bottom:80px;${pos}:20px;width:360px;height:540px;max-height:calc(100vh - 100px);border-radius:24px;overflow:hidden;
         box-shadow:0 16px 40px rgba(64,69,77,.24);border:1px solid #E3E5E8;background:#fff;display:none}
      .p.open{display:block}
      .p iframe{border:0;width:100%;height:100%;display:block}
      @media (max-width:480px){.p{inset:0;width:100%;height:100%;max-height:none;border-radius:0;border:0}.p.open+.l{display:none}}
      @media (prefers-reduced-motion:no-preference){.p.open{animation:in .18s ease-out}@keyframes in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}}
    </style>
    <div class="p" part="panel" role="dialog" aria-label="Chat with ${escapeHtml(b.name || 'us')}"></div>
    <button type="button" class="l" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span></span></button>`;
    panel = root.querySelector('.p');
    launcher = root.querySelector('.l');
    launcher!.querySelector('span')!.textContent = b.chat?.buttonLabel || 'Chat';
    launcher!.addEventListener('click', () => (isOpen ? closeChat() : openChat()));
    chatAccent = accent;
  }

  function openChat() {
    if (!panel) return;
    if (!chatFrame) {
      chatFrame = document.createElement('iframe');
      chatFrame.title = 'Chat';
      chatFrame.src = frameUrl('chat', chatAccent);
      chatFrame.allow = 'clipboard-write';
      panel.appendChild(chatFrame);
    } else {
      chatFrame.contentWindow?.postMessage({ type: 'oraviq:open' }, WIDGETS_ORIGIN);
    }
    panel.classList.add('open');
    launcher?.setAttribute('aria-expanded', 'true');
    isOpen = true;
  }
  function closeChat() {
    panel?.classList.remove('open');
    launcher?.setAttribute('aria-expanded', 'false');
    isOpen = false;
    launcher?.focus();
  }

  /* ---------------- booking: inline iframes that size themselves ---------------- */
  const bookingFrames: HTMLIFrameElement[] = [];
  function mountBookings(b: Business) {
    document.querySelectorAll<HTMLElement>('[data-oraviq-booking]').forEach((el) => {
      if (el.dataset.oraviqMounted) return;
      el.dataset.oraviqMounted = '1';
      const k = el.getAttribute('data-key');
      const accent = el.getAttribute('data-accent') ?? accentAttr ?? b.accentColor ?? '#40454D';
      const f = document.createElement('iframe');
      f.title = 'Get an instant price';
      f.src = k && k !== key ? frameUrl('book', accent).replace(`key=${encodeURIComponent(key)}`, `key=${encodeURIComponent(k)}`) : frameUrl('book', accent);
      f.style.cssText = 'border:0;width:100%;max-width:680px;height:720px;display:block;background:transparent;color-scheme:light';
      f.setAttribute('loading', 'lazy');
      el.querySelectorAll('noscript').forEach((n) => n.remove());
      el.appendChild(f);
      bookingFrames.push(f);
    });
  }

  window.addEventListener('message', (e: MessageEvent) => {
    if (e.origin !== WIDGETS_ORIGIN || !e.data || typeof e.data.type !== 'string') return;
    const src = e.source as Window | null;
    if (e.data.type === 'oraviq:resize') {
      const f = bookingFrames.find((x) => x.contentWindow === src);
      if (f && typeof e.data.height === 'number') f.style.height = `${Math.ceil(e.data.height) + 4}px`;
    } else if (e.data.type === 'oraviq:reveal' && typeof e.data.bottom === 'number') {
      const f = bookingFrames.find((x) => x.contentWindow === src);
      if (f) {
        const top = f.getBoundingClientRect().top;
        const overflow = top + e.data.bottom + 16 - window.innerHeight;
        if (overflow > 0) window.scrollBy({ top: Math.min(overflow, Math.max(0, top + e.data.top - 16)), behavior: 'smooth' });
      }
    } else if (e.data.type === 'oraviq:close' && chatFrame && src === chatFrame.contentWindow) {
      closeChat();
    } else if (e.data.type === 'oraviq:booked') {
      document.dispatchEvent(new CustomEvent('oraviq:booked', { detail: { orderNumber: e.data.orderNumber } }));
    }
  });

  document.addEventListener('click', (e) => {
    const t = (e.target as Element | null)?.closest?.('[data-oraviq-open-chat]');
    if (t) { e.preventDefault(); openChat(); }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOpen) closeChat(); });

  function start() {
    bizPromise.then((b) => {
      if (chatOn) mountChat(b);
      mountBookings(b);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  w.OraviqWidgets = { openChat, closeChat, version: '1' };

  function escapeHtml(s: string) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  }
})();
