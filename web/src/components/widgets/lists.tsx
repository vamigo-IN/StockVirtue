'use client';

import {
  Activity,
  ChartColumn,
  LayoutGrid,
  Rocket,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { fmtTimes, listingPriceLabel } from '@/components/market/listing-price';
import { useQuotable } from '@/components/market/useQuotable';
import { cn } from '@/lib/utils';
import {
  marketPath,
  type CapSegment,
  type HeatmapIndex,
  type MoversType,
} from '@/market/paths';
import type { IpoBoard, Labelled, ListRow } from '@/market/types';
import { dateline } from '@/news/format';
import { newsPath } from '@/news/routes';
import { useMarket, useSnapshot, useWidgetMode } from './data';
import { fmtDate, fmtPct, fmtPrice, fmtVolume } from './format';
import {
  Change,
  DataStamp,
  WidgetCard,
  WidgetMessage,
  WidgetSkeleton,
} from './frame';
import type { WidgetConfig } from './meta';

/**
 * Market lists: movers, sectors, the heatmap and IPOs. Every address comes
 * from `marketPath` (spec §7.0 rule 1, fix h): movers always ask for
 * `limit=10` and slice to the widget's count, and Most active is always
 * `segment=largecap`, so every caller shares one cache key per list.
 */

const num = (v: unknown, fb: number) => (typeof v === 'number' ? v : fb);
const SEGMENTS: Record<CapSegment, string> = {
  largecap: 'Large caps',
  midcap: 'Mid caps',
  smallcap: 'Small caps',
};
const segmentOf = (v: unknown): CapSegment =>
  v === 'midcap' || v === 'smallcap' ? v : 'largecap';

/** Shared states for list answers (one vocabulary; spec §4.10). */
function ListState({
  res,
}: {
  res: { data?: Labelled<ListRow[]>; loading: boolean };
}) {
  if (res.loading && !res.data) return <WidgetSkeleton rows={4} />;
  if (!res.data) return <WidgetMessage kind="error" />;
  return (
    <WidgetMessage kind={res.data.reason === 'rights' ? 'rights' : 'error'} />
  );
}

/**
 * Live lists (movers, sectors, heatmap) need LIVE rights: the API answers
 * anything else with the licence note. The licence also rides the price
 * stream (the snapshot's `right`), so a switch to Delayed, End of day or
 * Off shows the note at once, even while the widget is off screen and not
 * polling (spec §7.12 layer 1), and never leaves a stale list up. `refresh`
 * is the snapshot interval the caller already uses (15 with useQuotable),
 * or 0: no polling of its own, the stream and a first load only.
 */
function useNoLiveRights(refresh: number): boolean {
  const right = useSnapshot(refresh).data?.right;
  return right !== undefined && right !== 'LIVE';
}

function Movers({ config, type }: { config: WidgetConfig; type: MoversType }) {
  const limit = Math.max(1, Math.min(10, num(config.limit, 5)));
  const segment = segmentOf(config.segment);
  const res = useMarket<Labelled<ListRow[]>>(
    marketPath.movers(type, segment),
    num(config.refresh, 30),
  );
  const mode = useWidgetMode();
  // A row links only when its stock page will have a price (spec §7.0 rule
  // 7): every tracked mover with backend B1, only the curated stocks
  // without it (plan risk 23).
  const quotable = useQuotable();
  // The same snapshot entry and interval useQuotable reads: no extra request.
  const noRights = useNoLiveRights(15);
  const title =
    type === 'gainers'
      ? `Top gainers · ${SEGMENTS[segment]}`
      : type === 'losers'
        ? `Top losers · ${SEGMENTS[segment]}`
        : 'Most active stocks';
  const Icon =
    type === 'gainers'
      ? TrendingUp
      : type === 'losers'
        ? TrendingDown
        : Activity;
  // Most active ranks across the three tracked lists, so a stock on two lists
  // can come back twice: show it once.
  const seen = new Set<string>();
  const rows = (res.data?.available && !noRights ? res.data.data : [])
    .filter((r) => !seen.has(r.ref) && seen.add(r.ref))
    .slice(0, limit);
  return (
    <WidgetCard
      title={title}
      icon={Icon}
      footer={
        rows.length > 0 && (
          <DataStamp
            label={res.data?.label}
            asOf={res.data?.asOf}
            attribution={res.data?.attribution}
            stale={!!res.error}
          />
        )
      }
    >
      {rows.length ? (
        <ol className="divide-y divide-border text-sm">
          {rows.map((r, i) => (
            <li key={r.ref} className="flex items-center gap-3 py-2.5">
              <span className="w-5 text-[13px] text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                {mode === 'public' && quotable.has(r.ref.toUpperCase()) ? (
                  // A plain link: never prefetched (plan §0.13).
                  <a
                    href={newsPath.stock(r.symbol)}
                    className="block truncate font-medium hover:text-primary hover:underline"
                  >
                    {r.name}
                  </a>
                ) : (
                  <span className="block truncate font-medium">{r.name}</span>
                )}
                <span className="block text-[13px] leading-[18px] text-muted-foreground">
                  {r.symbol}
                  {type === 'active' && r.volume
                    ? ` · Vol ${fmtVolume(r.volume)}`
                    : ''}
                </span>
              </span>
              <span className="text-right">
                <span className="block font-mono tabular-nums">
                  {fmtPrice(r.ltp)}
                </span>
                <Change
                  change={r.change}
                  pct={r.changePct}
                  showAbs={false}
                  className="text-[13px]"
                />
              </span>
            </li>
          ))}
        </ol>
      ) : noRights ? (
        <WidgetMessage kind="rights" />
      ) : (
        <ListState res={res} />
      )}
    </WidgetCard>
  );
}

