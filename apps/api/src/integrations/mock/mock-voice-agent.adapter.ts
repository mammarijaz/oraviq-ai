import { createHmac, timingSafeEqual } from 'node:crypto';
import type { VoiceAgentAdapter, VoiceAgentSync } from '../types';

/**
 * Mock voice agent: the rule-based voice brain (src/modules/voice) answers in-app
 * test calls. Signatures use the same v=…,d=… scheme as Retell with a dev key so
 * the webhook and custom-function paths can be exercised locally.
 */
export class MockVoiceAgentAdapter implements VoiceAgentAdapter {
  readonly provider = 'mock' as const;
  static readonly DEV_KEY = 'mock-retell-key';

  async syncAgent(input: VoiceAgentSync): Promise<{ agentId: string }> {
    return { agentId: input.settings.agentId ?? `mock_agent_${input.tenantId.slice(0, 8)}` };
  }

  verifySignature(rawBody: string, signature: string | undefined): boolean {
    if (!signature) return true; // mock mode accepts unsigned dev traffic
    return verifyRetellSignature(rawBody, MockVoiceAgentAdapter.DEV_KEY, signature);
  }
}

/** x-retell-signature: "v={unix_ms},d={hex hmac_sha256(key, body + timestamp)}", 5-minute window. */
export function verifyRetellSignature(rawBody: string, key: string, signature: string, now = Date.now()): boolean {
  const m = /v=(\d+),d=([a-f0-9]+)/i.exec(signature);
  if (!m) return false;
  const ts = Number(m[1]);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 5 * 60 * 1000) return false;
  const expected = createHmac('sha256', key).update(rawBody + m[1]).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(m[2], 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signRetell(rawBody: string, key: string, now = Date.now()): string {
  const d = createHmac('sha256', key).update(rawBody + String(now)).digest('hex');
  return `v=${now},d=${d}`;
}
