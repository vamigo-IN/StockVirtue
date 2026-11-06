/**
 * Dates on the legal pages and in the "We updated our privacy notice" lines
 * (W7 addendum §4.5, §5.6). Deterministic: every function formats the
 * instant it is given, as an India calendar day (Asia/Kolkata), and never
 * reads the clock. Absolute dates only, never relative time (spec §9.2).
 *
 *   formatLegalDate('2026-11-02T18:30:00.000Z')        → "3 November 2026"
 *   formatLegalDate('2026-11-02T18:30:00.000Z', 'hi')  → "3 नवंबर 2026" (Latin digits)
 *   formatShortDate('2027-09-14T04:00:00.000Z')        → "14 Sep 2027"
 *
 * Plain data and functions: server and client code (the portal) can use it.
 */

export const LEGAL_TIME_ZONE = 'Asia/Kolkata';

export type DateLang = 'en' | 'hi';

const LONG: Record<DateLang, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: LEGAL_TIME_ZONE,
  }),
  // `nu-latn`: Latin digits ("3 नवंबर 2026", as the seed and the notice's own text write them).
  hi: new Intl.DateTimeFormat('hi-IN-u-nu-latn', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: LEGAL_TIME_ZONE,
  }),
};

const PARTS = new Intl.DateTimeFormat('en-IN-u-nu-latn', {
  day: 'numeric',
  month: 'numeric',
  year: 'numeric',
  timeZone: LEGAL_TIME_ZONE,
});

/**
 * The footer line's short month names. Written out, not from Intl: ICU's
 * en-IN abbreviates September as "Sept", and the line is "14 Sep 2027"
 * (addendum §5.6), short so it stays one line at 390 px.
 */
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** An ISO string, a Date or epoch milliseconds as a Date; null when it isn't a valid instant. */
export function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** The India calendar day of an instant: { year, month (1–12), day }. */
export function indiaDay(value: string | number | Date): { year: number; month: number; day: number } | null {
  const d = toDate(value);
  if (!d) return null;
  const parts = PARTS.formatToParts(d);
  const num = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const year = num('year');
  const month = num('month');
  const day = num('day');
  return Number.isInteger(year) && Number.isInteger(month) && Number.isInteger(day) ? { year, month, day } : null;
}

/**
 * A legal page's "Updated" date and the notice lines' long date: "3 November
 * 2026", or "3 नवंबर 2026" in Hindi. '' for an invalid date.
 */
export function formatLegalDate(value: string | number | Date, lang: DateLang = 'en'): string {
  const d = toDate(value);
  return d ? LONG[lang === 'hi' ? 'hi' : 'en'].format(d) : '';
}

/** The footer notice line's short date: "14 Sep 2027". '' for an invalid date. */
export function formatShortDate(value: string | number | Date): string {
  const day = indiaDay(value);
  return day ? `${day.day} ${SHORT_MONTHS[day.month - 1]} ${day.year}` : '';
}

/**
 * What a legal revision shows after "Updated": the seed's literal label
 * (`dateLabel`, e.g. "June 27, 2026"), else `dateShown` formatted for the
 * page's language.
 */
export function legalUpdatedLabel(
  revision: { dateLabel?: string | null; dateShown?: string | null } | null | undefined,
  lang: DateLang = 'en',
): string {
  if (!revision) return '';
  if (typeof revision.dateLabel === 'string' && revision.dateLabel.trim()) return revision.dateLabel;
  return revision.dateShown ? formatLegalDate(revision.dateShown, lang) : '';
}
