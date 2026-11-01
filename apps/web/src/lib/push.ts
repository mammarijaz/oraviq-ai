/** Web push payload parsing, shared by the service worker and tests. */

export interface PushNotificationPayload {
  title: string;
  body?: string;
  url: string;
  tag?: string;
  icon?: string;
  badge?: string;
  silent?: boolean;
}

/** Accepts a Declarative Web Push message (web_push: 8030) or the plain { title, body, href } shape. */
export function parsePushPayload(data: unknown): PushNotificationPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const n = (d.web_push === 8030 && d.notification && typeof d.notification === 'object' ? d.notification : d) as Record<string, unknown>;
  const title = typeof n.title === 'string' ? n.title : null;
  if (!title) return null;
  const url = (typeof n.navigate === 'string' && n.navigate) || (typeof n.href === 'string' && n.href) || (typeof n.url === 'string' && n.url) || '/inbox';
  return {
    title,
    body: typeof n.body === 'string' ? n.body : undefined,
    url,
    tag: typeof n.tag === 'string' ? n.tag : undefined,
    icon: typeof n.icon === 'string' ? n.icon : '/icons/icon-192.png',
    badge: typeof n.badge === 'string' ? n.badge : undefined,
    silent: typeof n.silent === 'boolean' ? n.silent : undefined,
  };
}
