import type { NewsCard } from './types';

/**
 * Breaking news lasts 24 hours from when the story became breaking (owner,
 * 6 Nov 2026: "after 24 hours remove that breaking tag from the news"); the
 * rule is the API's (backend/src/newsroom/breaking.ts). The API already
 * reports a story as breaking only inside that time. This guard applies the
 * same rule again with the time the API sends (`breakingAt`), so a page
 * rendered from a response cached a moment before the end, here or in the
 * API, never shows a label that has run out.
 */
export const BREAKING_HOURS = 24;
const BREAKING_MS = BREAKING_HOURS * 3_600_000;

type BreakingCard = Pick<NewsCard, 'isBreaking' | 'breakingAt' | 'publishedAt'>;

/**
 * Whether the story is breaking at `now`. With no time from the API (an API
 * from before 6 Nov 2026) it counts from publication, as the /news banner
 * did then.
 */
export function breakingNow(card: BreakingCard, now = Date.now()): boolean {
  if (!card.isBreaking) return false;
  const since = Date.parse(card.breakingAt ?? card.publishedAt);
  return Number.isNaN(since) || now - since < BREAKING_MS;
}

/** The card as readers see it now: no Breaking label once its 24 hours are up. */
export function expireBreaking<T extends BreakingCard>(card: T, now = Date.now()): T {
  return card.isBreaking && !breakingNow(card, now)
    ? { ...card, isBreaking: false, breakingAt: null }
    : card;
}
