import type { ReviewSummary, ReviewsAdapter } from '../types';

/** Replies "post" instantly; the summary is whatever was seeded (null = keep stored stats). */
export class MockReviewsAdapter implements ReviewsAdapter {
  readonly provider = 'mock';
  async reply(): Promise<{ ok: true }> {
    return { ok: true };
  }
  async fetchSummary(): Promise<ReviewSummary | null> {
    return null;
  }
}
