'use client';

import {
  Building2,
  Coins,
  IndianRupee,
  Landmark,
  ListChecks,
} from 'lucide-react';
import type { MarketQuote, QuotesData, Snapshot } from '@/market/types';
import { useMarket, useWidgetMode } from './data';
import { fmtPrice, fmtStamp, stampOf } from './format';
import {
  Change,
  DataStamp,
  LabelPill,
  WidgetCard,
  WidgetMessage,
  WidgetSkeleton,
} from './frame';
import type { WidgetConfig } from './meta';
import { TickerTrack } from './ticker';

export function useSnapshot(refresh: number) {
  return useMarket<Snapshot>('snapshot', refresh);
}

export function useQuotes(refs: string[], refresh: number) {
  return useMarket<QuotesData>(
    refs.length ? `quotes?symbols=${encodeURIComponent(refs.join(','))}` : null,
    refresh,
  );
}

const num = (v: unknown, fb: number) => (typeof v === 'number' ? v : fb);
const strs = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

function DayRange({ q }: { q: MarketQuote }) {
  if (q.low === null || q.high === null || q.high <= q.low) return null;
  const pos = Math.min(
    100,
    Math.max(0, ((q.ltp - q.low) / (q.high - q.low)) * 100),
  );
  return (
    <div className="mt-4">
      <div className="flex justify-between text-xs text-muted-foreground">
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
  return (
    <div>
      <p className="text-sm text-muted-foreground">
        {q.name} <span className="font-mono text-xs">· {q.ref}</span>
        {q.unit ? <span className="text-xs"> · {q.unit}</span> : null}
      </p>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-3xl font-bold tabular-nums">
          {fmtPrice(q.ltp, q.kind)}
        </span>
        <Change
          change={q.change}
          pct={q.changePct}
          kind={q.kind}
          className="text-sm font-medium"
        />
      </p>
      <DayRange q={q} />
      {q.prevClose !== null && (
        <p className="mt-3 text-xs text-muted-foreground">
          Previous close {fmtPrice(q.prevClose, q.kind)}
        </p>
      )}
    </div>
  );
}

export function StockQuoteWidget({ config }: { config: WidgetConfig }) {
  const ref = String(config.symbol ?? '');
  const res = useQuotes(ref ? [ref] : [], num(config.refresh, 15));
  const q = res.data?.quotes.find((x) => x.ref === ref);
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
          />
        )
      }
    >
      {q ? (
        <QuoteBody q={q} />
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
  const ref = String(config.symbol ?? '');
  const res = useSnapshot(num(config.refresh, 15));
  const q = res.data?.instruments.find((x) => x.ref === ref);
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
            delay={res.data?.delayMinutes}
          />
        )
      }
    >
      {q ? (
        <QuoteBody q={q} />
      ) : res.loading ? (
        <WidgetSkeleton />
      ) : (
        <WidgetMessage
          kind={
            res.data?.right === 'OFF' ? 'rights' : res.data ? 'empty' : 'error'
          }
        >
          {res.data && res.data.right !== 'OFF'
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
                <a
                  href={`/news/stocks/${q.symbol}`}
                  className="font-medium hover:text-primary hover:underline"
                >
                  {q.name}
                </a>
              ) : (
                <span className="font-medium">{q.name}</span>
              )}
              <span className="block font-mono text-[11px] text-muted-foreground">
                {q.kind === 'STOCK' ? q.ref : (q.contract ?? q.ref)}
                {q.unit ? ` · ${q.unit}` : ''}
              </span>
            </td>
            <td className="py-2.5 pr-3 text-right font-mono tabular-nums">
              {fmtPrice(q.ltp, q.kind)}
              {stamp.own(q) && (
                <span className="mt-1 flex items-center justify-end gap-1.5 font-sans text-[11px] text-muted-foreground">
                  <LabelPill label={q.label} />
                  {fmtStamp(q.asOf)}
                </span>
              )}
            </td>
            <td className="py-2.5 text-right text-xs">
              <Change
                change={q.change}
                pct={q.changePct}
                kind={q.kind}
                showAbs={false}
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
  const quotes = refs
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
  const all = (res.data?.instruments ?? []).filter((q) => q.kind === kind);
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
            delay={res.data?.delayMinutes}
          />
        )
      }
    >
      {quotes.length ? (
        <QuoteTable quotes={quotes} />
      ) : res.loading ? (
        <WidgetSkeleton />
      ) : (
        <WidgetMessage
          kind={
            res.data?.right === 'OFF' ? 'rights' : res.data ? 'empty' : 'error'
          }
        />
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
  const all = res.data?.instruments ?? [];
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
          <WidgetMessage
            kind={res.data?.right === 'OFF' ? 'rights' : 'error'}
          />
        )}
      </WidgetCard>
    );
  }
  return (
    <div className="not-prose my-8 overflow-hidden rounded-xl border border-border">
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
      <div className="bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
        <DataStamp
          label={stamp.label}
          asOf={stamp.asOf}
          attribution={res.data?.attribution}
          delay={res.data?.delayMinutes}
        />
      </div>
    </div>
  );
}
