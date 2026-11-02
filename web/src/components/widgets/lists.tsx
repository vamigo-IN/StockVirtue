'use client';

import {
  Activity,
  ChartColumn,
  LayoutGrid,
  Rocket,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IpoBoard, Labelled, ListRow } from '@/market/types';
import { useMarket, useWidgetMode } from './data';
import { fmtDate, fmtPct, fmtPrice, fmtVolume } from './format';
import {
  Change,
  DataStamp,
  WidgetCard,
  WidgetMessage,
  WidgetSkeleton,
} from './frame';
import type { WidgetConfig } from './meta';

const num = (v: unknown, fb: number) => (typeof v === 'number' ? v : fb);
const SEGMENTS: Record<string, string> = {
  largecap: 'Large caps',
  midcap: 'Mid caps',
  smallcap: 'Small caps',
};

/** Shared states for list answers. */
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

function Movers({
  config,
  type,
}: {
  config: WidgetConfig;
  type: 'gainers' | 'losers' | 'active';
}) {
  const limit = num(config.limit, 5);
  const segment = String(config.segment ?? 'largecap');
  const path =
    type === 'active'
      ? `movers?type=active&limit=${limit}`
      : `movers?type=${type}&segment=${segment}&limit=${limit}`;
  const res = useMarket<Labelled<ListRow[]>>(path, num(config.refresh, 30));
  const mode = useWidgetMode();
  const title =
    type === 'gainers'
      ? `Top gainers · ${SEGMENTS[segment] ?? ''}`
      : type === 'losers'
        ? `Top losers · ${SEGMENTS[segment] ?? ''}`
        : 'Most active stocks';
  const Icon =
    type === 'gainers'
      ? TrendingUp
      : type === 'losers'
        ? TrendingDown
        : Activity;
  const rows = res.data?.available ? res.data.data : [];
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
          />
        )
      }
    >
      {rows.length ? (
        <ol className="divide-y divide-border text-sm">
          {rows.map((r, i) => (
            <li key={r.ref} className="flex items-center gap-3 py-2.5">
              <span className="w-5 font-mono text-xs text-muted-foreground tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                {mode === 'public' ? (
                  <a
                    href={`/news/stocks/${r.symbol}`}
                    className="block truncate font-medium hover:text-primary hover:underline"
                  >
                    {r.name}
                  </a>
                ) : (
                  <span className="block truncate font-medium">{r.name}</span>
                )}
                <span className="block font-mono text-[11px] text-muted-foreground">
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
                  className="text-xs"
                />
              </span>
            </li>
          ))}
        </ol>
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
    'sectors',
    num(config.refresh, 30),
  );
  const rows = (res.data?.available ? res.data.data : [])
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
                  className="relative h-3 rounded bg-muted"
                  aria-hidden="true"
                >
                  <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                  <span
                    className={cn(
                      'absolute inset-y-0 rounded',
                      pct >= 0
                        ? 'left-1/2 bg-emerald-500'
                        : 'right-1/2 bg-red-500',
                    )}
                    style={{ width }}
                  />
                </span>
                <Change
                  change={null}
                  pct={pct}
                  showAbs={false}
                  className="text-right text-xs"
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <ListState res={res} />
      )}
    </WidgetCard>
  );
}

const HEAT_INDEX: Record<string, string> = {
  NIFTY: 'Nifty 50',
  BANKNIFTY: 'Bank Nifty',
  SENSEX: 'Sensex',
};

/** Colour for a % move: deeper green or red the bigger it is (±3% = full). */
function heat(pct: number) {
  const a = Math.min(1, Math.abs(pct) / 3);
  return pct >= 0
    ? `rgba(22, 163, 74, ${0.12 + a * 0.78})`
    : `rgba(220, 38, 38, ${0.12 + a * 0.78})`;
}

export function HeatmapWidget({ config }: { config: WidgetConfig }) {
  const index = String(config.index ?? 'NIFTY');
  const res = useMarket<Labelled<ListRow[]>>(
    `heatmap?index=${index}`,
    num(config.refresh, 60),
  );
  const rows = (res.data?.available ? res.data.data : []).filter(
    (r) => r.changePct !== null,
  );
  return (
    <WidgetCard
      title={`${HEAT_INDEX[index] ?? index} heatmap`}
      icon={LayoutGrid}
      footer={
        rows.length > 0 && (
          <DataStamp
            label={res.data?.label}
            asOf={res.data?.asOf}
            attribution={res.data?.attribution}
          />
        )
      }
    >
      {rows.length ? (
        <ul className="grid grid-cols-3 gap-1 sm:grid-cols-5 lg:grid-cols-6">
          {[...rows]
            .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
            .map((r) => {
              const pct = r.changePct ?? 0;
              return (
                <li
                  key={r.ref}
                  className={cn(
                    'rounded px-2 py-2 text-center',
                    Math.abs(pct) > 1.5 ? 'text-white' : 'text-foreground',
                  )}
                  style={{ background: heat(pct) }}
                  title={`${r.name}: ${fmtPct(pct)}`}
                >
                  <span className="block truncate font-mono text-[11px] font-semibold">
                    {r.symbol}
                  </span>
                  <span className="block font-mono text-xs tabular-nums">
                    {fmtPct(pct)}
                  </span>
                </li>
              );
            })}
        </ul>
      ) : (
        <ListState res={res} />
      )}
    </WidgetCard>
  );
}

export function IpoWidget({ config }: { config: WidgetConfig }) {
  const view = String(config.view ?? 'open');
  const limit = num(config.limit, 5);
  const res = useMarket<IpoBoard>('ipos', 300);
  const board = res.data;
  const titles: Record<string, string> = {
    open: 'IPOs open now',
    upcoming: 'Upcoming IPOs',
    listed: 'Recently listed IPOs',
    issue: 'IPO',
  };
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
              <span className="block text-xs text-muted-foreground">
                Listed {fmtDate(l.listingDate)} · issue ₹
                {fmtPrice(l.issuePrice)}
              </span>
            </span>
            <span className="text-right">
              {l.ltp !== null && (
                <span className="block font-mono tabular-nums">
                  {fmtPrice(l.ltp)}
                </span>
              )}
              {l.gainPct !== null && (
                <Change
                  change={null}
                  pct={l.gainPct}
                  showAbs={false}
                  className="text-xs"
                />
              )}
              {l.gainPct !== null && (
                <span className="block text-[10px] text-muted-foreground">
                  vs issue
                </span>
              )}
            </span>
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
              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                {i.segment === 'SME' ? 'SME' : 'Mainboard'}
              </span>
            </p>
            <p className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-4">
              <span>Price band {i.priceRange ?? '—'}</span>
              <span>Opens {fmtDate(i.openDate)}</span>
              <span>Closes {fmtDate(i.closeDate)}</span>
              {i.subscription !== null && (
                <span>Subscribed {i.subscription.toFixed(2)}×</span>
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
          <DataStamp
            label={null}
            asOf={board.fetchedAt}
            attribution={board.attribution}
          />
        )
      }
    >
      {body}
    </WidgetCard>
  );
}
