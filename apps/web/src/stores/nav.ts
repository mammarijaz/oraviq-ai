import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { ConversationSummaryDto, ReviewDto } from '@oraviq/shared';
import { api } from '@/api';

/** Live counts in the sidebar: conversations that need the owner, reviews waiting for a reply. */
export const useNavStore = defineStore('nav', () => {
  const needsYouIds = ref<Set<string>>(new Set());
  const reviewsWaiting = ref(0);
  const loaded = ref(false);

  const needsYou = computed(() => needsYouIds.value.size);

  async function load() {
    const ids = new Set<string>();
    let cursor: string | null = null;
    // Follow a few pages; a hauler with more than that open has bigger problems than the badge.
    for (let i = 0; i < 5; i++) {
      const page = await api.conversations.list({ state: 'needs_you', cursor, limit: 100 });
      for (const c of page.items) ids.add(c.id);
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    needsYouIds.value = ids;
    try {
      const r = await api.reviews.list();
      reviewsWaiting.value = r.stats.waitingForReply;
    } catch {
      /* the inbox count still matters; reviews may not be connected */
    }
    loaded.value = true;
  }

  function applyConversationUpdated(c: Pick<ConversationSummaryDto, 'id' | 'state'>) {
    const has = needsYouIds.value.has(c.id);
    if (c.state === 'needs_you' && !has) needsYouIds.value = new Set(needsYouIds.value).add(c.id);
    if (c.state !== 'needs_you' && has) {
      const next = new Set(needsYouIds.value);
      next.delete(c.id);
      needsYouIds.value = next;
    }
  }

  function applyReviewCreated(r: Pick<ReviewDto, 'reply'>) {
    if (!r.reply) reviewsWaiting.value += 1;
  }

  function setReviewsWaiting(n: number) {
    reviewsWaiting.value = Math.max(0, n);
  }

  function reset() {
    needsYouIds.value = new Set();
    reviewsWaiting.value = 0;
    loaded.value = false;
  }

  return { needsYouIds, needsYou, reviewsWaiting, loaded, load, applyConversationUpdated, applyReviewCreated, setReviewsWaiting, reset };
});
