import { HttpException, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Minimal Zernio REST client (https://docs.zernio.com).
 *  - Auth: `Authorization: Bearer <ZERNIO_API_KEY>`; base https://zernio.com/api, versioned paths (/v1/…).
 *  - Sends carry `Idempotency-Key` (same key + same body replays the original response).
 *  - Webhooks: `X-Zernio-Signature` = lowercase hex HMAC-SHA256 of the raw body with the endpoint secret.
 */
export class ZernioClient {
  private readonly logger = new Logger('Zernio');
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = 'https://zernio.com/api',
  ) {}

  async request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown, idempotencyKey?: string): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.apiKey}`, Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const text = await res.text();
    const data = text ? safeJson(text) : null;
    if (!res.ok) {
      const msg = (data as any)?.error?.message ?? (data as any)?.error ?? (data as any)?.message ?? res.statusText;
      this.logger.warn(`${method} ${path} → ${res.status}: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
      throw new HttpException({ statusCode: res.status >= 500 ? 502 : res.status, error: 'Provider error', message: `Zernio: ${typeof msg === 'string' ? msg : 'request failed'}`, providerStatus: res.status, providerCode: (data as any)?.code ?? null }, res.status >= 500 ? 502 : res.status);
    }
    return data as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

export function verifyZernioSignature(rawBody: Buffer | string, secret: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const given = signature.trim().toLowerCase().replace(/^sha256=/, '');
  if (!/^[a-f0-9]+$/.test(given)) return false;
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(given, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signZernio(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}
