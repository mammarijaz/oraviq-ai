/** Defaults for a new tenant. Shared by registration and the seed. */
import { SAMPLE_PRICE_TABLE } from '@oraviq/pricing';
import { defaultGreeting } from '@oraviq/shared';
import { randomBytes } from 'node:crypto';
import { DEFAULT_BUSINESS_HOURS } from '../../common/time';
import { DEFAULT_SECTIONS } from '../site/site.service';
import { DEFAULT_REVIEW_TEMPLATE } from '../reviews/review-requests.service';

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/\b(co|inc|llc|ltd)\b\.?/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'hauler'
  );
}

export const newPublishableKey = () => `pk_${randomBytes(12).toString('hex')}`;

export function priceTableRules() {
  const { version: _v, currency: _c, ...rules } = SAMPLE_PRICE_TABLE;
  return rules;
}

export function receptionistDefaults(businessName: string) {
  return { enabled: true, mode: 'missed' as const, greeting: defaultGreeting(businessName).replace(/\.\./g, '.'), voice: 'warm' as const, transferWhenAsked: true, transferWhenOutsideRules: true, spanish: false, voiceProvider: 'mock' };
}

export function reviewRequestDefaults(businessName: string, reviewLink: string | null = null) {
  return { enabled: true, delayMinutes: 120, template: DEFAULT_REVIEW_TEMPLATE(businessName, reviewLink), reviewLink };
}

export function siteDefaults(businessName: string, city: string | null) {
  return {
    headline: `Dumpster rentals${city ? ` across ${city}` : ''}, delivered fast.`,
    intro: 'Get an instant price online or by text, day or night. Clear weight limits, no surprise fees, and drivers who put it where you ask.',
    accentColor: '#1F6B4F',
    sections: DEFAULT_SECTIONS,
    published: false,
    _business: businessName,
  };
}

export function widgetDefaults(businessName: string) {
  return {
    chatGreeting: `Hi, I'm ${businessName}'s automated assistant. Need a dumpster? Tell me the job or the size, and your ZIP code.`,
    chatButtonLabel: 'Get a price',
    chatPosition: 'right',
    accentColor: '#1F6B4F',
  };
}

export { DEFAULT_BUSINESS_HOURS };
