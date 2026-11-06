'use client';

import { COPY } from '@/components/market/copy';
import { DayRange } from '@/components/market/DayRange';
import { delayFor } from '@/components/market/gate';
import { ModuleError } from '@/components/market/parts';
import { PriceCell } from '@/components/market/PriceCell';
import { Stamp } from '@/components/market/Stamp';
import { useQuotes, useSnapshot } from '@/components/widgets/data';
import { Change } from '@/components/widgets/frame';
import { fmtPrice } from '@/components/widgets/format';
import { useInView } from '@/lib/hooks/useInView';
import { clsx } from 'clsx';
import type { DataRight, MarketQuote, QuotesData } from '@/market/types';

/** The OFF sentence (spec §5.13, §9.5.1), for a licence switched off live. */
const OFF_LINE = 'Prices are switched off on the website at the moment.';

/** Quotes poll this often while the header is near the screen (spec §7.7). */
const POLL_S = 30;

/**
 * The stock page's quote (spec §5.13, §7.7; `data-market-module="stock-quote"`),
 * rendered only for a quotable stock:
 *
 *   NN,NNN.NN (num-hero, 32/36 → 48/52) · Change (▲ +NN.NN (+0.42%)) · DayRange 120
 *   Open · High · Low · Prev close (four across from 640 px, two rows of two below)
 *   Stamp (label · time · attribution)
 *
 * - `initial` is the server's `getQuotes(['NSE:SYM'])` answer, so the price is
 *   in the server HTML with its stamp and hydration matches. Then
 *   `useQuotes` takes over: one poll at mount, then every 30 s while the
 *   header is within 200 px of the viewport (300 s once the answer says End
 *   of day; the store pauses on a hidden tab). A curated stock follows the
 *   streamed snapshot instead, at no broker cost.
 * - Broker failure (the ref comes back in `missing`, or no answer at all):
 *   the box keeps its height and shows "Market data isn't available right
 *   now. It will reappear shortly." Never the "no price yet" line, which is
 *   the page's, for stocks that aren't quotable.
 * - A licence switched to OFF while the page is open shows the OFF sentence
 *   (the next render leaves the header out).
 * - No placeholders for data the API doesn't have (52-week range, volume,
 *   market cap…).
 */
export function QuoteHeader({
  refId,
  initial,
  right,
  delayMinutes,
  curated = false,
  className,
}: {
  /** "NSE:INFY" (the stock page always asks NSE: spec §7.9). */
  refId: string;
  /** The server's getQuotes() answer; null when it failed. */
  initial: QuotesData | null;
  /** The licence from the server's snapshot. */
  right?: DataRight | null;
  /** The snapshot's delayMinutes (for "Delayed 15m"). */
  delayMinutes?: number | null;
  /** A curated stock (in the snapshot): its Live dot follows the stream. */
  curated?: boolean;
  className?: string;
}) {
  const REF = refId.trim().toUpperCase();
  const [ref, inView] = useInView<HTMLDivElement>({ rootMargin: '200px' });
  const res = useQuotes([REF], inView ? POLL_S : 0);
  // The same store entry the stream and IndexBoard use: no extra request.
  const snap = useSnapshot(15);

  const data: QuotesData | undefined = res.data ?? initial ?? undefined;
  const quote: MarketQuote | undefined = data?.quotes.find(
    (q) => q.ref.toUpperCase() === REF,
  );
  const liveRight = res.data?.right ?? snap.data?.right;
  const off = liveRight === 'OFF';
  const delay = delayFor(
    liveRight ?? right,
    snap.data?.delayMinutes ?? delayMinutes,
  );

  return (
    <div
      ref={ref}
      // The box keeps the priced height in every state (spec §5.13).
      className={clsx('min-h-[184px] sm:min-h-[152px] lg:min-h-[164px]', className)}
      data-market-module={quote && !off ? 'stock-quote' : undefined}
    >
      {off ? (
        <p className="t-body text-fg-2">{OFF_LINE}</p>
      ) : quote ? (
        <Priced
          quote={quote}
          live={!!res.data}
          attribution={data?.attribution}
          delay={delay}
          stale={!!res.error}
          curated={curated}
        />
      ) : (
        <ModuleError>{COPY.errorNoData}</ModuleError>
      )}
    </div>
  );
}

function Priced({
  quote: q,
  live,
  attribution,
  delay,
  stale,
  curated,
}: {
  quote: MarketQuote;
  live: boolean;
  attribution: string | undefined;
  delay: number | undefined;
  stale: boolean;
  curated: boolean;
}) {
  const facts: [string, number | null][] = [
    ['Open', q.open],
    ['High', q.high],
    ['Low', q.low],
    ['Prev close', q.prevClose],
  ];
  return (
    <>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <PriceCell value={q.ltp} kind={q.kind} size="hero" live={live} />
        <Change
          change={q.change}
          pct={q.changePct}
          kind={q.kind}
          className="t-title mb-1"
        />
        <DayRange
          low={q.low}
          high={q.high}
          prevClose={q.prevClose}
          ltp={q.ltp}
          size="lg"
          showValues
          kind={q.kind}
          className="mb-1"
        />
      </div>
      <dl className="mt-4 grid max-w-[40rem] grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="t-meta text-fg-3">{label}</dt>
            <dd className="t-num m-0 text-fg">
              {value === null ? '–' : fmtPrice(value, q.kind)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-3">
        <Stamp
          label={q.label}
          asOf={q.asOf}
          attribution={attribution}
          delay={delay}
          stream={curated ? 'snapshot' : undefined}
          stale={stale}
        />
      </div>
    </>
  );
}
