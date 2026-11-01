import type { AuthTokens } from '@oraviq/shared';
import type { TokenStore } from './client';

const KEY = 'oraviq.session';

type Listener = (tokens: AuthTokens | null) => void;
const listeners = new Set<Listener>();
let memory: AuthTokens | null | undefined;

function read(): AuthTokens | null {
  if (memory !== undefined) return memory;
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as AuthTokens) : null;
    memory = v && v.accessToken && v.refreshToken ? v : null;
  } catch {
    memory = null;
  }
  return memory;
}

/** Tokens persisted in localStorage so the PWA stays signed in; listeners hear every change. */
export const sessionTokens: TokenStore & { subscribe(l: Listener): () => void; reset(): void } = {
  get: read,
  set(tokens) {
    memory = tokens;
    try {
      if (tokens) globalThis.localStorage?.setItem(KEY, JSON.stringify(tokens));
      else globalThis.localStorage?.removeItem(KEY);
    } catch {
      /* storage blocked: keep the session in memory */
    }
    for (const l of listeners) l(tokens);
  },
  subscribe(l) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  /** Tests: forget the cached value. */
  reset() {
    memory = undefined;
  },
};