export const TopGainersWidget = ({ config }: { config: WidgetConfig }) => (
  <Movers config={config} type="gainers" />
);
export const TopLosersWidget = ({ config }: { config: WidgetConfig }) => (
  <Movers config={config} type="losers" />
);
export const MostActiveWidget = ({ config }: { config: WidgetConfig }) => (
  <Movers config={config} type="active" />
);

export function SectorsWidget({ config }: { config: WidgetConfig }) {
  const res = useMarket<Labelled<ListRow[]>>(
    marketPath.sectors(),
    num(config.refresh, 30),
  );
  const noRights = useNoLiveRights(0);
  const rows = (res.data?.available && !noRights ? res.data.data : [])
    .filter((r) => r.changePct !== null)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
    .slice(0, num(config.limit, 8));
  const max = Math.max(0.5, ...rows.map((r) => Math.abs(r.changePct ?? 0)));
  return (
    <WidgetCard
      title="Sector performance"
      icon={ChartColumn}
      footer={
        rows.length > 0 && (
          <DataStamp
            label={res.data?.label}
            asOf={res.data?.asOf}
            attribution={res.data?.attribution}
            stale={!!res.error}
          />
        )
      }
    >
      {rows.length ? (
        <ul className="space-y-2 text-sm">
          {rows.map((r) => {
            const pct = r.changePct ?? 0;
            const width = `${(Math.abs(pct) / max) * 50}%`;
            return (
              <li
                key={r.ref}
                className="grid grid-cols-[7.5rem_1fr_4.5rem] items-center gap-3"
              >
                <span className="truncate">{r.name}</span>
                <span
                  className="relative h-3 rounded-[2px] bg-muted"
                  aria-hidden="true"
                >
                  <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                  <span
                    className={cn(
                      'absolute inset-y-0 rounded-[2px]',
                      pct >= 0 ? 'left-1/2 bg-up' : 'right-1/2 bg-down',
                    )}
                    style={{ width }}
                  />
                </span>
                <Change
                  change={null}
                  pct={pct}
                  showAbs={false}
                  className="text-right text-[13px]"
                />
              </li>
            );
          })}
        </ul>
      ) : noRights ? (
        <WidgetMessage kind="rights" />
      ) : (
        <ListState res={res} />
      )}
    </WidgetCard>
  );
}

