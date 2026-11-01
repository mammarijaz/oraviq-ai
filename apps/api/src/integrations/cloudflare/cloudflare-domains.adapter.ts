import { Logger } from '@nestjs/common';
import type { DomainsAdapter } from '../types';

/** Cloudflare for SaaS custom hostnames (POST /zones/{zone_id}/custom_hostnames, DV cert over HTTP). */
export class CloudflareDomainsAdapter implements DomainsAdapter {
  readonly provider = 'cloudflare' as const;
  private readonly logger = new Logger('Cloudflare');
  constructor(
    private readonly token: string,
    private readonly zoneId: string,
    private readonly fallbackOrigin: string,
  ) {}

  private async cf<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${this.zoneId}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || data?.success === false) {
      this.logger.warn(`${method} ${path} → ${res.status} ${JSON.stringify(data?.errors ?? data)}`);
      throw new Error(data?.errors?.[0]?.message ?? `Cloudflare request failed (${res.status})`);
    }
    return data.result as T;
  }

  private static mapStatus(r: any): 'pending' | 'active' | 'error' {
    if (r?.status === 'active' && (r?.ssl?.status ?? 'active') === 'active') return 'active';
    if (['blocked', 'moved', 'deleted'].includes(r?.status)) return 'error';
    return 'pending';
  }

  async createCustomHostname(hostname: string) {
    const r = await this.cf<any>('POST', '/custom_hostnames', { hostname, ssl: { method: 'http', type: 'dv', settings: { min_tls_version: '1.2' } } });
    return { id: r.id as string, status: CloudflareDomainsAdapter.mapStatus(r), dnsTarget: this.fallbackOrigin };
  }

  async getCustomHostname(id: string) {
    const r = await this.cf<any>('GET', `/custom_hostnames/${id}`);
    return { status: CloudflareDomainsAdapter.mapStatus(r) };
  }

  async purgeCache(hosts: string[]): Promise<void> {
    if (!hosts.length) return;
    await this.cf('POST', '/purge_cache', { hosts });
  }
}
