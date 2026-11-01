import { randomInt } from 'node:crypto';
import type { ProvisionedNumber, TelephonyAdapter } from '../types';

/** Fake numbers (NXX 555); the caller retries on the rare collision. Test calls always "connect". */
export class MockTelephonyAdapter implements TelephonyAdapter {
  readonly provider = 'mock';

  async provisionNumber(opts: { tenantId: string; areaCode?: string | null }): Promise<ProvisionedNumber> {
    const area = /^\d{3}$/.test(opts.areaCode ?? '') ? opts.areaCode! : '404';
    const line = String(randomInt(0, 10000)).padStart(4, '0');
    const e164 = `+1${area}555${line}`;
    return { e164, provider: this.provider, providerNumberId: `mock_num_${area}555${line}_${opts.tenantId.slice(0, 8)}` };
  }

  async placeTestCall(opts: { from: string; to: string }): Promise<{ ok: boolean; message: string }> {
    return { ok: true, message: `Test call placed from ${opts.from} to ${opts.to}. In mock mode the call always reaches your Oraviq number.` };
  }

  async startTextingRegistration(): Promise<{ status: 'pending' | 'in_review' | 'approved' }> {
    return { status: 'in_review' };
  }
}
