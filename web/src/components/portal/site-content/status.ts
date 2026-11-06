import { APP_FACTS, type FactId } from '@/content/app';
import { isReservedSlug, isValidSlug, SLUG_MAX_LENGTH, SLUG_MIN_LENGTH } from '@/content/site/reserved-ids';
import type { SiteContentItem } from '@/portal/types';
import type { StatusInfo } from './EditorBar';

/**
 * Small shared rules of the Pages list and the editors (W7 addendum §8.2,
 * §1.4, §3.12): an item's status badges, the facts that changed since its
 * live revision, and the custom-page address rules.
 */

/** The facts a live revision relied on that read differently today (§1.4). */
export function changedFacts(item: Pick<SiteContentItem, 'factsSnapshot'>): string[] {
  const snap = item.factsSnapshot;
  if (!snap || typeof snap !== 'object') return [];
  return Object.keys(snap).filter((id) => {
    const fact = APP_FACTS[id as FactId];
    return !fact || fact.text !== snap[id];
  });
}

/** The fact texts (F-id → text) a publish records, for the ids the content cites. */
export function factsSnapshotFor(ids: readonly string[]): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const id of ids) {
    const fact = APP_FACTS[id as FactId];
    if (fact) out[id] = fact.text;
  }
  return Object.keys(out).length ? out : undefined;
}

/** Built-in · Draft changes · Published · Hidden · Coming with the redesign (§8.2). */
export function statusOf(item: SiteContentItem, comingSoon = false): StatusInfo[] {
  if (comingSoon) return [{ label: 'Coming with the redesign', tone: 'muted' }];
  const out: StatusInfo[] = [];
  switch (item.status) {
    case 'BUILT_IN':
      out.push({ label: 'Built-in', tone: 'muted' });
      break;
    case 'DRAFT':
      // A fixed item with a draft but no publish still shows its built-in text.
      out.push(item.kind === 'CUSTOM' ? { label: 'Draft', tone: 'warning' } : { label: 'Built-in', tone: 'muted' });
      break;
    case 'LIVE':
      out.push({ label: 'Published', tone: 'success' });
      break;
    case 'HIDDEN':
      out.push({ label: 'Hidden', tone: 'muted' });
      break;
    default:
      out.push({ label: 'Archived', tone: 'muted' });
  }
  if (item.hasDraft && !(item.kind === 'CUSTOM' && item.status === 'DRAFT')) {
    out.push({ label: 'Draft changes', tone: 'warning' });
  }
  return out;
}

/** A first guess at an address from a title ("Refund policy" → "refund-policy"). */
export const slugify = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, '');

/** Why an address can't be used, or null (the API checks again). */
export function slugProblem(slug: string): string | null {
  if (!slug) return 'Give the page an address.';
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return `Use ${SLUG_MIN_LENGTH} to ${SLUG_MAX_LENGTH} characters.`;
  }
  // isValidSlug refuses reserved slugs too, so name that reason first.
  if (isReservedSlug(slug)) return 'That address is used by the site itself. Pick another.';
  if (!isValidSlug(slug)) return 'Use lowercase letters, digits and single hyphens (refund-policy).';
  return null;
}
