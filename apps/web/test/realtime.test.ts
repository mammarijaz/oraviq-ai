import { describe, expect, it, vi } from 'vitest';
import { createRealtime } from '@/lib/realtime';
import { parsePushPayload } from '@/lib/push';

/** A tiny stand-in for a socket.io client socket. */
function fakeIo() {
  const sockets: FakeSocket[] = [];
  class FakeSocket {
    url: string;
    opts: { auth: (cb: (d: { token: string | null }) => void) => void };
    handlers = new Map<string, Array<(...a: unknown[]) => void>>();
    handshakes: Array<string | null> = [];
    connected = false;
    constructor(url: string, opts: FakeSocket['opts']) {
      this.url = url;
      this.opts = opts;
    }
    on(ev: string, fn: (...a: unknown[]) => void) {
      this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), fn]);
      return this;
    }
    fire(ev: string, ...a: unknown[]) {
      for (const fn of this.handlers.get(ev) ?? []) fn(...a);
    }
    connect() {
      this.opts.auth((d) => this.handshakes.push(d.token));
      return this;
    }
    disconnect() {
      this.connected = false;
      return this;
    }
  }
  const factory = vi.fn((url: string, opts: FakeSocket['opts']) => {
    const s = new FakeSocket(url, opts);
    sockets.push(s);
    return s;
  });
  return { factory, sockets };
}

describe('realtime client', () => {
  it('connects to /inbox with the current token and forwards events', () => {
    const { factory, sockets } = fakeIo();
    const onUpdated = vi.fn();
    let token = 'access-1';
    const rt = createRealtime({
      url: 'http://api',
      getToken: () => token,
      refresh: vi.fn(),
      handlers: { 'conversation.updated': onUpdated },
      ioFactory: factory as never,
    });
    rt.start();
    const s = sockets[0]!;
    expect(s.url).toBe('http://api/inbox');
    expect(s.handshakes).toEqual(['access-1']);
    s.fire('conversation.updated', { id: 'c1' });
    expect(onUpdated).toHaveBeenCalledWith({ id: 'c1' });

    // A later reconnect (built-in backoff) reads the token again.
    token = 'access-2';
    s.connect();
    expect(s.handshakes).toEqual(['access-1', 'access-2']);
  });

  it('refreshes the token and reconnects when the handshake is rejected', async () => {
    const { factory, sockets } = fakeIo();
    let token = 'expired';
    const refresh = vi.fn(async () => {
      token = 'fresh';
      return { accessToken: 'fresh', refreshToken: 'r2', expiresIn: 900 };
    });
    const rt = createRealtime({ url: 'http://api', getToken: () => token, refresh, handlers: {}, ioFactory: factory as never });
    rt.start();
    const s = sockets[0]!;
    s.fire('connect_error', Object.assign(new Error('Unauthorized'), { data: { message: 'jwt expired' } }));
    await vi.waitFor(() => expect(s.handshakes).toEqual(['expired', 'fresh']));
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('stops when the session is over', async () => {
    const { factory, sockets } = fakeIo();
    const onStatus = vi.fn();
    const rt = createRealtime({ url: 'http://api', getToken: () => 'x', refresh: async () => null, handlers: {}, ioFactory: factory as never, onStatus });
    rt.start();
    sockets[0]!.fire('connect_error', new Error('Unauthorized'));
    await vi.waitFor(() => expect(onStatus).toHaveBeenLastCalledWith('stopped'));
  });

  it('asks for a resync after reconnecting', () => {
    const { factory, sockets } = fakeIo();
    const onResync = vi.fn();
    const rt = createRealtime({ url: 'http://api', getToken: () => 'x', refresh: vi.fn(), handlers: {}, ioFactory: factory as never, onResync });
    rt.start();
    sockets[0]!.fire('connect');
    expect(onResync).not.toHaveBeenCalled();
    sockets[0]!.fire('disconnect', 'transport close');
    sockets[0]!.fire('connect');
    expect(onResync).toHaveBeenCalledTimes(1);
  });
});

describe('push payloads', () => {
  it('reads Declarative Web Push messages', () => {
    expect(parsePushPayload({ web_push: 8030, notification: { title: 'New order', body: '20-yard, $720', navigate: '/orders' } })).toMatchObject({
      title: 'New order',
      body: '20-yard, $720',
      url: '/orders',
    });
  });
  it('reads the plain realtime shape and rejects junk', () => {
    expect(parsePushPayload({ title: 'Needs you', body: 'Concrete in a 20-yard', href: '/inbox/c1' })).toMatchObject({ url: '/inbox/c1' });
    expect(parsePushPayload({ body: 'no title' })).toBeNull();
    expect(parsePushPayload('nope')).toBeNull();
  });
});
