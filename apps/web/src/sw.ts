/**
 * Oraviq owner app service worker.
 *
 *  - Precaches the built app shell (vite-plugin-pwa injects the list into self.__WB_MANIFEST).
 *  - Navigations: network first, falling back to the cached index.html so the app opens offline.
 *  - Web push: handles `push` and `notificationclick`. Payloads may be Declarative Web Push
 *    (`{ web_push: 8030, notification: { title, body, navigate, ... } }`, which Safari shows without
 *    running this worker) or the simple `{ title, body, href }` shape of the realtime `notification` event.
 *
 * Written without workbox runtime imports and without the WebWorker lib (it clashes with DOM types in
 * the app's tsconfig), so the few service worker types it needs are declared here.
 */
import { parsePushPayload } from './lib/push';

interface PrecacheEntry {
  url: string;
  revision: string | null;
}
interface ExtendableEvent extends Event {
  waitUntil(p: Promise<unknown>): void;
}
interface FetchEvent extends ExtendableEvent {
  request: Request;
  respondWith(r: Response | Promise<Response>): void;
}
interface PushMessageData {
  json(): unknown;
  text(): string;
}
interface PushEvent extends ExtendableEvent {
  data: PushMessageData | null;
}
interface NotificationEvent extends ExtendableEvent {
  notification: Notification & { data?: { url?: string } };
  action: string;
}
interface WindowClient {
  url: string;
  focus(): Promise<WindowClient>;
  navigate(url: string): Promise<WindowClient | null>;
}
interface SwGlobal {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
  location: Location;
  registration: ServiceWorkerRegistration;
  clients: {
    matchAll(o: { type: 'window'; includeUncontrolled: boolean }): Promise<WindowClient[]>;
    openWindow(url: string): Promise<WindowClient | null>;
    claim(): Promise<void>;
  };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', l: (e: ExtendableEvent) => void): void;
  addEventListener(type: 'fetch', l: (e: FetchEvent) => void): void;
  addEventListener(type: 'push', l: (e: PushEvent) => void): void;
  addEventListener(type: 'notificationclick', l: (e: NotificationEvent) => void): void;
}

declare const self: SwGlobal;

const CACHE = 'oraviq-shell-v1';
const MANIFEST = self.__WB_MANIFEST;
const urls = MANIFEST.map((e) => (typeof e === 'string' ? e : e.url)).map((u) => new URL(u, self.location.href).href);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(urls))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // API, fonts, sites: straight to the network
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => (await caches.match(new URL('/index.html', self.location.href).href)) ?? Response.error()),
    );
    return;
  }
  if (urls.includes(url.href)) {
    event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req)));
  }
});

/* ------------------------------------------------------------------ web push */

self.addEventListener('push', (event) => {
  let raw: unknown = null;
  try {
    raw = event.data?.json() ?? null;
  } catch {
    raw = event.data ? { title: 'Oraviq AI', body: event.data.text() } : null;
  }
  const p = parsePushPayload(raw) ?? { title: 'Oraviq AI', body: 'Something new in your inbox.', url: '/inbox' };
  event.waitUntil(
    self.registration.showNotification(p.title, {
      body: p.body,
      tag: p.tag,
      icon: p.icon,
      badge: p.badge,
      silent: p.silent,
      data: { url: p.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/inbox', self.location.href).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
      const same = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (same) {
        await same.focus();
        if (same.url !== target) await same.navigate(target).catch(() => null);
        return;
      }
      await self.clients.openWindow(target);
    }),
  );
});
