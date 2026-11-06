import { Bot, TriangleAlert } from 'lucide-react';
import { Breadcrumbs } from '@/components/news/blocks';
import { Kicker } from '@/components/news/StoryCard';
import { cn } from '@/lib/utils';
import type { Snapshot } from '@/market/types';
import { fullTime } from '@/news/format';
import type { NewsArticle } from '@/news/types';
import { Byline } from './Byline';
import { StocksStrip } from './StocksStrip';
import c from '../StoryCard.module.css';
import s from './story.module.css';

/**
 * The story's head (spec §5.12, the `head` row): the breadcrumbs, the
 * retraction notice (when there is one), the kicker (with the Breaking
 * chip), the ONE h1 (`head-1`, Source Serif 650), the standfirst (c2–9),
 * the byline with its meta line ("Updated …" when the story was edited
 * after it went live; correction notes were retired on 6 Nov 2026), the
 * AI label, and the StocksStrip.
 * Nothing sits above the H1 but the breadcrumbs, the retraction and the
 * kicker. SERVER component; the StocksStrip is its client part.
 */
export function StoryHeader({
  article: a,
  trail,
  snapshot,
  className,
}: {
  article: NewsArticle;
  /** The breadcrumb trail (News / {parent} / {category}), each with its address. */
  trail: { name: string; href: string }[];
  /** The server's snapshot, for the StocksStrip's curated prices and the licence. */
  snapshot: Snapshot | null;
  className?: string;
}) {
  return (
    <header className={className}>
      <Breadcrumbs items={trail} />
      {a.retractedAt ? <Retraction article={a} className="mt-5" /> : null}
      <Kicker card={a} className="mt-5" />
      <h1 className={cn('t-head-1 mt-3 text-fg', c.hlBig)}>{a.title}</h1>
      {a.subtitle ? (
        <p className={cn('t-standfirst mt-4 text-fg-2', c.standfirst, s.standfirst)}>{a.subtitle}</p>
      ) : null}
      <Byline article={a} className="mt-6" />
      {a.isAiGenerated ? <AiLabel className="mt-4" /> : null}
      {a.stocks.length ? (
        <StocksStrip stocks={a.stocks} initial={snapshot} className="mt-6" />
      ) : null}
    </header>
  );
}

/**
 * The AI label (spec §4.9; wording unchanged, §9.8): --sv-surface-2 fill,
 * radius 4, padding 8 12, `small`, lucide Bot 16.
 */
function AiLabel({ className }: { className?: string }) {
  return (
    <p
      className={cn(
        't-small flex items-start gap-2 rounded-[4px] bg-surface-2 px-3 py-2 text-fg-2',
        className,
      )}
    >
      <Bot className="mt-[3px] size-4 shrink-0" aria-hidden="true" />
      AI tools helped prepare this story. It was approved for publication by the
      StockVirtue newsroom.
    </p>
  );
}

/**
 * The retraction notice (spec §4.9; wording unchanged): `role="note"`,
 * white, a 1 px line and a 3 px --sv-danger left rule, lucide
 * AlertTriangle. A retracted story has no app panel (the page's rule).
 */
function Retraction({ article: a, className }: { article: NewsArticle; className?: string }) {
  return (
    <div role="note" className={cn(s.note, s.retraction, 'flex gap-3', className)}>
      <TriangleAlert className="mt-[3px] size-4 shrink-0 text-danger" aria-hidden="true" />
      <div className="t-small">
        <p className="font-semibold text-fg">
          This story has been retracted
          {a.retractedAt ? <> on {fullTime(a.retractedAt)}</> : null}.
        </p>
        {a.retractionNote ? <p className="mt-1 text-fg-2">{a.retractionNote}</p> : null}
      </div>
    </div>
  );
}
