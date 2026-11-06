'use client';

import {
  Building2,
  Coins,
  IndianRupee,
  Landmark,
  ListChecks,
  Rows3,
  TableProperties,
} from 'lucide-react';
import { useCallback, useEffect, useId, useState } from 'react';
import { delayFor, isVolatilityIndex } from '@/components/market/gate';
import { useQuotable } from '@/components/market/useQuotable';
import type { InstrumentKind, MarketQuote } from '@/market/types';
import { newsPath } from '@/news/routes';
import { useQuotes, useSnapshot, useWidgetMode } from './data';
import { direction, fmtChange, fmtPrice, stampOf } from './format';
import {
  Change,
  DataStamp,
  LabelPill,
  WidgetCard,
  WidgetMessage,
  WidgetSkeleton,
} from './frame';
import type { WidgetConfig } from './meta';
import { StampTime } from './StampTime';
import { TickerTrack } from './ticker';

/**
 * Price widgets: one stock, one index, a story's stocks, commodities, rupee
 * rates, the inline ticker, and the two tables (a stock list, an index
 * table). Quotes come through `useQuotes` (one sorted
 * set per widget; curated refs follow the stream) and the snapshot through
 * `useSnapshot` (streamed on the website), both from ./data.
 *
 * Under an OFF licence every one of them says "Not available under our
 * current market-data licence." (fix c, spec §7.9). "Delayed" carries its
 * minutes only when the licence itself is DELAYED (`delayFor`, fix e).
 */

const num = (v: unknown, fb: number) => (typeof v === 'number' ? v : fb);
const strs = (v: unknown) =>
  Array.isArray(v) ? (v as unknown[]).map((s) => String(s).toUpperCase()) : [];
const words = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function DayRange({ q }: { q: MarketQuote }) {
  if (q.low === null || q.high === null || q.high <= q.low) return null;
  const pos = Math.min(
    100,
    Math.max(0, ((q.ltp - q.low) / (q.high - q.low)) * 100),
  );
  return (
    <div className="mt-4">
      <div className="flex justify-between text-[13px] leading-[18px] text-muted-foreground">
        <span>Day low {fmtPrice(q.low, q.kind)}</span>
        <span>Day high {fmtPrice(q.high, q.kind)}</span>
      </div>
      <div
        className="relative mt-1.5 h-1.5 rounded-full bg-muted"
        aria-hidden="true"
      >
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-foreground"
          style={{ left: `${pos}%` }}
        />
      </div>
    </div>
  );
}

/** One instrument, large: price, move, day range, previous close. */
function QuoteBody({ q }: { q: MarketQuote }) {
  const vix = isVolatilityIndex(q.ref);
  return (
    <div>
      <p className="text-sm text-muted-foreground">
        {q.name} <span className="text-[13px]">· {q.ref}</span>
        {q.unit ? <span className="text-[13px]"> · {q.unit}</span> : null}
        {vix ? <span className="text-[13px]"> · volatility index</span> : null}
      </p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-3xl font-bold tabular-nums">
          {fmtPrice(q.ltp, q.kind)}
        </span>
        <Change
          change={q.change}
          pct={q.changePct}
          kind={q.kind}
          neutral={vix}
          className="text-sm font-medium"
        />
      </p>
      <DayRange q={q} />
      {q.prevClose !== null && (
        <p className="mt-3 text-[13px] leading-[18px] text-muted-foreground">
          Previous close {fmtPrice(q.prevClose, q.kind)}
        </p>
      )}
    </div>
  );
}

export function StockQuoteWidget({ config }: { config: WidgetConfig }) {
  const ref = String(config.symbol ?? '').toUpperCase();
  const res = useQuotes(ref ? [ref] : [], num(config.refresh, 15));
  // The snapshot only for the licence's delay (streamed on the website).
  const snap = useSnapshot(0);
  const off = res.data?.right === 'OFF';
  const q = off ? undefined : res.data?.quotes.find((x) => x.ref === ref);
  return (
    <WidgetCard
      title="Stock quote"
      icon={Building2}
      footer={
        q && (
          <DataStamp
            label={q.label}
            asOf={q.asOf}
            attribution={res.data?.attribution}
            delay={delayFor(res.data?.right, snap.data?.delayMinutes)}
            stale={!!res.error}
          />
        )
      }
    >
      {q ? (
        <QuoteBody q={q} />
      ) : off ? (
        <WidgetMessage kind="rights" />
      ) : res.loading ? (
        <WidgetSkeleton />
      ) : (
        <WidgetMessage kind={res.data ? 'empty' : 'error'}>
          {res.data
            ? `No price for ${ref.split(':')[1] ?? 'this stock'} right now.`
            : undefined}
        </WidgetMessage>
      )}
    </WidgetCard>
  );
}