const HEAT_INDEX: Record<HeatmapIndex, string> = {
  NIFTY: 'Nifty 50',
  BANKNIFTY: 'Bank Nifty',
  SENSEX: 'Sensex',
};
const indexOf = (v: unknown): HeatmapIndex =>
  v === 'BANKNIFTY' || v === 'SENSEX' ? v : 'NIFTY';

/**
 * The seven heat bins by day % change (spec §3.1.1): ≤ −2, −2 to −1,
 * −1 to −0.25, ±0.25, +0.25 to +1, +1 to +2, ≥ +2. Fills are the
 * bg-heat-* theme names, so the colour-blind palette and the portal follow
 * them; the text colour on each fill is in widgets.css (.sv-heat).
 */
type HeatBin = 'n3' | 'n2' | 'n1' | '0' | 'p1' | 'p2' | 'p3';
function heatBin(pct: number): HeatBin {
  if (pct <= -2) return 'n3';
  if (pct <= -1) return 'n2';
  if (pct <= -0.25) return 'n1';
  if (pct < 0.25) return '0';
  if (pct < 1) return 'p1';
  if (pct < 2) return 'p2';
  return 'p3';
}
const HEAT_FILL: Record<HeatBin, string> = {
  n3: 'bg-heat-n3',
  n2: 'bg-heat-n2',
  n1: 'bg-heat-n1',
  '0': 'bg-heat-0',
  p1: 'bg-heat-p1',
  p2: 'bg-heat-p2',
  p3: 'bg-heat-p3',
};

export function HeatmapWidget({ config }: { config: WidgetConfig }) {
  const index = indexOf(config.index);
  const res = useMarket<Labelled<ListRow[]>>(
    marketPath.heatmap(index),
    num(config.refresh, 60),
  );
  const noRights = useNoLiveRights(0);
  const rows = (res.data?.available && !noRights ? res.data.data : []).filter(
    (r) => r.changePct !== null,
  );
  return (
    <WidgetCard
      title={`${HEAT_INDEX[index]} heatmap`}
      icon={LayoutGrid}
      footer={
        rows.length > 0 && (
          <DataStamp
            label={res.data?.label}
            asOf={res.data?.asOf}
            attribution={res.data?.attribution}
            stale={!!res.error}
          />
        )
      }
    >
      {rows.length ? (
        <ul className="grid grid-cols-3 gap-0.5 sm:grid-cols-5 lg:grid-cols-6">
          {[...rows]
            .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
            .map((r) => {
              const pct = r.changePct ?? 0;
              const bin = heatBin(pct);
              return (
                <li
                  key={r.ref}
                  data-bin={bin}
                  className={cn(
                    'sv-heat flex min-h-11 flex-col justify-center rounded-[2px] px-2 py-1.5 text-center',
                    HEAT_FILL[bin],
                  )}
                  title={`${r.name}: ${fmtPct(pct)}`}
                >
                  <span className="block truncate text-[12px] leading-4 font-[650]">
                    {r.symbol}
                  </span>
                  <span className="block text-[12px] leading-4 font-[650] tabular-nums">
                    {fmtPct(pct)}
                  </span>
                </li>
              );
            })}
        </ul>
      ) : noRights ? (
        <WidgetMessage kind="rights" />
      ) : (
        <ListState res={res} />
      )}
    </WidgetCard>
  );
}

// The listing-price rule (spec §4.10, fix b; untradeable rows skipped) and
// "3.4×" come from the one shared module IpoBoard uses too.

