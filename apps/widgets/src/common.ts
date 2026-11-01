/** Shared plumbing for the iframe apps: URL params, hauler colour, API calls and the postMessage bridge. */
const params = new URLSearchParams(location.search);
export const KEY = params.get('key') ?? '';
export const API = (params.get('api') ?? (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3000').replace(/\/$/, '');
const parentOrigin = (() => {
  try { return new URL(params.get('origin') ?? '').origin; } catch { return '*'; }
})();
export const embedded = window.parent !== window;

export function applyAccent(color?: string | null) {
  const c = color && /^#[0-9a-f]{3,8}$/i.test(color) ? color : params.get('accent');
  if (c && /^#[0-9a-f]{3,8}$/i.test(c)) {
    document.documentElement.style.setProperty('--site', c);
    document.documentElement.style.setProperty('--ov-accent', c);
  }
}

export function post(type: string, data: Record<string, unknown> = {}) {
  if (embedded) window.parent.postMessage({ type, ...data }, parentOrigin);
}

/**
 * Keeps the host iframe as tall as the content, plus room for any open dropdown or calendar,
 * because a popover can't draw outside its iframe.
 */
export function autoResize(el: HTMLElement) {
  let last = 0;
  const send = () => {
    let h = el.getBoundingClientRect().height + 8;
    document.querySelectorAll<HTMLElement>('.ov-dd__panel:not([hidden]), .ov-date__panel:not([hidden])').forEach((p) => {
      const trigger = p.parentElement?.querySelector('.ov-dd__trigger, .ov-date__trigger');
      const below = (trigger?.getBoundingClientRect().bottom ?? 0) + window.scrollY + p.offsetHeight + 20;
      h = Math.max(h, below);
    });
    h = Math.ceil(h);
    if (Math.abs(h - last) > 1) { last = h; post('oraviq:resize', { height: h }); }
    // Ask the host page to scroll so an open dropdown or calendar is fully on screen.
    const open = document.querySelector<HTMLElement>('.ov-dd__panel:not([hidden]), .ov-date__panel:not([hidden])');
    if (open) {
      const r = open.getBoundingClientRect();
      if (r.height > 0) post('oraviq:reveal', { top: r.top, bottom: r.bottom });
    }
  };
  new ResizeObserver(send).observe(el);
  new MutationObserver(send).observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden'] });
  send();
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API}/api/v1/public/${encodeURIComponent(KEY)}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? { accept: 'application/json' } : { 'content-type': 'application/json', accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as { message?: string }).message ?? 'Something went wrong. Please try again.'), { status: res.status, data });
  return data as T;
}

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
