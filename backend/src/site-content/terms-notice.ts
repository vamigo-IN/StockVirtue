/**
 * No minimum notice yet: the owner and a lawyer decide how much notice users
 * get (W7 decision 5, 5 Nov 2026). Raising it makes the API refuse an
 * announcement date fewer than N days before the publish.
 *
 * The API is the only copy: GET staff/site/content/types returns it with the
 * terms profile, and the portal's terms dialog shows "Users must be told at
 * least {N} days before" only when N is above 0. Changing it is a code change
 * and a deploy. There is no scheduled "takes effect on" publish: publishing
 * is the moment a change takes effect (addendum §4.5).
 */
export const TERMS_MIN_NOTICE_DAYS = 0;

/** How users were told about a terms change that matters to them. */
export const ANNOUNCED_VIA = ['app', 'email', 'app+email'] as const;
export type AnnouncedVia = (typeof ANNOUNCED_VIA)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 330 * 60 * 1000;

/** The calendar day in India (YYYY-MM-DD) of a moment. */
export function istDay(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export type AnnouncementProblemCode = 'announcement_in_future' | 'announcement_too_recent';

/**
 * Null when `announcedAt` is early enough, else the refusal (§4.5). Compared
 * by calendar day in India: a date after today is refused at every N
 * (`announcement_in_future`); while N is above 0, so is one later than
 * today minus N days (`announcement_too_recent`). With N = 0 an
 * announcement made today (or earlier) passes.
 */
export function announcementProblem(
  announcedAt: Date,
  now: Date,
  minDays = TERMS_MIN_NOTICE_DAYS,
): { code: AnnouncementProblemCode; message: string } | null {
  const day = istDay(announcedAt);
  if (day > istDay(now)) {
    return { code: 'announcement_in_future', message: 'The date users were told can’t be in the future.' };
  }
  if (minDays > 0 && day > istDay(new Date(now.getTime() - minDays * DAY_MS))) {
    return {
      code: 'announcement_too_recent',
      message: `Users must be told at least ${minDays} days before the change takes effect.`,
    };
  }
  return null;
}