export function IpoWidget({ config }: { config: WidgetConfig }) {
  const view = String(config.view ?? 'open');
  const limit = num(config.limit, 5);
  const res = useMarket<IpoBoard>(marketPath.ipos(), 300);
  const snap = useSnapshot(0);
  const board = res.data;
  const titles: Record<string, string> = {
    open: 'IPOs open now',
    upcoming: 'Upcoming IPOs',
    listed: 'Recently listed IPOs',
    issue: 'IPO',
  };
  const priceLabel =
    board?.available && view === 'listed'
      ? listingPriceLabel(board, snap.data)
      : null;
  let body: React.ReactNode;
  if (!board) {
    body = res.loading ? (
      <WidgetSkeleton rows={4} />
    ) : (
      <WidgetMessage kind="error" />
    );
  } else if (!board.available) {
    body = (
      <WidgetMessage kind="error">
        IPO data isn’t available right now.
      </WidgetMessage>
    );
  } else if (view === 'listed') {
    const rows = board.recentlyListed.slice(0, limit);
    body = rows.length ? (
      <ul className="divide-y divide-border text-sm">
        {rows.map((l) => (
          <li
            key={l.symbol}
            className="flex items-center justify-between gap-3 py-2.5"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {l.companyName}
              </span>
              <span className="block text-[13px] leading-[18px] text-muted-foreground">
                Listed {fmtDate(l.listingDate)} · issue ₹
                {fmtPrice(l.issuePrice)}
              </span>
            </span>
            {priceLabel && l.ltp !== null && (
              <span className="text-right">
                <span className="block font-mono tabular-nums">
                  <span className="sr-only">Last price </span>
                  {fmtPrice(l.ltp)}
                </span>
                {l.gainPct !== null && (
                  <span className="block text-[13px] leading-[18px]">
                    <Change
                      change={null}
                      pct={l.gainPct}
                      showAbs={false}
                    />{' '}
                    <span className="text-muted-foreground">since issue</span>
                  </span>
                )}
              </span>
            )}
          </li>
        ))}
      </ul>
    ) : (
      <WidgetMessage kind="empty">No recent listings.</WidgetMessage>
    );
  } else {
    const all = [...board.open, ...board.listingSoon, ...board.upcoming];
    const pool =
      view === 'issue'
        ? all.filter(
            (i) => i.symbol === String(config.symbol ?? '').toUpperCase(),
          )
        : view === 'open'
          ? board.open
          : board.upcoming;
    const rows = pool.slice(0, view === 'issue' ? 1 : limit);
    body = rows.length ? (
      <ul className="divide-y divide-border text-sm">
        {rows.map((i) => (
          <li key={i.symbol} className="py-2.5">
            <p className="flex items-center justify-between gap-3">
              <span className="font-medium">{i.companyName}</span>
              <span className="rounded-[4px] border border-border px-1.5 text-[12px] leading-4 font-[650] whitespace-nowrap">
                {i.segment === 'SME' ? 'SME' : 'Mainboard'}
              </span>
            </p>
            <p className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[13px] leading-[18px] text-muted-foreground sm:grid-cols-4">
              <span>Price band {i.priceRange ?? '—'}</span>
              <span>Opens {fmtDate(i.openDate)}</span>
              <span>Closes {fmtDate(i.closeDate)}</span>
              {i.subscription !== null && (
                <span>Subscribed {fmtTimes(i.subscription)}</span>
              )}
            </p>
          </li>
        ))}
      </ul>
    ) : (
      <WidgetMessage kind="empty">
        {view === 'issue'
          ? 'That IPO isn’t open or upcoming right now.'
          : 'None right now.'}
      </WidgetMessage>
    );
  }
  return (
    <WidgetCard
      title={titles[view] ?? 'IPOs'}
      icon={Rocket}
      footer={
        board?.available && (
          <>
            {/* Offer data, not market prices: "IPO data: NSE · as of …"
                (spec §7.0 rule 3). */}
            <p className="text-[13px] leading-[18px]">
              {board.attribution || 'IPO data: NSE'} · as of{' '}
              {dateline(board.fetchedAt)}
            </p>
            {priceLabel && snap.data && (
              <DataStamp
                className="mt-1"
                label={priceLabel}
                asOf={board.fetchedAt}
                attribution={snap.data.attribution}
              />
            )}
          </>
        )
      }
    >
      {body}
    </WidgetCard>
  );
}
