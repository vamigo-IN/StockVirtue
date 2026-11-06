import 'server-only';
import type { ReactNode } from 'react';
import { CommodityBoard } from '@/components/market/CommodityBoard';
import { IndexBoard } from '@/components/market/IndexBoard';
import { IpoWatch } from '@/components/market/IpoBoard';
import { LiveChip, type LiveChipKind } from '@/components/market/LiveChip';
import { MarketStatus } from '@/components/market/MarketStatus';
// The server-safe SVG straight from its module: './MiniChart' also exports
// the client MiniChartLive, which /news doesn't need.
import { MiniChart } from '@/components/market/mini-chart-core';
import { MoversBoard } from '@/components/market/MoversBoard';
import { SectorBars } from '@/components/market/SectorBars';
import { COPY } from '@/components/market/copy';
import { AcademyPanel } from '@/components/public/AcademyPanel';
import { PhoneDisclosure } from '@/components/public/PhoneDisclosure';
import { cn } from '@/lib/utils';
import type { ChartData, IpoBoard, Snapshot } from '@/market/types';
import type { HomeSection } from '@/news/types';
import type { FrontModule } from './assign-modules';
import s from './front.module.css';

/**
 * The market modules beside the news front's bands (spec §5.9.3, §7.3).
 * SERVER component: it renders the client modules with their server data
 * (`initial`), so the HTML has real numbers and hydration matches.
 *
 * Each band's modules sit in ONE `<div data-rail>` (the band grid places
 * it; spec §5.9.1), and each module is its own `<aside>` named by its
 * title: the Academy panel already is one (`aside[aria-label="From
 * StockVirtue"]`), so it goes in without a wrapper. Modules never contain
 * `<section>`, `<article>` or `<h2>`, and never link to stories (only to
 * stock pages, hubs or nothing).
 *
 * A module that draws nothing in the browser (the licence changed after
 * the page was cached, or the data ran out) leaves its aside without a
 * `[data-market-module]` or a loading skeleton: front.module.css then
 * hides that aside and, when the rail has nothing left, gives the stories
 * the whole band (the spec's empty-column rule).
 */

/** What the modules are drawn from (the page's server fetches). */
export interface FrontData {
  snapshot: Snapshot | null;
  ipos: IpoBoard | null;
  /** The Nifty 50 six-month daily chart, only when the Markets band uses it. */
  chart: ChartData | null;
  /** playStoreUrl(settings): the Academy panel's "Get the app" and the house ad. */
  playUrl: string;
}

/** Whether a chart answer can be drawn: available, 2+ candles, a label and a time. */
export function drawableChart(c: ChartData | null | undefined): c is ChartData {
  return Boolean(c && c.available && c.data.candles.length >= 2 && c.label && c.asOf);
}

/** The h3 ids the asides point at (each module appears once per page). */
const MARKETS_NOW_ID = 'module-markets-now';
const COMMODITIES_ID = 'module-commodities';

/** Interface strings (spec §9.6, §5.9.3). */
const MARKETS_NOW = 'Markets now';
const ALL_MARKETS = 'All markets';
const SHOW_MOVES = 'Show the biggest moves';
const SHOW_SECTORS = 'Show sector moves';
/** The fallback chart's name when the snapshot has no Nifty 50 row. */
const NIFTY_50 = 'Nifty 50';

/**
 * Markets now (spec §5.9.3 row 1, §7.3): the h3, the session line
 * ("NSE & BSE open · MCX open · Currency closed"), then IndexBoard compact
 * with at most 6 INDEX rows (4 on phones, front.module.css), its Stamp and
 * the quiet link "All markets". The board brings no title of its own, so
 * the session line sits between the heading and the table. Streamed from
 * the snapshot; under OFF the board renders nothing and the aside hides.
 */
