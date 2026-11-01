import { io, type Socket } from 'socket.io-client';
import type { AuthTokens, ServerToClientEvents } from '@oraviq/shared';

export type RealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'stopped';
export type InboxSocket = Socket<ServerToClientEvents, Record<string, never>>;

export interface RealtimeOptions {
  /** API origin; the namespace is `${url}/inbox`. */
  url: string;
  /** Current access token (read on every handshake, so reconnects use the fresh one). */
  getToken: () => string | null;
  /** Refresh the token pair; null means the session is over. */
  refresh: () => Promise<AuthTokens | null>;
  handlers: Partial<ServerToClientEvents>;
  /** After a reconnect: events may have been missed, so the caller refetches. */
  onResync?: () => void;
  onStatus?: (s: RealtimeStatus) => void;
  /** Tests inject a fake. */
  ioFactory?: typeof io;
}

const AUTH_ERROR = /unauthori[sz]ed|jwt|token|expired|forbidden|401/i;

/**
 * Socket.IO client for the `/inbox` namespace (auth `{ token }`).
 * - The auth payload is a callback, so every reconnect sends the latest access token.
 * - A rejected handshake (expired token) refreshes the token once and connects again.
 * - A server-side disconnect (e.g. token revoked mid-session) does the same.
 */
export function createRealtime(opts: RealtimeOptions) {
  const factory = opts.ioFactory ?? io;
  let connectedOnce = false;
  let refreshing = false;
  let stopped = false;
  /** Timestamps of recent refresh-and-reconnects, so a server that keeps kicking us can't loop forever. */
  let recent: number[] = [];

  const socket: InboxSocket = factory(`${opts.url}/inbox`, {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    auth: (cb: (data: object) => void) => cb({ token: opts.getToken() }),
  }) as InboxSocket;

  for (const [event, handler] of Object.entries(opts.handlers)) {
    socket.on(event as keyof ServerToClientEvents, handler as never);
  }

  async function refreshAndReconnect() {
    if (refreshing || stopped) return;
    const now = Date.now();
    recent = recent.filter((t) => now - t < 60_000);
    if (recent.length >= 3) {
      opts.onStatus?.('offline');
      return;
    }
    recent.push(now);
    refreshing = true;
    try {
      const t = await opts.refresh();
      if (!t) {
        stop();
        return;
      }
      if (!stopped) {
        socket.disconnect();
        socket.connect();
      }
    } catch {
      // Network trouble: the built-in reconnection keeps trying.
    } finally {
      refreshing = false;
    }
  }

  socket.on('connect', () => {
    opts.onStatus?.('connected');
    if (connectedOnce) opts.onResync?.();
    connectedOnce = true;
  });

  socket.on('connect_error', (err: Error & { data?: { message?: string } }) => {
    const text = `${err?.message ?? ''} ${err?.data?.message ?? ''}`;
    if (AUTH_ERROR.test(text)) void refreshAndReconnect();
    else opts.onStatus?.(connectedOnce ? 'reconnecting' : 'offline');
  });

  socket.on('disconnect', (reason: string) => {
    if (stopped) return;
    if (reason === 'io server disconnect') {
      // The server closed us (often an expired token): refresh, then connect again.
      opts.onStatus?.('reconnecting');
      void refreshAndReconnect();
    } else opts.onStatus?.('reconnecting');
  });

  function start() {
    stopped = false;
    opts.onStatus?.('connecting');
    socket.connect();
  }

  function stop() {
    stopped = true;
    socket.disconnect();
    opts.onStatus?.('stopped');
  }

  return { socket, start, stop, refreshAndReconnect };
}

export type Realtime = ReturnType<typeof createRealtime>;
