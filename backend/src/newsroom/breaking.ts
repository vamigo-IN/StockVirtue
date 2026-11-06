import { Prisma } from '@prisma/client';

/**
 * How long a story is breaking news (owner, 6 Nov 2026: "after 24 hours
 * remove that breaking tag from the news"). The clock starts when the story
 * became breaking, `breakingAt`: when the switch was turned on for a live
 * story, or at publication for one that went out already marked.
 *
 * One clock for every reader: the /news banner, the Breaking label on cards
 * and story pages, the app and feed readers (toCard in
 * public/public-articles.ts all check it on every response), and the
 * worker's sweep that turns the switch off afterwards
 * (publishing/breaking-expiry.ts). Push alerts are a separate rule: they go
 * out only within 3 hours of first publication (push/news-push.service.ts).
 */
export const BREAKING_HOURS = 24;
export const BREAKING_MS = BREAKING_HOURS * 3_600_000;

export interface BreakingFields {
  isBreaking: boolean;
  breakingAt: Date | null;
  /**
   * Where the clock starts when no time was recorded: stories marked before
   * breakingAt existed (the migration fills those in), or a publish that
   * raced the switch. It is what the /news banner counted from until now.
   */
  publishedAt: Date | null;
}

/** When the story's breaking time started; null if it isn't breaking or isn't out yet. */
export function breakingSince(a: BreakingFields): Date | null {
  if (!a.isBreaking) return null;
  return a.breakingAt ?? a.publishedAt;
}

/** When the Breaking label comes off; null if it isn't breaking or isn't out yet. */
export function breakingUntil(a: BreakingFields): Date | null {
  const since = breakingSince(a);
  return since ? new Date(since.getTime() + BREAKING_MS) : null;
}

/** Whether readers see the story as breaking at `now`. */
export function isBreakingNow(a: BreakingFields, now = new Date()): boolean {
  const until = breakingUntil(a);
  return until !== null && now.getTime() < until.getTime();
}

/** Stories inside their breaking time (pair it with listedWhere for readers). */
export function breakingWhere(now = new Date()): Prisma.NewsArticleWhereInput {
  const cutoff = new Date(now.getTime() - BREAKING_MS);
  return {
    isBreaking: true,
    OR: [
      { breakingAt: { gt: cutoff } },
      { breakingAt: null, publishedAt: { gt: cutoff } },
    ],
  };
}

/** Stories still marked breaking whose time is up: the sweep turns them off. */
export function breakingEndedWhere(
  now = new Date(),
): Prisma.NewsArticleWhereInput {
  const cutoff = new Date(now.getTime() - BREAKING_MS);
  return {
    isBreaking: true,
    OR: [
      { breakingAt: { lte: cutoff } },
      { breakingAt: null, publishedAt: { lte: cutoff } },
    ],
  };
}

/**
 * The breakingAt to store when an editor sets the switch. Turned on for a
 * live story, the 24 hours start now (an already breaking story keeps its
 * start, so a repeated "on" never extends it); for a story that isn't out
 * yet they start at publication. Turned off, there is no start.
 */
export function breakingAtForSwitch(
  current: { isBreaking: boolean; breakingAt: Date | null },
  on: boolean,
  live: boolean,
  now: Date,
): Date | null {
  if (!on) return null;
  if (current.isBreaking && current.breakingAt) return current.breakingAt;
  return live ? now : null;
}

/**
 * What publishing adds for breakingAt: a story that goes out marked but has
 * no start yet starts its 24 hours now. One that was breaking before it was
 * taken down keeps its start.
 */
export function breakingAtOnPublish(
  a: { isBreaking: boolean; breakingAt: Date | null },
  now: Date,
): { breakingAt?: Date } {
  return a.isBreaking && !a.breakingAt ? { breakingAt: now } : {};
}
