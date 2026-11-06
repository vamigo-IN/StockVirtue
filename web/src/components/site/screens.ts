import { SCREENS, type Screen, type ScreenId } from '@/content/screens';
import type { SiteScreen } from '@/content/site/types';

/**
 * Screens on the site pages (W7 addendum §11.3, spec §9.9): the content's
 * screen first, the SCREENS entry second, else none (the text-only layout,
 * a complete state; never a placeholder). Server-safe, no hooks.
 */
export function pickScreen(fromContent: SiteScreen | null | undefined, id: ScreenId): Screen | null {
  if (fromContent && typeof fromContent.src === 'string' && fromContent.src) return fromContent;
  return SCREENS[id] ?? null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "2026-11-28" → "28 Nov 2026" (read as written: no time zone involved), or null. */
export function capturedDate(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${day} ${MONTHS[month - 1]} ${m[1]}`;
}

/** "2026-11" → "November 2026" (About's timeline), or null. */
export function monthYear(ym: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(ym ?? '');
  if (!m) return null;
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? `${MONTHS_LONG[month - 1]} ${m[1]}` : null;
}

/**
 * A frame's caption (spec §9.5.2, §9.5.5): "{What the screen shows},
 * captured on {date}." ("The option chain, captured on 28 Nov 2026.").
 */
export function screenCaption(what: string | null | undefined, screen: Screen): string | null {
  const date = capturedDate(screen.captured);
  const name = (what ?? '').trim();
  if (!date) return name ? `${name}.` : null;
  return name ? `${name}, captured on ${date}.` : `Captured on ${date}.`;
}

/** "The order ticket" → "the order ticket" (the carousel's dot labels). */
export function lowerFirst(s: string): string {
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}