export function IndexQuoteWidget({ config }: { config: WidgetConfig }) {
  const ref = String(config.symbol ?? '').toUpperCase();
  const res = useSnapshot(num(config.refresh, 15));
  const off = res.data?.right === 'OFF';
  const q = off ? undefined : res.data?.instruments.find((x) => x.ref === ref);
  return (
    <WidgetCard
      title={q?.name ?? 'Index'}
      icon={Landmark}
      footer={
        q && (
          <DataStamp
            label={q.label}
            asOf={q.asOf}
            attribution={res.data?.attribution}
            delay={delayFor(res.data?.right, res.data?.delayMinutes)}
            stream="snapshot"
            stale={!!res.error}
          />
        )
      }
    >
      {q ? (
        <QuoteBody q={q} />
      ) : res.loading ? (
        <WidgetSkeleton />
      ) : (
        <WidgetMessage kind={off ? 'rights' : res.data ? 'empty' : 'error'}>
          {res.data && !off
            ? 'This index isn’t on the market list right now.'
            : undefined}
        </WidgetMessage>
      )}
    </WidgetCard>
  );
}

/** A table of instruments (stocks, commodities, currencies). */
function QuoteTable({
  quotes,
  linkStocks,
}: {
  quotes: MarketQuote[];
  linkStocks?: boolean;
}) {
  const stamp = stampOf(quotes);
  return (
    <table className="w-full text-sm">
      <thead className="sr-only">
        <tr>
          <th>Name</th>
          <th>Price</th>
          <th>Change</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {quotes.map((q) => (
          <tr key={q.ref}>
            <td className="py-2.5 pr-3">
              {linkStocks && q.kind === 'STOCK' ? (
                // A plain link: never prefetched (plan §0.13). The story's own
                // stocks are on the quote allowlist, so the page has a price.
                <a
                  href={newsPath.stock(q.symbol)}
                  className="font-medium hover:text-primary hover:underline"
                >
                  {q.name}
                </a>
              ) : (
                <span className="font-medium">{q.name}</span>
              )}
              {/* Contract codes ("NATURALGAS24NOV26FUT") are one long word:
                  let them wrap anywhere, or the table outgrows a phone-width
                  card and the change column is cut off. */}
              <span className="block text-[13px] leading-[18px] text-muted-foreground [overflow-wrap:anywhere]">
                {q.kind === 'STOCK' ? q.ref : (q.contract ?? q.ref)}
                {q.unit ? ` · ${q.unit}` : ''}
                {isVolatilityIndex(q.ref) ? ' · volatility index' : ''}
              </span>
            </td>
            <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
              {fmtPrice(q.ltp, q.kind)}
              {stamp.own(q) && (
                <span className="mt-1 block text-[13px] leading-[18px] whitespace-nowrap text-muted-foreground">
                  <LabelPill label={q.label} />{' '}
                  <span className="sr-only">Price as of </span>
                  <StampTime iso={q.asOf} />
                </span>
              )}
            </td>
            <td className="py-2.5 text-right text-[13px]">
              <Change
                change={q.change}
                pct={q.changePct}
                kind={q.kind}
                showAbs={false}
                neutral={isVolatilityIndex(q.ref)}
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RelatedStocksWidget({ config }: { config: WidgetConfig }) {
  const refs = strs(config.symbols);
  const res = useQuotes(refs, num(config.refresh, 15));
  const snap = useSnapshot(0);
  const off = res.data?.right === 'OFF';
  const quotes = off
    ? []
    : refs
        .map((r) => res.data?.quotes.find((q) => q.ref === r))
        .filter((q): q is MarketQuote => !!q);
  const mode = useWidgetMode();
  const stamp = stampOf(quotes);
  return (
    <WidgetCard
      title="Stocks in this story"
      icon={ListChecks}
      footer={
        quotes.length > 0 && (
          <DataStamp
            label={stamp.label}
            asOf={stamp.asOf}
            attribution={res.data?.attribution}
            delay={delayFor(res.data?.right, snap.data?.delayMinutes)}
            stale={!!res.error}
          />
        )
      }
    >
      {refs.length === 0 ? (
        <WidgetMessage kind="empty">
          Add related stocks to the story, or pick stocks for this widget.
        </WidgetMessage>
      ) : quotes.length ? (
        <QuoteTable quotes={quotes} linkStocks={mode === 'public'} />
      ) : off ? (
        <WidgetMessage kind="rights" />
      ) : res.loading ? (
        <WidgetSkeleton />
      ) : (
        <WidgetMessage kind={res.data ? 'empty' : 'error'} />
      )}
    </WidgetCard>
  );
}

function KindTable({
  config,
  kind,
  title,
  icon,
}: {
  config: WidgetConfig;
  kind: 'COMMODITY' | 'CURRENCY';
  title: string;
  icon: typeof Coins;
}) {
  const res = useSnapshot(num(config.refresh, 30));
  const pick = strs(config.symbols);
  const off = res.data?.right === 'OFF';
  const all = off
    ? []
    : (res.data?.instruments ?? []).filter((q) => q.kind === kind);
  const quotes = pick.length
    ? pick
        .map((r) => all.find((q) => q.ref === r))
        .filter((q): q is MarketQuote => !!q)
    : all;
  const stamp = stampOf(quotes);
  return (
    <WidgetCard
      title={title}
      icon={icon}
      footer={
        quotes.length > 0 && (
          <DataStamp
            label={stamp.label}
            asOf={stamp.asOf}
            attribution={res.data?.attribution}
            delay={delayFor(res.data?.right, res.data?.delayMinutes)}
            stream="snapshot"
            stale={!!res.error}
          />
        )
      }
    >
      {quotes.length ? (
        <QuoteTable quotes={quotes} />
      ) : res.loading ? (
        <WidgetSkeleton />
      ) : (
        <WidgetMessage kind={off ? 'rights' : res.data ? 'empty' : 'error'} />
      )}
    </WidgetCard>
  );
}

export function CommoditiesWidget({ config }: { config: WidgetConfig }) {
  return (
    <KindTable
      config={config}
      kind="COMMODITY"
      title="Commodities (MCX futures)"
      icon={Coins}
    />
  );
}

export function CurrencyRatesWidget({ config }: { config: WidgetConfig }) {
  return (
    <KindTable
      config={config}
      kind="CURRENCY"
      title="Rupee rates (NSE currency futures)"
      icon={IndianRupee}
    />
  );
}

export function MarketTickerWidget({ config }: { config: WidgetConfig }) {
  const res = useSnapshot(num(config.refresh, 15));
  const pick = strs(config.symbols);
  const off = res.data?.right === 'OFF';
  const all = off ? [] : (res.data?.instruments ?? []);
  const items = pick.length
    ? pick
        .map((r) => all.find((q) => q.ref === r))
        .filter((q): q is MarketQuote => !!q)
    : all.filter((q) => q.inTicker);
  const stamp = stampOf(items);
  if (!items.length) {
    return (
      <WidgetCard title="Market ticker">
        {res.loading ? (
          <WidgetSkeleton rows={1} />
        ) : (
          <WidgetMessage kind={off ? 'rights' : 'error'} />
        )}
      </WidgetCard>
    );
  }
  return (
    <div className="not-prose my-8 overflow-hidden rounded-[12px] border border-border">
      <TickerTrack
        items={items}
        look={{
          speed: 'normal',
          direction: 'left',
          theme: 'dark',
          show: { change: false, percent: true, labels: true },
          nameStyle: 'name',
        }}
      />
      <div className="bg-muted/40 px-4 py-2 text-muted-foreground">
        <DataStamp
          label={stamp.label}
          asOf={stamp.asOf}
          attribution={res.data?.attribution}
          delay={delayFor(res.data?.right, res.data?.delayMinutes)}
          stream="snapshot"
          stale={!!res.error}
        />
      </div>
    </div>
  );
}

// ── Tables: a stock list and an index table ─────────────────────────────

/**
 * Whether a box is narrower than its content (a wide table on a phone).
 * False on the server and until measured, so hydration never differs.
 */
function useOverflowX<T extends HTMLElement>(): [
  ref: (el: T | null) => void,
  over: boolean,
] {
  const [el, setEl] = useState<T | null>(null);
  const [over, setOver] = useState(false);
  const ref = useCallback((node: T | null) => setEl(node), []);
  useEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const check = () => setOver(el.scrollWidth > el.clientWidth + 1);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    // The table inside grows when its numbers arrive or change.
    for (const child of Array.from(el.children)) ro.observe(child);
    check();
    return () => ro.disconnect();
  }, [el]);
  return [ref, over];
}

/** A signed move without the triangle (the % column has it), as IndexBoard. */
function SignedMove({
  value,
  kind,
  neutral,
}: {
  value: number | null;
  kind: InstrumentKind;
  neutral: boolean;
}) {
  if (value === null) {
    return (
      <span className="text-muted-foreground">
        <span aria-hidden="true">–</span>
        <span className="sr-only">no change yet</span>
      </span>
    );
  }
  const dir = direction(value);
  return (
    <span
      data-dir={dir}
      className={
        neutral
          ? undefined
          : dir === 'up'
            ? 'text-up'
            : dir === 'down'
              ? 'text-down'
              : 'text-muted-foreground'
      }
    >
      {fmtChange(value, kind)}
    </span>
  );
}

const hasRange = (q: MarketQuote) =>
  q.low !== null && q.high !== null && q.high > q.low;

/**
 * The day's range in a row: a 120 × 4 track from the low to the high, a
 * tick at the previous close, a dot at the last price, and the low and the
 * high under it. One labelled image for screen readers.
 */
function RangeCell({ q }: { q: MarketQuote }) {
  if (q.low === null || q.high === null || q.high <= q.low) {
    return (
      <span className="text-muted-foreground">
        <span aria-hidden="true">–</span>
        <span className="sr-only">no range yet</span>
      </span>
    );
  }
  const { low, high } = q;
  const at = (v: number) =>
    Math.min(100, Math.max(0, ((v - low) / (high - low)) * 100));
  return (
    <span className="sv-dayrange" data-size="lg">
      <span
        className="sv-dayrange-track"
        role="img"
        aria-label={`Day range ${fmtPrice(low, q.kind)} to ${fmtPrice(high, q.kind)}, last ${fmtPrice(q.ltp, q.kind)}`}
      >
        {q.prevClose !== null && q.prevClose >= low && q.prevClose <= high ? (
          <span
            className="sv-dayrange-prev"
            style={{ left: `${at(q.prevClose)}%` }}
          />
        ) : null}
        <span className="sv-dayrange-dot" style={{ left: `${at(q.ltp)}%` }} />
      </span>
      <span className="sv-dayrange-values" aria-hidden="true">
        <span>{fmtPrice(low, q.kind)}</span>
        <span>{fmtPrice(high, q.kind)}</span>
      </span>
    </span>
  );
}

/**
 * One compact table of instruments (widgets.css .sv-wtable): the name, then
 * the last price, the change, the % change and, when asked for and known,
 * the day's range, mono and right-aligned. The card's footer carries the one
 * stamp for the table; a row whose label or time differs from it carries
 * its own pill and time under its name, never under the price (as
 * IndexBoard does). Wider than the card (phones), it scrolls inside its own
 * box with the names held in place, and only then takes keyboard focus; the
 * page never scrolls sideways.
 */
function PriceTable({
  quotes,
  caption,
  nameHead,
  dayRange,
  linkable,
}: {
  quotes: MarketQuote[];
  caption: string;
  nameHead: string;
  dayRange: boolean;
  /** Stock refs whose pages will have a price: their names link there. */
  linkable?: ReadonlySet<string>;
}) {
  const stamp = stampOf(quotes);
  const range = dayRange && quotes.some(hasRange);
  const [box, over] = useOverflowX<HTMLDivElement>();
  const captionId = useId();
  return (
    <div
      ref={box}
      className="sv-wtable-scroll"
      data-overflow={over ? '' : undefined}
      {...(over
        ? { tabIndex: 0, role: 'region', 'aria-labelledby': captionId }
        : {})}
    >
      <table className="sv-wtable">
        <caption id={captionId} className="sr-only">
          {caption}
        </caption>
        <thead>
          <tr>
            <th scope="col">{nameHead}</th>
            <th scope="col">Last</th>
            <th scope="col">Change</th>
            <th scope="col">% change</th>
            {range ? <th scope="col">Day range</th> : null}
          </tr>
        </thead>
        <tbody>
          {quotes.map((q) => {
            const vix = isVolatilityIndex(q.ref);
            const stock = q.kind === 'STOCK';
            return (
              <tr key={q.ref}>
                <th scope="row">
                  {stock && linkable?.has(q.ref.toUpperCase()) ? (
                    // A plain link: never prefetched (plan §0.13). Only a
                    // stock whose page will have a price links (spec §7.0
                    // rule 7).
                    <a
                      href={newsPath.stock(q.symbol)}
                      className="sv-wtable-name"
                    >
                      {q.name}
                    </a>
                  ) : (
                    <span className="sv-wtable-name">{q.name}</span>
                  )}
                  {stock ? (
                    <span className="sv-wtable-sub">{q.ref}</span>
                  ) : vix ? (
                    <span className="sv-wtable-sub" data-note="">
                      volatility index
                    </span>
                  ) : null}
                  {stamp.own(q) ? (
                    <span className="sv-wtable-sub">
                      <LabelPill label={q.label} />{' '}
                      <span className="sr-only">Price as of </span>
                      <span className="whitespace-nowrap">
                        <StampTime iso={q.asOf} />
                      </span>
                    </span>
                  ) : null}
                </th>
                <td>{fmtPrice(q.ltp, q.kind)}</td>
                <td>
                  <SignedMove value={q.change} kind={q.kind} neutral={vix} />
                </td>
                <td>
                  <Change
                    change={null}
                    pct={q.changePct}
                    showAbs={false}
                    neutral={vix}
                  />
                </td>
                {range ? (
                  <td>
                    <RangeCell q={q} />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Stock list: the stocks the writer picked (2 to 15, NSE or BSE), in their
 * order, in one table. A published story's widget stocks are on the public
 * quote allowlist (the API indexes every widget's refs on save), so the
 * website may quote them; one quotes request serves the whole list.
 */
export function StockListWidget({ config }: { config: WidgetConfig }) {
  const refs = strs(config.symbols);
  const res = useQuotes(refs, num(config.refresh, 15));
  // The snapshot entry and interval useQuotable reads (no extra request):
  // the licence's delay, and which stock pages have a price.
  const snap = useSnapshot(15);
  const quotable = useQuotable();
  const mode = useWidgetMode();
  const off = res.data?.right === 'OFF';
  const quotes = off
    ? []
    : refs
        .map((r) => res.data?.quotes.find((q) => q.ref === r))
        .filter((q): q is MarketQuote => !!q);
  const stamp = stampOf(quotes);
  const title = words(config.title) || 'Stock prices';
  return (
    <WidgetCard
      title={title}
      icon={Rows3}
      footer={
        quotes.length > 0 && (
          <DataStamp
            label={stamp.label}
            asOf={stamp.asOf}
            attribution={res.data?.attribution}
            delay={delayFor(res.data?.right, snap.data?.delayMinutes)}
            stale={!!res.error}
          />
        )
      }
    >
      {refs.length === 0 ? (
        <WidgetMessage kind="empty">
          Pick the stocks for this list.
        </WidgetMessage>
      ) : quotes.length ? (
        <PriceTable
          quotes={quotes}
          caption={title}
          nameHead="Stock"
          dayRange={config.dayRange !== false}
          linkable={mode === 'public' ? quotable : undefined}
        />
      ) : off ? (
        <WidgetMessage kind="rights" />
      ) : res.loading ? (
        <WidgetSkeleton rows={Math.min(refs.length, 5)} />
      ) : (
        <WidgetMessage kind={res.data ? 'empty' : 'error'}>
          {res.data ? 'No prices for these stocks right now.' : undefined}
        </WidgetMessage>
      )}
    </WidgetCard>
  );
}

/**
 * Index table: indices from the curated market list (2 to 15), in the
 * writer's order, from the live snapshot (streamed on the website, so no
 * request of its own). An index switched off on the market list drops out.
 */
export function IndexTableWidget({ config }: { config: WidgetConfig }) {
  const refs = strs(config.symbols);
  const res = useSnapshot(num(config.refresh, 15));
  const off = res.data?.right === 'OFF';
  const pool = off
    ? []
    : (res.data?.instruments ?? []).filter((q) => q.kind === 'INDEX');
  const quotes = refs
    .map((r) => pool.find((q) => q.ref === r))
    .filter((q): q is MarketQuote => !!q);
  const stamp = stampOf(quotes);
  const title = words(config.title) || 'Indices';
  return (
    <WidgetCard
      title={title}
      icon={TableProperties}
      footer={
        quotes.length > 0 && (
          <DataStamp
            label={stamp.label}
            asOf={stamp.asOf}
            attribution={res.data?.attribution}
            delay={delayFor(res.data?.right, res.data?.delayMinutes)}
            stream="snapshot"
            stale={!!res.error}
          />
        )
      }
    >
      {refs.length === 0 ? (
        <WidgetMessage kind="empty">
          Pick the indices for this table.
        </WidgetMessage>
      ) : quotes.length ? (
        <PriceTable
          quotes={quotes}
          caption={title}
          nameHead="Index"
          dayRange={config.dayRange !== false}
        />
      ) : res.loading ? (
        <WidgetSkeleton rows={Math.min(refs.length, 5)} />
      ) : (
        <WidgetMessage kind={off ? 'rights' : res.data ? 'empty' : 'error'}>
          {res.data && !off
            ? 'These indices aren’t on the market list right now.'
            : undefined}
        </WidgetMessage>
      )}
    </WidgetCard>
  );
}
