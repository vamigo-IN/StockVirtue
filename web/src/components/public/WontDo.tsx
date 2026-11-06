import { factValue } from '@/components/site-content/FactText';
import { WONT_DO } from '@/content/app';
import type { WontDoContent } from '@/content/site/types';
import { cn } from '@/lib/utils';
import { QuietLink } from './Button';

/**
 * "What it won't do" (spec §4.11, §9.4): the canonical list of the
 * simulator's limits, on /features (full) and on the home page.
 *
 * `<aside aria-labelledby="wont-do">`, a 1 px `--sv-fg` border, radius 12,
 * padding 24/32. The heading (`title` 20/26, 700) carries id="wont-do", so
 * /features#wont-do lands on it: don't put another "wont-do" id on the page.
 *
 * `compact` (home page): below 768 px each item shows only its bold lead
 * phrase, and a quiet link "Why these limits" goes to /features#wont-do.
 * From 768 px a compact list reads in full, like the canonical one.
 *
 * The copy: `content`, the shared `wont-do` item (W7 addendum §3.9, §11.2:
 * getSharedContent('wont-do'), the published item merged over
 * WONT_DO_DEFAULT), whose item bodies are fact fields rendered through
 * withFacts (a body whose fact isn't confirmed shows its fallback, and a
 * null fallback leaves the lead alone). Left out, WONT_DO from
 * src/content/app.ts, the same words. The compact link's target stays
 * /features#wont-do (fixed in code). Server component.
 */
export function WontDo({
  headingLevel,
  compact = false,
  headingId = 'wont-do',
  content,
  className,
}: {
  headingLevel: 'h2' | 'h3';
  compact?: boolean;
  /** Additive: the heading's id. Keep the default ("wont-do", the
   *  /features#wont-do target) except where two lists share a page. */
  headingId?: string;
  /** The shared `wont-do` item; WONT_DO when left out. */
  content?: WontDoContent;
  className?: string;
}) {
  const H = headingLevel;
  const copy = content
    ? {
        heading: content.heading,
        intro: content.intro,
        moreLabel: content.moreLabel,
        items: content.items.map((item) => ({
          key: item.id || item.lead,
          lead: item.lead,
          body: factValue(item.body),
        })),
      }
    : {
        heading: WONT_DO.heading,
        intro: WONT_DO.intro,
        moreLabel: WONT_DO.moreLabel,
        items: WONT_DO.items.map((item) => ({ key: item.lead, lead: item.lead, body: item.body })),
      };
  return (
    <aside
      aria-labelledby={headingId}
      className={cn('sv-wontdo', className)}
      data-compact={compact ? '' : undefined}
    >
      <H id={headingId} className="sv-wontdo-title text-fg">
        {copy.heading}
      </H>
      <p className="t-body mt-2 text-fg-2">{copy.intro}</p>
      <ul className="sv-wontdo-list">
        {copy.items.map((item) => (
          <li key={item.key} className="t-body">
            {/* fact tags: each item's body facts (F42, F23, F7+F1, F15, none) */}
            <strong className="sv-wontdo-lead">{item.lead}</strong>
            {item.body ? (
              <span className="sv-wontdo-body"> {item.body}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {compact ? (
        <p className="sv-wontdo-more t-body">
          <QuietLink href={WONT_DO.moreHref}>{copy.moreLabel}</QuietLink>
        </p>
      ) : null}
    </aside>
  );
}
