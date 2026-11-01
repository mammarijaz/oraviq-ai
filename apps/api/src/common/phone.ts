import { formatPhone, toE164 } from '@oraviq/shared';

/** Normalises a phone number to E.164 (US numbers without +1 are assumed), or null. */
export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = String(input).trim();
  const digits = s.replace(/\D/g, '');
  if (s.startsWith('+')) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  return toE164(s);
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
