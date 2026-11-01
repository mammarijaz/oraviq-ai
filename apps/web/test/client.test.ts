import { describe, expect, it, vi } from 'vitest';
import type { AuthTokens } from '@oraviq/shared';
import { ApiError, buildQuery, createApiClient, type TokenStore } from '@/api/client';
import { jsonResponse } from './fixtures';

function memoryTokens(initial: AuthTokens | null): TokenStore & { value: AuthTokens | null } {
  const s = {
    value: initial,
    get: () => s.value,
    set: (t: AuthTokens | null) => {
      s.value = t;
    },
  };
  return s;
}

const T1: AuthTokens = { accessToken: 'old-access', refreshToken: 'refresh-1', expiresIn: 900 };
const T2: AuthTokens = { accessToken: 'new-access', refreshToken: 'refresh-2', expiresIn: 900 };

/** A typed fetch mock whose handler gets the URL as a string. */
function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => handler(String(input), init));
}

/** Awaits a request that must fail and returns its ApiError. */
async function failure(p: Promise<unknown>): Promise<ApiError> {
  try {
    await p;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('expected the request to fail');
}

const authHeader = (init?: RequestInit) => (init?.headers as Record<string, string> | undefined)?.authorization;

describe('api client', () => {
  it('sends the bearer token and parses JSON', async () => {
    const fetch = vi.fn(async () => jsonResponse({ ok: true }));
    const c = createApiClient({ baseUrl: 'http://api/api/v1', tokens: memoryTokens(T1), fetch });
    await expect(c.get('/tenant')).resolves.toEqual({ ok: true });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api/api/v1/tenant');
    expect(authHeader(init)).toBe('Bearer old-access');
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const tokens = memoryTokens(T1);
    const onRefreshed = vi.fn();
    const fetch = mockFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        expect(JSON.parse(String(init?.body))).toEqual({ refreshToken: 'refresh-1' });
        return jsonResponse(T2);
      }
      return authHeader(init) === 'Bearer new-access' ? jsonResponse({ items: [] }) : jsonResponse({ statusCode: 401, message: 'Unauthorized' }, 401);
    });
    const c = createApiClient({ baseUrl: 'http://api', tokens, fetch, onRefreshed });
    await expect(c.get('/orders')).resolves.toEqual({ items: [] });
    expect(tokens.value).toEqual(T2);
    expect(onRefreshed).toHaveBeenCalledWith(T2);
    expect(fetch.mock.calls.filter(([u]) => String(u).endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('shares one refresh between concurrent 401s', async () => {
    const tokens = memoryTokens(T1);
    let refreshCalls = 0;
    const fetch = mockFetch(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return jsonResponse(T2);
      }
      return authHeader(init) === 'Bearer new-access' ? jsonResponse({ url }) : jsonResponse({ message: 'Unauthorized' }, 401);
    });
    const c = createApiClient({ baseUrl: 'http://api', tokens, fetch });
    const results = await Promise.all([c.get('/a'), c.get('/b'), c.get('/c')]);
    expect(results).toEqual([{ url: 'http://api/a' }, { url: 'http://api/b' }, { url: 'http://api/c' }]);
    expect(refreshCalls).toBe(1);
  });

  it('clears the session and reports expiry when the refresh token is rejected', async () => {
    const tokens = memoryTokens(T1);
    const onSessionExpired = vi.fn();
    const fetch = mockFetch(async (url: string) =>
      url.endsWith('/auth/refresh') ? jsonResponse({ message: 'Invalid refresh token' }, 401) : jsonResponse({ message: 'Unauthorized' }, 401),
    );
    const c = createApiClient({ baseUrl: 'http://api', tokens, fetch, onSessionExpired });
    const err = await failure(c.get('/orders'));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(tokens.value).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('does not try to refresh for unauthenticated calls such as login', async () => {
    const fetch = vi.fn(async () => jsonResponse({ statusCode: 401, error: 'Unauthorized', message: 'Wrong email or password.' }, 401));
    const c = createApiClient({ baseUrl: 'http://api', tokens: memoryTokens(T1), fetch });
    const err = await failure(c.post('/auth/login', { email: 'a', password: 'b' }, { auth: false }));
    expect(err.message).toBe('Wrong email or password.');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('turns error bodies into ApiError with message and problems', async () => {
    const fetch = vi.fn(async () =>
      jsonResponse({ statusCode: 400, error: 'Bad Request', message: 'The price table has problems.', problems: ['The 20-yard needs a base price.'] }, 400),
    );
    const c = createApiClient({ baseUrl: 'http://api', tokens: memoryTokens(T1), fetch });
    const err = await failure(c.put('/pricing', {}));
    expect(err.status).toBe(400);
    expect(err.message).toBe('The price table has problems.');
    expect(err.problems).toEqual(['The 20-yard needs a base price.']);
  });

  it('maps class-validator message arrays to problems', async () => {
    const fetch = vi.fn(async () => jsonResponse({ statusCode: 400, message: ['email must be an email', 'password is too short'] }, 400));
    const c = createApiClient({ baseUrl: 'http://api', tokens: memoryTokens(null), fetch });
    const err = await failure(c.post('/auth/register', {}, { auth: false }));
    expect(err.message).toBe('email must be an email');
    expect(err.problems).toHaveLength(2);
  });

  it('reports network failures as status 0 with a readable message', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const c = createApiClient({ baseUrl: 'http://api', tokens: memoryTokens(T1), fetch });
    const err = await failure(c.get('/tenant'));
    expect(err.isNetwork).toBe(true);
    expect(err.message).toMatch(/can't reach oraviq/i);
  });

  it('builds query strings with lists and skips empties', () => {
    expect(buildQuery({ state: 'needs_you', channel: ['sms', 'facebook'], q: '', cursor: null })).toBe('?state=needs_you&channel=sms%2Cfacebook');
    expect(buildQuery({ channel: [] })).toBe('');
  });
});
