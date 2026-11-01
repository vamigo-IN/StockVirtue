/**
 * Dates on the news site, always in India time. Cards show absolute times
 * (never "5 minutes ago"), because a cached page may be served for a while.
 */
const IST = 'Asia/Kolkata';

const DAY = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  day: 'numeric',
  month: 'short',
});
const DAY_YEAR = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const TIME = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
const YEAR = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST,
  year: 'numeric',
});

/** "1 Nov, 3:05 pm" (with the year when it isn't this year). */
export function cardTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const day =
    YEAR.format(d) === YEAR.format(now) ? DAY.format(d) : DAY_YEAR.format(d);
  return `${day}, ${TIME.format(d).toLowerCase()}`;
}

/** "1 Nov 2026, 3:05 pm IST" */
export function fullTime(iso: string): string {
  const d = new Date(iso);
  return `${DAY_YEAR.format(d)}, ${TIME.format(d).toLowerCase()} IST`;
}

/** "1 Nov 2026" */
export function dateOnly(iso: string): string {
  return DAY_YEAR.format(new Date(iso));
}

/** True when a story was meaningfully edited after it went live. */
export function wasUpdated(publishedAt: string, updatedAt: string): boolean {
  return (
    new Date(updatedAt).getTime() - new Date(publishedAt).getTime() > 5 * 60_000
  );
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-IN')} ${n === 1 ? one : many}`;
}
