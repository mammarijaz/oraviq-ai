import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { ConversationDetailDto, MessageDto } from '@oraviq/shared';
import { api, errorMessage, type SimulatorChannel } from '@/api';

/** The simulated customer: (404) 555-0199 by text, as in the prototype; the API picks ids for other channels. */
export const SIM_PHONE = '+14045550199';

/** The "Try it out" session: one simulated customer talking to the real inbound pipeline. */
export const useTryStore = defineStore('tryit', () => {
  const channel = ref<SimulatorChannel>('sms');
  const from = ref<string | undefined>(SIM_PHONE);
  /** The next message starts a new conversation (after Start over or a channel change). */
  const fresh = ref(true);
  const conversationId = ref<string | null>(null);
  const detail = ref<ConversationDetailDto | null>(null);
  /** Customer messages sent but not yet in the detail. */
  const pending = ref<MessageDto[]>([]);
  const sending = ref(false);
  const missedCall = ref(false);
  const error = ref<string | null>(null);

  async function refresh() {
    if (!conversationId.value) return;
    detail.value = await api.conversations.get(conversationId.value);
    const ids = new Set(detail.value.messages.map((m) => m.body + m.author));
    pending.value = pending.value.filter((m) => !ids.has(m.body + m.author));
  }

  async function send(body: string) {
    const text = body.trim();
    if (!text || sending.value) return;
    error.value = null;
    sending.value = true;
    pending.value = [
      ...pending.value,
      { id: `local_${Date.now()}`, conversationId: conversationId.value ?? '', author: 'customer', channel: channel.value, body: text, status: 'queued', createdAt: new Date().toISOString(), meta: 'Sending' },
    ];
    try {
      const r = await api.simulator.inbound({ channel: channel.value, from: from.value, body: text, newConversation: fresh.value || undefined });
      fresh.value = false;
      conversationId.value = r.conversationId;
      await refresh();
    } catch (e) {
      error.value = errorMessage(e);
      pending.value = pending.value.map((m) => (m.body === text && m.status === 'queued' ? { ...m, status: 'failed', meta: 'Not sent' } : m));
    } finally {
      sending.value = false;
    }
  }

  async function simulateMissedCall() {
    reset('sms');
    error.value = null;
    sending.value = true;
    try {
      const r = await api.simulator.missedCall({ from: from.value });
      fresh.value = false;
      conversationId.value = r.conversationId;
      missedCall.value = true;
      await refresh();
    } catch (e) {
      error.value = errorMessage(e);
    } finally {
      sending.value = false;
    }
  }

  function reset(next: SimulatorChannel = channel.value) {
    channel.value = next;
    from.value = next === 'sms' ? SIM_PHONE : undefined;
    fresh.value = true;
    conversationId.value = null;
    detail.value = null;
    pending.value = [];
    missedCall.value = false;
    error.value = null;
  }

  return { channel, from, fresh, conversationId, detail, pending, sending, missedCall, error, send, simulateMissedCall, refresh, reset };
});
