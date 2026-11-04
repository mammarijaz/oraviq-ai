import { formatPhone, toE164 } from '@oraviq/shared';

/** Normalises a phone number to E.164 (US numbers without +1 are assumed), or null. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  return toE164(s);
}

/**
 * NANP area codes outside the US and Canada (Caribbean and Atlantic). Texts there are billed
 * at international rates and are the usual SMS-pumping targets. US territories stay allowed.
 */
export const BLOCKED_NANP_AREA_CODES = new Set(['242', '246', '264', '268', '284', '345', '441', '473', '649', '658', '664', '721', '758', '767', '784', '809', '829', '849', '868', '869', '876']);

/** True for an E.164 US/Canada number we may text: +1, a valid area code, not a blocked NANP destination. */
export function isTextableNumber(e164: string | null | undefined): boolean {
  const m = /^\+1([2-9]\d{2})[2-9]\d{6}$/.exec(String(e164 ?? ''));
  return !!m && !BLOCKED_NANP_AREA_CODES.has(m[1]);
}

export function displayPhone(e164: string | null | undefined): string {
  return e164 ? formatPhone(e164) : '';
}

/** Normalises a channel address for ContactIdentity uniqueness. */
export function normalizeAddress(channel: string, address: string): string {
  if (channel === 'sms' || channel === 'phone' || channel === 'booking_form' || channel === 'whatsapp') {
    return normalizePhone(address) ?? address.trim();
  }
  if (channel === 'email') return address.trim().toLowerCase();
  return address.trim();
}
