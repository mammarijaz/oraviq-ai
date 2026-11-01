import type { AuthTokens } from '@oraviq/shared';

/**
 * Typed fetch wrapper for the Oraviq API.
 *  - Adds `Authorization: Bearer <accessToken>`.
 *  - On a 401 it refreshes once through POST /auth/refresh (single flight: concurrent 401s share one
 *    refresh) and retries the request with the new token. If the refresh fails the session is cleared
 *    and `onSessionExpired` runs.
 *  - Errors become ApiError with a readable message and the `problems` list (price-table validation).
 */

export class ApiError extends Error {
  readonly status: number;
  readonly error: string | null;
  readonly problems: string[];
  readonly body: unknown;

  constructor(status: number, message: string, opts: { error?: string | null; problems?: string[]; body?: unknown } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.error = opts.error ?? null;
    this.problems = opts.problems ?? [];
    this.body = opts.body;
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}

export interface TokenStore {
  get(): AuthTokens | null;
  set(tokens: AuthTokens | null): void;
}

export type Query = Record<string, string | number | boolean | null | undefined | ReadonlyArray<string | number>>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** Send the bearer token and refresh on 401 (default true). */
  auth?: boolean;
  /** Extra request headers (e.g. Idempotency-Key). */
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface ApiClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  /** Called once when the refresh token is rejected (the user must sign in again). */
  onSessionExpired?: () => void;
  /** Called with the new tokens after every successful refresh. */
  onRefreshed?: (tokens: AuthTokens) => void;
  fetch?: typeof fetch;
}

const NETWORK_MESSAGE = "Can't reach Oraviq right now. Check your connection and try again.";
const EXPIRED_MESSAGE = 'Your session ended. Sign in again.';

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length) p.set(k, v.join(','));
    } else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const b = (body ?? {}) as { message?: unknown; error?: unknown; problems?: unknown };
  let message = '';
  let problems: string[] = Array.isArray(b.problems) ? b.problems.map(String) : [];
  if (Array.isArray(b.message)) {
    // class-validator style: message is a list of problems
    problems = problems.length ? problems : b.message.map(String);
    message = String(b.message[0] ?? '');
  } else if (typeof b.message === 'string') message = b.message;
  if (!message) message = defaultMessage(res.status);
  return new ApiError(res.status, message, { error: typeof b.error === 'string' ? b.error : null, problems, body });
}

function defaultMessage(status: number): string {
  if (status === 401) return EXPIRED_MESSAGE;
  if (status === 403) return "You don't have access to that.";
  if (status === 404) return "That doesn't exist any more.";
  if (status === 429) return 'Too many requests. Wait a moment and try again.';
  if (status >= 500) return 'Something went wrong on our side. Try again in a moment.';
  return 'That request did not work.';
}

export function createApiClient(opts: ApiClientOptions) {
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => globalThis.fetch(...a));
  let refreshing: Promise<AuthTokens | null> | null = null;

  async function rawRefresh(): Promise<AuthTokens | null> {
    const current = opts.tokens.get();
    if (!current?.refreshToken) return null;
    let res: Response;
    try {
      res = await doFetch(`${opts.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
    } catch {
      // Offline: keep the session, the caller sees a network error.
      throw new ApiError(0, NETWORK_MESSAGE);
    }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403 || res.status === 400) {
        opts.tokens.set(null);
        opts.onSessionExpired?.();
        return null;
      }
      throw await toApiError(res);
    }
    const tokens = (await res.json()) as AuthTokens;
    opts.tokens.set(tokens);
    opts.onRefreshed?.(tokens);
    return tokens;
  }

  /** Refresh the access token; concurrent callers share one request. */
  function refresh(): Promise<AuthTokens | null> {
    if (!refreshing) {
      refreshing = rawRefresh().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  async function request<T>(method: string, path: string, o: RequestOptions = {}): Promise<T> {
    const auth = o.auth !== false;
    const url = `${opts.baseUrl}${path}${buildQuery(o.query)}`;

    const send = (token: string | null) => {
      const headers: Record<string, string> = { accept: 'application/json', ...(o.headers ?? {}) };
      if (o.body !== undefined) headers['content-type'] = 'application/json';
      if (auth && token) headers.authorization = `Bearer ${token}`;
      return doFetch(url, { method, headers, body: o.body === undefined ? undefined : JSON.stringify(o.body), signal: o.signal });
    };

    let res: Response;
    try {
      // If a refresh is already running, wait for it instead of sending a token we know is stale.
      if (auth && refreshing) await refreshing.catch(() => null);
      res = await send(auth ? (opts.tokens.get()?.accessToken ?? null) : null);
      if (res.status === 401 && auth && opts.tokens.get()?.refreshToken) {
        const fresh = await refresh();
        if (!fresh) throw new ApiError(401, EXPIRED_MESSAGE);
        res = await send(fresh.accessToken);
        if (res.status === 401) {
          opts.tokens.set(null);
          opts.onSessionExpired?.();
          throw new ApiError(401, EXPIRED_MESSAGE);
        }
      }
    } catch (e) {
      if (e instanceof ApiError) throw e;
      if ((e as { name?: string })?.name === 'AbortError') throw e;
      throw new ApiError(0, NETWORK_MESSAGE);
    }

    if (!res.ok) throw await toApiError(res);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  return {
    request,
    refresh,
    get: <T>(path: string, o?: RequestOptions) => request<T>('GET', path, o),
    post: <T>(path: string, body?: unknown, o?: RequestOptions) => request<T>('POST', path, { ...o, body }),
    put: <T>(path: string, body?: unknown, o?: RequestOptions) => request<T>('PUT', path, { ...o, body }),
    patch: <T>(path: string, body?: unknown, o?: RequestOptions) => request<T>('PATCH', path, { ...o, body }),
    del: <T>(path: string, o?: RequestOptions) => request<T>('DELETE', path, o),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/** A readable message for any thrown value. */
export function errorMessage(e: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}
