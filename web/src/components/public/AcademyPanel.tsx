import { ACADEMY } from '@/content/app';
import { cn } from '@/lib/utils';
import { QuietLink } from './Button';
import { Panel } from './Panel';

/**
 * The Trading Academy panel (spec §4.9, §9.6.1): Learn's "All explainers"
 * aside, the news front's Learn band and Learn's later listing pages.
 *
 * A `Panel family="news"` (radius 12) on paper, as
 * `<aside aria-label="In the app: the Trading Academy">` (its heading's
 * words: "From StockVirtue" names the HouseAd's aside, and /news shows both,
 * so two landmarks would share one name), opening with the visible label
 * "From StockVirtue" so it reads as a house message, not as part of the
 * news. Then the heading "In the app: the Trading Academy" (h3 by
 * default), the one paragraph (F9) and a quiet link "Get the app" to the
 * Play listing. No prices, no badge, never a reference to a story.
 * Server component.
 */
export function AcademyPanel({
  headingLevel = 'h3',
  playUrl,
  className,
}: {
  headingLevel?: 'h2' | 'h3';
  /** playStoreUrl(settings) from '@/lib/metadata'. */
  playUrl: string;
  className?: string;
}) {
  const H = headingLevel;
  return (
    <Panel
      family="news"
      as="aside"
      aria-label={ACADEMY.heading}
      className={cn('bg-paper', className)}
    >
      <p className="t-label text-fg-3">{ACADEMY.label}</p>
      <H className="t-title mt-3 text-fg">{ACADEMY.heading}</H>
      {/* F9 */}
      <p className="t-body mt-2 max-w-[34em] text-fg-2">{ACADEMY.body}</p>
      <p className="t-body mt-4">
        <QuietLink href={playUrl} external>
          {ACADEMY.link}
        </QuietLink>
      </p>
    </Panel>
  );
}
