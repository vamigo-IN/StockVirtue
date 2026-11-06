'use client';

import { delayFor } from '@/components/market/gate';
import { stockHref } from '@/components/market/parts';
import { QuoteChip } from '@/components/market/QuoteChip';
import { Stamp } from '@/components/market/Stamp';
import { useSnapshot } from '@/components/widgets/data';
import { LabelPill } from '@/components/widgets/frame';
import { stampOf } from '@/components/widgets/format';
import { StampTime } from '@/components/widgets/StampTime';
import { cn } from '@/lib/utils';
import type { MarketQuote, Snapshot } from '@/market/types';
import { COPY } from '@/components/market/copy';
import s from './story.module.css';
import { storyRef, useStoryQuotes, type StoryStock } from './use-story-quotes';

/**
 * "Stocks in this story" (spec §4.9, §5.12, §7.6; `data-market-module=
 * "stocks-strip"` once it shows prices): one QuoteChip per stock the story
 * names, then ONE Stamp after the chips. These chips are the ONLY links to
 * `/news/stocks/{SYM}` on a story page, and they are never prefetched.
 *
 * - The links are built from `stocks` on the FIRST render, so they are in
 *   the server HTML whatever happens to the prices.
 * - Prices come from ONE `quotes?symbols=` request for the whole sorted set
 *   (the first 20 refs; the lead stock card shares it), polled every 30 s
 *   while the strip is near the screen (300 s once End of day). Curated
 *   stocks start from the server's snapshot and follow the stream.
 * - A chip whose quote is missing (the broker failed, the stock isn't
 *   priced, or an OFF licence) shows its ticker and name and stays the link.
 * - A chip whose label or time differs from the Stamp's (a curated Delayed
 *   price beside an End-of-day one) carries its own pill and time, so no
 *   price is described by another's stamp.
 * - Below 768 px the chips scroll sideways with snap and an edge fade; the
 *   Stamp sits under them.
 */
export function StocksStrip({
  stocks,
  initial,
  className,
}: {
  stocks: StoryStock[];
  /** The server's snapshot (getSnapshot()): curated prices and the licence. */
  initial: Snapshot | null;
  className?: string;
}) {
  const { quoteFor, attribution, right, delayMinutes, viewRef } = useStoryQuotes(stocks, initial);
  const live = useSnapshot(15);
  const off = (live.data?.right ?? initial?.right) === 'OFF';
  if (!stocks.length) return null;

  const shown: { stock: StoryStock; quote?: MarketQuote; live: boolean }[] = stocks.map(
    (stock) => {
      const q = off ? undefined : quoteFor(storyRef(stock));
      return { stock, quote: q?.quote, live: !!q?.live };
    },
  );
  const priced = shown.flatMap((x) => (x.quote ? [x.quote] : []));
  const stamp = stampOf(priced);
  const delay = delayFor(right, delayMinutes);

  return (
    <div
      ref={viewRef}
      className={className}
      data-market-module={priced.length ? 'stocks-strip' : undefined}
    >
      <p className="t-label text-fg-2">Stocks in this story</p>
      <div className="md:flex md:flex-wrap md:items-center md:gap-x-3 md:gap-y-2">
        <ul className={cn(s.stripRow, 'md:mt-2')}>
          {shown.map(({ stock, quote, live: isLive }) => (
            <li key={storyRef(stock)}>
              <QuoteChip
                refId={storyRef(stock)}
                symbol={stock.symbol}
                name={stock.name}
                href={stockHref(stock.symbol)}
                quote={quote}
                live={isLive}
              />
              {quote && stamp.own(quote) ? (
                <span className="t-meta whitespace-nowrap text-fg-3">
                  <LabelPill label={quote.label} />{' '}
                  <span className="sr-only">{COPY.pricesAsOf}</span>
                  <StampTime iso={quote.asOf} />
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {priced.length ? (
          <div className="mt-2">
            <Stamp
              label={stamp.label}
              asOf={stamp.asOf}
              attribution={attribution}
              delay={delay}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
