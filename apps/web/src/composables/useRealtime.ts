import { onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from '@oraviq/ui';
import type { ServerToClientEvents } from '@oraviq/shared';
import { http } from '@/api';
import { sessionTokens } from '@/api/session';
import { API_URL } from '@/lib/env';
import { realtimeBus } from '@/lib/bus';
import { createRealtime, type Realtime, type RealtimeStatus } from '@/lib/realtime';
import { useAuthStore } from '@/stores/auth';
import { useInboxStore } from '@/stores/inbox';
import { useNavStore } from '@/stores/nav';
import { useOrdersStore } from '@/stores/orders';

/** "New order" + "New order: 20-yard to …" reads once; otherwise "Title. Body". */
export function notificationText(n: { title: string; body: string }): string {
  const title = n.title.trim().replace(/[.:]$/, '');
  const body = n.body.trim();
  if (!body) return title;
  if (body.toLowerCase().startsWith(title.toLowerCase())) return body;
  return `${title}. ${body}`.replace(/\.\./g, '.');
}

/** Store updates for each server event. Exported for tests. */
export function realtimeHandlers(stores: {
  inbox: ReturnType<typeof useInboxStore>;
  orders: ReturnType<typeof useOrdersStore>;
  nav: ReturnType<typeof useNavStore>;
  notify?: (n: { title: string; body: string; href?: string }) => void;
}): ServerToClientEvents {
  return {
    'conversation.updated': (c) => {
      stores.inbox.applyConversationUpdated(c);
      stores.nav.applyConversationUpdated(c);
      realtimeBus.emit('conversation.updated', c);
    },
    'message.created': (m) => {
      stores.inbox.applyMessageCreated(m);
      realtimeBus.emit('message.created', m);
    },
    'order.updated': (o) => {
      stores.orders.applyOrderUpdated(o);
      stores.inbox.applyOrderUpdated(o);
      realtimeBus.emit('order.updated', o);
    },
    'call.updated': (c) => realtimeBus.emit('call.updated', c),
    'review.created': (r) => {
      stores.nav.applyReviewCreated(r);
      realtimeBus.emit('review.created', r);
    },
    notification: (n) => {
      stores.notify?.(n);
      realtimeBus.emit('notification', n);
    },
  };
}

/** Connects the live inbox while signed in; reconnects with fresh tokens; resyncs after gaps. */
export function useRealtime() {
  const auth = useAuthStore();
  const inbox = useInboxStore();
  const orders = useOrdersStore();
  const nav = useNavStore();
  const router = useRouter();
  const { toast } = useToast();
  const status = ref<RealtimeStatus>('stopped');
  let rt: Realtime | null = null;

  const notify = (n: { title: string; body: string; href?: string }) => {
    const href = n.href;
    toast(notificationText(n), {
      tone: 'info',
      action: href ? { label: 'Open', onClick: () => void router.push(href) } : undefined,
    });
    // When the app is in the background, also show a system notification (if allowed).
    if (typeof document !== 'undefined' && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      try {
        navigator.serviceWorker?.ready.then((reg) => reg.showNotification(n.title, { body: n.body, data: { url: href ?? '/inbox' }, icon: '/icons/icon-192.png' }));
      } catch {
        /* notifications not available */
      }
    }
  };

  function start() {
    if (rt) return;
    rt = createRealtime({
      url: API_URL,
      getToken: () => sessionTokens.get()?.accessToken ?? null,
      refresh: () => http.refresh(),
      handlers: realtimeHandlers({ inbox, orders, nav, notify }),
      onStatus: (s) => (status.value = s),
      onResync: () => {
        void nav.load().catch(() => {});
        if (inbox.status !== 'idle') void inbox.fetch();
        if (inbox.selectedId) void inbox.fetchDetail(inbox.selectedId, { silent: true });
        if (orders.status !== 'idle') void orders.fetch();
      },
    });
    rt.start();
  }

  function stop() {
    rt?.stop();
    rt = null;
  }

  watch(
    () => auth.isAuthenticated,
    (on) => (on ? start() : stop()),
    { immediate: true },
  );
  onBeforeUnmount(stop);

  return { status };
}
