import type { PublicBusinessDto } from '@oraviq/shared';

const API = (import.meta.env.PUBLIC_API_URL ?? process.env.PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const BASE_DOMAIN = (process.env.SITES_BASE_DOMAIN ?? import.meta.env.SITES_BASE_DOMAIN ?? 'oraviq.site').toLowerCase();
const DEV_KEY = process.env.DEFAULT_SITE_KEY ?? import.meta.env.DEFAULT_SITE_KEY ?? 'pk_demo_rolloff';
/** Test deployments: the site to show when the host matches no hauler (e.g. an onrender.com address). Unset in production. */
const FALLBACK_KEY = process.env.SITES_FALLBACK_KEY || undefined;

export const WIDGETS_URL = (import.meta.env.PUBLIC_WIDGETS_URL ?? process.env.WIDGETS_URL ?? 'http://localhost:5175').replace(/\/$/, '');
/** API origin as the visitor's browser reaches it, passed to w.js (it guesses api.<domain> from widgets.<domain> otherwise). */
export const BROWSER_API_URL = (process.env.BROWSER_API_URL ?? '').replace(/\/$/, '') || undefined;

export interface ResolvedSite {
  key: string;
  business: PublicBusinessDto;
  host: string;
  canonical: string;
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API}/api/v1${path}`, { headers: { accept: 'application/json' } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** Host header → publishable key. `{slug}.oraviq.site` and custom hostnames are both resolved by the API. */
export async function resolveKey(host: string, url: URL): Promise<string | null> {
  const preview = url.searchParams.get('key');
  const isLocal = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  if (isLocal) return preview ?? DEV_KEY;
  if (preview && preview.startsWith('pk_') && url.searchParams.get('preview') === '1') return preview;
  const r = await getJson<{ key: string }>(`/public/sites/by-host/${encodeURIComponent(host)}`);
  return r?.key ?? FALLBACK_KEY ?? null;
}

export async function loadSite(host: string, url: URL): Promise<ResolvedSite | null> {
  const key = await resolveKey(host, url);
  if (!key) return null;
  const business = await getJson<PublicBusinessDto>(`/public/${encodeURIComponent(key)}/business`);
  if (!business) return null;
  const isLocal = /^(localhost|127\.0\.0\.1)/.test(host);
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const canonical = `${isLocal ? url.origin : `https://${host}`}${base}`;
  return { key, business, host, canonical };
}

export function slugFromHost(host: string): string | null {
  const h = host.toLowerCase().replace(/:\d+$/, '');
  return h.endsWith(`.${BASE_DOMAIN}`) ? h.slice(0, -(BASE_DOMAIN.length + 1)) : null;
}
