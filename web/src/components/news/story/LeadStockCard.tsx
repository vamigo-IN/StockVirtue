'use client';

import { COPY } from '@/components/market/copy';
import { DayRange } from '@/components/market/DayRange';
import { delayFor } from '@/components/market/gate';
import { MiniChartLive } from '@/components/market/MiniChartLive';
import { ModuleError } from '@/components/market/parts';
import { PriceCell } from '@/components/market/PriceCell';
import { Stamp } from '@/components/market/Stamp';
import { useSnapshot } from '@/components/widgets/data';
import { Change } from '@/components/widgets/frame';
import { cn } from '@/lib/utils';
import type { Snapshot } from '@/market/types';
import c from '../StoryCard.module.css';
import s from './story.module.css';
import { storyRef, useStoryQuotes, type StoryStock } from './use-story-quotes';

/**
 * The rail's lead stock card (spec §5.12, §7.6; `data-market-module=
 * "lead-stock"`): the FIRST stock the story names, with NO link (the
 * StocksStrip holds the one link per stock).
 *
 * - h3: the company's name (else the symbol), then "{EXCHANGE} · {SYMBOL}";
 * - the price at 32/36, the change with its absolute move, the day range
 *   with low and high under the track, and the quote's Stamp;
 * - MiniChart "1 month · daily" at the story-rail size (340 × 64, narrower
 *   rails draw it at their full width), fetched by the browser when the
 *   card comes within 200 px of the viewport, never on the server; with its
 *   own stamp; left out with fewer than 2 candles.
 *
 * Prices come from the StocksStrip's request (`useStoryQuotes` with the
 * same stocks): no second request. States: skeletons at the final height
 * while loading; with the quote missing (the broker failed) the card keeps
 * its name and shows "Market data isn't available right now. It will
 * reappear shortly." in the reserved space. The page doesn't render it
 * under an OFF licence (the server knows `right`); a licence switched off
 * while the page is open hides it.
 */
export function LeadStockCard({
  stocks,
  initial,
  className,
}: {
  /** All the story's stocks (the shared quotes request); the card shows the first. */
  stocks: StoryStock[];
  initial: Snapshot | null;
  className?: string;
}) {
  const lead = stocks[0];
  const q = useStoryQuotes(stocks, initial);
  const live = useSnapshot(15);
  if (!lead) return null;
  if ((live.data?.right ?? initial?.right) === 'OFF') return null;

  const ref = storyRef(lead);
  const found = q.quoteFor(ref);
  const quote = found?.quote;
  const name = lead.name ?? lead.symbol;
  const headingId = `lead-stock-${lead.symbol.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  return (
    <div
      ref={q.viewRef}
      className={cn('sv-terminal', c.termCard, className)}
      data-market-module="lead-stock"
      aria-labelledby={headingId}
      role="group"
    >
      <h3 id={headingId} className={cn('t-rail-title m-0 text-fg', c.railHead)}>
        {name}
      </h3>
      <p className={cn('t-meta mt-0.5 text-fg-3', c.meta)}>
        {lead.exchange} · {lead.symbol}
      </p>
      <div className={cn('mt-3', s.leadPrice)}>
        {quote ? (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <PriceCell
                value={quote.ltp}
                kind={quote.kind}
                size="hero"
                live={found?.live}
                className="text-[32px] leading-[36px]"
              />
              <Change
                change={quote.change}
                pct={quote.changePct}
                kind={quote.kind}
                className="t-num"
              />
            </div>
            <DayRange
              low={quote.low}
              high={quote.high}
              prevClose={quote.prevClose}
              ltp={quote.ltp}
              size="lg"
              showValues
              kind={quote.kind}
              className="mt-3"
            />
            <div className="mt-3">
              <Stamp
                label={quote.label}
                asOf={quote.asOf}
                attribution={q.attribution}
                delay={delayFor(q.right, q.delayMinutes)}
                stale={q.failed}
              />
            </div>
          </>
        ) : q.loading ? (
          <div aria-busy="true" aria-label={COPY.loading} role="group">
            <div className="h-9 w-40 rounded-[4px] bg-surface-3" />
            <div className="mt-3 h-4 w-32 rounded-[4px] bg-surface-3" />
            <div className="mt-3 h-9" />
          </div>
        ) : (
          <ModuleError>{COPY.errorNoData}</ModuleError>
        )}
      </div>
      <MiniChartLive
        refId={ref}
        range="1M"
        label={name}
        size="story"
        className="mt-5"
      />
    </div>
  );
}
