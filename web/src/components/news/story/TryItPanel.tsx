import { Panel } from '@/components/public/Panel';
import { PlayBadge, PlayTrademark } from '@/components/public/PlayBadge';
import { withFacts } from '@/content/app';
import { cn } from '@/lib/utils';

/** The visible label and the aside's name (spec §9.6.1). */
const LABEL = 'From StockVirtue';

/**
 * The one sentence (spec §9.6.1), word for word. It describes the app only:
 * never the story, a stock in it or "the stories you read", and it never
 * asks the reader a question. Dropped (the panel keeps its wordmark and
 * badge) if any of its facts goes back to 'verify'.
 */
// F22, F4, F8, F1
const SENTENCE = withFacts(
  ['F22', 'F4', 'F8', 'F1'],
  'A free Android app where you practise trading Indian shares, F&O and commodities with ₹10 lakh of virtual money.',
  null,
);

/**
 * The app panel on story and stock pages (spec §4.9, §9.6.1): a house
 * message, set apart from the news.
 *
 * - `<aside aria-label="From StockVirtue">` on paper with a 1 px line,
 *   radius 12, padding 24 / 32 (Panel family="news").
 * - The visible label "From StockVirtue" first, so it reads as a house
 *   message, then the text wordmark, the sentence, the official Play badge
 *   and the trademark line.
 * - Its text never names the story, the page's stock or any symbol, so the
 *   same panel serves every story and every stock page (B12).
 * - Placement is the page's: on a story after Sources, Tags and the
 *   AuthorBox (none on a retracted story); on a stock page after the news.
 *
 * SERVER component (no hooks; the badge is a plain link).
 */
export function TryItPanel({
  playUrl,
  className,
}: {
  /** playStoreUrl(settings) from '@/lib/metadata'. */
  playUrl: string;
  className?: string;
}) {
  return (
    <Panel
      family="news"
      as="aside"
      aria-label={LABEL}
      className={cn('bg-paper', className)}
    >
      <p className="t-label text-fg-3">{LABEL}</p>
      <p className="t-title mt-3 font-bold text-fg">StockVirtue</p>
      {SENTENCE ? (
        // F22, F4, F8, F1
        <p className="t-body mt-2 max-w-[34em] text-fg-2">{SENTENCE}</p>
      ) : null}
      {/* 24 px above and 12 below: Google's clear space is a quarter of the
          badge's height. */}
      <div className="mt-6 flex">
        <PlayBadge href={playUrl} />
      </div>
      <PlayTrademark className="mt-3" />
    </Panel>
  );
}
