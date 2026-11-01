import { api } from '@/api';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

export type PushResult = 'subscribed' | 'denied' | 'unsupported' | 'no-key' | 'no-worker';

/**
 * Turn on notifications for this device. Prefers Declarative Web Push (window.pushManager, Safari 18.4+),
 * where the browser shows the notification without a service worker; otherwise subscribes through ours.
 */
export async function subscribeToPush(): Promise<PushResult> {
  if (!('Notification' in window)) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const { publicKey } = await api.notifications.pushKey();
  if (!publicKey) return 'no-key';
  const declarative = (window as unknown as { pushManager?: PushManager }).pushManager;
  let manager: PushManager | null = declarative ?? null;
  if (!manager) {
    if (!('serviceWorker' in navigator)) return 'unsupported';
    const reg = await withTimeout(navigator.serviceWorker.ready, 4000);
    if (!reg) return 'no-worker';
    manager = reg.pushManager;
  }
  const sub = (await manager.getSubscription()) ?? (await manager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'unsupported';
  await api.notifications.subscribe({ endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } });
  return 'subscribed';
}
