import { signRetell, verifyRetellSignature } from './mock/mock-voice-agent.adapter';
import { signZernio, verifyZernioSignature } from './zernio/zernio.client';

describe('webhook signatures', () => {
  it('Zernio: lowercase hex HMAC-SHA256 of the raw body', () => {
    const body = JSON.stringify({ id: 'evt_1', event: 'message.received' });
    const sig = signZernio(body, 'secret');
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyZernioSignature(body, 'secret', sig)).toBe(true);
    expect(verifyZernioSignature(body, 'secret', sig.toUpperCase())).toBe(true);
    expect(verifyZernioSignature(body + ' ', 'secret', sig)).toBe(false);
    expect(verifyZernioSignature(body, 'other', sig)).toBe(false);
    expect(verifyZernioSignature(body, 'secret', undefined)).toBe(false);
  });

  it('Retell: v=<ms>,d=<hmac(body + ts)> with a 5-minute window', () => {
    const body = '{"event":"call_started"}';
    const now = Date.now();
    const sig = signRetell(body, 'key_123', now);
    expect(verifyRetellSignature(body, 'key_123', sig, now)).toBe(true);
    expect(verifyRetellSignature(body, 'key_124', sig, now)).toBe(false);
    expect(verifyRetellSignature(body, 'key_123', sig, now + 6 * 60 * 1000)).toBe(false);
    expect(verifyRetellSignature(body, 'key_123', 'garbage', now)).toBe(false);
  });
});
