import type { IconName } from '../icons';

export interface ChannelMeta {
  label: string;
  icon: IconName;
}

/**
 * Channel → label + icon. Keys follow @oraviq/shared CHANNELS (sms, phone, web_chat, …); the prototype's
 * display names ("SMS", "Phone call", "Website chat") are accepted as aliases.
 */
export const CHANNEL_META: Record<string, ChannelMeta> = {
  sms: { label: 'Text message', icon: 'chat' },
  phone: { label: 'Phone call', icon: 'phone' },
  web_chat: { label: 'Website chat', icon: 'globe' },
  booking_form: { label: 'Booking form', icon: 'calendar' },
  facebook: { label: 'Facebook', icon: 'facebook' },
  instagram: { label: 'Instagram', icon: 'instagram' },
  whatsapp: { label: 'WhatsApp', icon: 'whatsapp' },
  email: { label: 'Email', icon: 'mail' },
  google: { label: 'Google', icon: 'star' },
};

const ALIASES: Record<string, string> = {
  'text message': 'sms',
  text: 'sms',
  'phone call': 'phone',
  call: 'phone',
  'website chat': 'web_chat',
  webchat: 'web_chat',
  chat: 'web_chat',
  'booking form': 'booking_form',
  messenger: 'facebook',
  'facebook messenger': 'facebook',
};

export function channelKey(channel: string): string {
  const k = String(channel ?? '').trim().toLowerCase();
  if (CHANNEL_META[k]) return k;
  if (ALIASES[k]) return ALIASES[k];
  const snake = k.replace(/[\s-]+/g, '_');
  return CHANNEL_META[snake] ? snake : k;
}

export function channelMeta(channel: string): ChannelMeta {
  return CHANNEL_META[channelKey(channel)] ?? { label: channel, icon: 'chat' };
}

export function channelLabel(channel: string): string {
  return channelMeta(channel).label;
}
