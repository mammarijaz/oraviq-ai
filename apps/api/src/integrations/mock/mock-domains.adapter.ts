import { randomUUID } from 'node:crypto';
import type { DomainsAdapter } from '../types';

/** Custom hostnames go active instantly. */
export class MockDomainsAdapter implements DomainsAdapter {
  readonly provider = 'mock' as const;
  async createCustomHostname(): Promise<{ id: string; status: 'active'; dnsTarget: string }> {
    return { id: `mock_ch_${randomUUID()}`, status: 'active', dnsTarget: 'sites.oraviq.site' };
  }
  async getCustomHostname(): Promise<{ status: 'active' }> {
    return { status: 'active' };
  }
  async purgeCache(): Promise<void> {}
}