export function MarketsNow({
  snapshot,
  headingId = MARKETS_NOW_ID,
  className,
}: {
  snapshot: Snapshot | null;
  headingId?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <h3 id={headingId} className="t-rail-title m-0 text-fg">
        {MARKETS_NOW}
      </h3>
      <MarketStatus variant="line" className="mt-1" />
      <IndexBoard
        initial={snapshot}
        density="compact"
        limit={6}
        moreHref="/news/markets"
        moreLabel={ALL_MARKETS}
        className="mt-2"
      />
    </div>
  );
}

function Module({ module, data }: { module: FrontModule; data: FrontData }): ReactNode {
  switch (module) {
    case 'markets-now':
      return (
        <aside aria-labelledby={MARKETS_NOW_ID} className={s.module} data-module={module}>
          <MarketsNow snapshot={data.snapshot} />
        </aside>
      );
    case 'movers':
      return (
        <aside aria-label={COPY.moversTitle} className={s.module} data-module={module}>
          <PhoneDisclosure variant="tail" summary={SHOW_MOVES}>
            <MoversBoard variant="rail" />
          </PhoneDisclosure>
        </aside>
      );
    case 'sectors':
      return (
        <aside aria-label={COPY.sectorsTitle} className={s.module} data-module={module}>
          <PhoneDisclosure variant="tail" summary={SHOW_SECTORS}>
            <SectorBars variant="compact" />
          </PhoneDisclosure>
        </aside>
      );
    case 'nifty-chart': {
      const c = data.chart;
      if (!drawableChart(c)) return null;
      const name =
        data.snapshot?.instruments.find((q) => q.ref === 'NSE:NIFTY')?.name ?? NIFTY_50;
      return (
        <aside aria-label={name} className={s.module} data-module={module}>
          <MiniChart
            candles={c.data.candles}
            label={name}
            size="card"
            range="6M"
            index
            stamp={{ label: c.label, asOf: c.asOf, attribution: c.attribution }}
          />
        </aside>
      );
    }
    case 'ipo-watch':
      return (
        <aside aria-label={COPY.ipoWatchTitle} className={s.module} data-module={module}>
          <IpoWatch initial={data.ipos} />
        </aside>
      );
    case 'commodities':
      return (
        <aside aria-labelledby={COMMODITIES_ID} className={s.module} data-module={module}>
          <CommodityBoard
            initial={data.snapshot}
            density="rail"
            maxCommodities={4}
            maxCurrencies={2}
            titleId={COMMODITIES_ID}
          />
        </aside>
      );
    case 'academy':
      return (
        <AcademyPanel headingLevel="h3" playUrl={data.playUrl} className={cn(s.module, s.academy)} />
      );
    default:
      return null;
  }
}

/**
 * The rail of one band: its modules, top to bottom, in one
 * `<div data-rail>`. Null without modules (the band then has no rail).
 */
export function BandRail({
  modules,
  data,
  className,
}: {
  modules: readonly FrontModule[];
  data: FrontData;
  className?: string;
}) {
  if (!modules.length) return null;
  return (
    <div data-rail="" className={cn(s.rail, className)}>
      {modules.map((m) => (
        <Module key={m} module={m} data={data} />
      ))}
    </div>
  );
}

/**
 * Which LiveChip a section's RuleHead carries (spec §5.9.4, §7.3): the
 * Markets, Commodities and IPOs categories; null for every other section.
 */
export function chipKind(section: HomeSection): LiveChipKind | null {
  if (section.type !== 'category') return null;
  switch (section.category?.slug) {
    case 'markets':
      return 'markets';
    case 'commodities':
      return 'commodities';
    case 'ipo':
      return 'ipo';
    default:
      return null;
  }
}

/**
 * The LiveChip in a section's RuleHead aside (>= 768 px only, by its own
 * CSS): Markets (Nifty 50), Commodities (the first commodity) and IPOs
 * ("{n} open now"). Null for every other section.
 */
export function BandChip({ section, data }: { section: HomeSection; data: FrontData }) {
  const kind = chipKind(section);
  if (!kind) return null;
  return kind === 'ipo' ? (
    <LiveChip kind="ipo" initialIpos={data.ipos} />
  ) : (
    <LiveChip kind={kind} initialSnapshot={data.snapshot} />
  );
}
