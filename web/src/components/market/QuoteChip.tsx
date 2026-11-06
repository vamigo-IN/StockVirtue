import Link from 'next/link';
import { Change } from '@/components/widgets/frame';
import { clsx } from 'clsx';
import type { MarketQuote } from '@/market/types';
import { isVolatilityIndex } from './gate';
import { PriceCell } from './PriceCell';

/**
 * One instrument as a chip (spec §4.10): [TCS  3,906.92  ▼3.96%] in one
 * 36 px row with a 44 px hit area, radius 8, a 1 px line, white. The ticker
 * in `label` 650, the price in `num-s`, the % in the direction colour.
 *
 * - `href`: the stock page (omit it for indices and commodities). The link
 *   is never prefetched (plan §0.13). Callers pass it only when the page
 *   will have a price (useQuotable(); a story's own stocks always do).
 * - With no `quote` (missing, OFF or still loading) the chip shows the
 *   ticker and the name only, and stays a link when `href` is given.
 * - A group of chips ends with ONE Stamp, placed by the caller
 *   (StocksStrip, SearchInstruments).
 *
 * Server-safe (no hooks of its own; PriceCell is the client part). `refId`
 * because `ref` is reserved by React.
 */
export function QuoteChip({
  refId,
  symbol,
  name,
  href,
  quote,
  live,
  className,
}: {
  refId: string;
  symbol: string;
  name?: string | null;
  href?: string;
  quote?: MarketQuote;
  /** The quote comes from live data (enables the PriceCell wash). */
  live?: boolean;
  className?: string;
}) {
  const vix = isVolatilityIndex(refId);
  const body = (
    <>
      <span className="sv-chip-sym">{symbol}</span>
      {quote ? (
        <>
          <PriceCell value={quote.ltp} kind={quote.kind} size="num-s" live={live} />
          <Change
            change={null}
            pct={quote.changePct}
            showAbs={false}
            neutral={vix}
            className="t-num-s"
          />
        </>
      ) : name ? (
        <span className="sv-chip-name t-meta text-fg-2">{name}</span>
      ) : null}
    </>
  );
  const cls = clsx('sv-chip', className);
  return href ? (
    <Link href={href} prefetch={false} className={cls} title={name ?? undefined}>
      {body}
    </Link>
  ) : (
    <span className={cls} title={name ?? undefined}>
      {body}
    </span>
  );
}
