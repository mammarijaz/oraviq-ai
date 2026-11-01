const trim = (s: string) => s.replace(/\/+$/, '');

/** API origin (no /api/v1). */
export const API_URL = trim(import.meta.env.VITE_API_URL || 'http://localhost:3000');
/** REST base. */
export const API_BASE = `${API_URL}/api/v1`;
/** Hauler sites app (Astro), used for the live website preview. */
export const SITES_URL = trim(import.meta.env.VITE_SITES_URL || 'http://localhost:4321');
/** Widgets origin: w.js loader and the chat/booking iframe apps. */
export const WIDGETS_URL = trim(import.meta.env.VITE_WIDGETS_URL || 'http://localhost:5175');
