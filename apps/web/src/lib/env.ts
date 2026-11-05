const trim = (s: string) => s.replace(/\/+$/, '');

/**
 * VITE_SAME_ORIGIN=true: the one-origin test deployment (render.preview.yaml), where the API serves
 * this app at /, the widgets at /widgets and proxies the hauler site at /site.
 */
const sameOrigin = import.meta.env.VITE_SAME_ORIGIN === 'true' && typeof location !== 'undefined';
const origin = sameOrigin ? location.origin : '';

/** API origin (no /api/v1). */
export const API_URL = trim(sameOrigin ? origin : import.meta.env.VITE_API_URL || 'http://localhost:3000');
/** REST base. */
export const API_BASE = `${API_URL}/api/v1`;
/** Hauler sites app (Astro), used for the live website preview. */
export const SITES_URL = trim(sameOrigin ? `${origin}/site` : import.meta.env.VITE_SITES_URL || 'http://localhost:4321');
/** Widgets base URL: w.js loader and the chat/booking iframe apps. */
export const WIDGETS_URL = trim(sameOrigin ? `${origin}/widgets` : import.meta.env.VITE_WIDGETS_URL || 'http://localhost:5175');
