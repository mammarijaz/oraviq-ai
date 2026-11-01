import { CALL_OUTCOME_LABELS, ORDER_STATUS_LABELS, type CallOutcome, type Channel, type ConversationSummaryDto, type OrderDto, type OrderStatus } from '@oraviq/shared';
import type { DropdownOption, IconName, StatusTone } from '@oraviq/ui';
import { channelLabel } from './format';

export const CHANNEL_ICONS: Record<string, IconName> = {
  sms: 'chat',
  phone: 'phone',
  web_chat: 'globe',
  booking_form: 'calendar',
  facebook: 'facebook',
  instagram: 'instagram',
  whatsapp: 'whatsapp',
  email: 'mail',
};

/** The channels shown in filters, in the prototype's order; others appear only when they have items. */
export const FILTER_CHANNELS: Channel[] = ['phone', 'sms', 'web_chat', 'booking_form', 'facebook', 'instagram'];

export function channelOptions(counts: Partial<Record<Channel, number>>, selected: Channel[] = []): DropdownOption[] {
  const extra = (Object.keys(counts) as Channel[]).filter((c) => !FILTER_CHANNELS.includes(c));
  return [...FILTER_CHANNELS, ...extra, ...selected.filter((c) => !FILTER_CHANNELS.includes(c) && !extra.includes(c))].map((c) => ({
    value: c,
    label: channelLabel(c),
    count: counts[c] ?? 0,
    icon: CHANNEL_ICONS[c] ?? 'chat',
  }));
}

export function conversationStatus(c: Pick<ConversationSummaryDto, 'state' | 'tag'>): { tone: StatusTone; label: string } {
  if (c.state === 'needs_you') return { tone: 'needs', label: c.tag || 'Needs you' };
  if (c.state === 'confirmed') return { tone: 'confirmed', label: c.tag || 'Confirmed' };
  if (c.state === 'closed') return { tone: 'info', label: c.tag || 'Closed' };
  return { tone: 'assistant', label: c.tag || 'Assistant handling' };
}

const VISITOR: Partial<Record<string, string>> = { web_chat: 'Website visitor', facebook: 'Facebook visitor', instagram: 'Instagram visitor', whatsapp: 'WhatsApp contact' };

export function contactName(
  c: { name: string | null; phone: string | null; company?: string | null; email?: string | null },
  formatPhone: (p: string) => string,
  channel?: string,
): string {
  const base = c.name || (c.phone ? formatPhone(c.phone) : '') || c.email || (channel && VISITOR[channel]) || 'Unknown customer';
  return c.company && c.name && c.company !== c.name ? `${base} (${c.company})` : base;
}

export function orderStatusTone(s: OrderStatus): StatusTone {
  if (s === 'requested') return 'needs';
  if (s === 'confirmed' || s === 'deposit_paid' || s === 'scheduled') return 'confirmed';
  if (s === 'cancelled') return 'danger';
  if (s === 'picked_up' || s === 'closed') return 'info';
  return 'neutral';
}

export function orderStatusLabel(s: OrderStatus): string {
  return ORDER_STATUS_LABELS[s];
}

/** The one next step offered on an order row, following ORDER_TRANSITIONS. */
export function nextStep(o: Pick<OrderDto, 'status'>): { status: OrderStatus; label: string; done: string } | null {
  switch (o.status) {
    case 'confirmed':
    case 'deposit_paid':
    case 'scheduled':
      return { status: 'delivered', label: 'Mark delivered', done: 'Marked delivered.' };
    case 'delivered':
    case 'pickup_requested':
      return { status: 'picked_up', label: 'Mark picked up', done: 'Marked picked up. The review request is scheduled.' };
    case 'picked_up':
      return { status: 'closed', label: 'Close order', done: 'Order closed.' };
    default:
      return null;
  }
}

export function canReschedule(o: Pick<OrderDto, 'status'>): boolean {
  return ['requested', 'confirmed', 'deposit_paid', 'scheduled'].includes(o.status);
}

export function depositLabel(o: Pick<OrderDto, 'depositPaid' | 'depositRequested'>): string {
  return o.depositPaid ? 'Paid' : o.depositRequested ? 'Link sent' : 'Not sent';
}

export function outcomeTone(o: CallOutcome): StatusTone {
  if (o === 'order_requested') return 'needs';
  if (o === 'sent_to_you') return 'info';
  return 'neutral';
}

export const outcomeLabel = (o: CallOutcome) => CALL_OUTCOME_LABELS[o];
