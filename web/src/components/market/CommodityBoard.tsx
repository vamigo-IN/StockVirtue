'use client';

import { useSnapshot } from '@/components/widgets/data';
import { Change } from '@/components/widgets/frame';
import { stampOf } from '@/components/widgets/format';
import { clsx } from 'clsx';
import type { MarketQuote, Snapshot } from '@/market/types';
import { COPY } from './copy';
import { DayRange } from './DayRange';
import { delayFor } from './gate';
import { MarketStatus } from './MarketStatus';
import {
  BOX,
  contractMonth,
  ModuleError,
  ModuleHead,
  ModuleSkeleton,
  RowStamp,
  SignedChange,
} from './parts';
import { PriceCell } from './PriceCell';
import { Stamp } from './Stamp';
import cb from './commodity-board.module.css';

export interface CommodityBoardProps {
  /** The server's snapshot (`getSnapshot()`); the stream takes over after hydration. */
  initial: Snapshot | null;
  maxCommodities?: number;
  maxCurrencies?: number;
  /**
   * Below 640 px, show only the first N rupee rows (the home band's phone
   * tab: spec §5.1.3 reserves "5 rows × 44 + Stamp", so 4 commodities and
   * USD/INR, the first rupee row). CSS only: the server and the client
   * render the same rows. Omitted: every row at every width.
   */
  phoneCurrencies?: number;
  /** `rail`: rails, the home band, listings (3 columns); `board`: the Commodities hub, in its box. */
  density: 'rail' | 'board';
  /** The h3's id, for an aside's aria-labelledby. */
  titleId?: string;
  className?: string;
}

/**
 * "Commodities and the rupee" (spec §4.10, §5.10.2): every curated MCX
 * COMMODITY row with its unit and contract month ("10 g · Dec future"),
 * then the rupee rates (CURRENCY rows, four decimals). The board adds the
 * Change column (768 px) and the day range (1024 px). MarketStatus "MCX
 * open/closed" sits in the header. One Stamp ends it; rows whose label or time
 * differ (common at night, when MCX is live and NSE is closed) carry their
 * own pill and time. Hidden with no rows and under OFF.
 */
export function CommodityBoard(props: CommodityBoardProps) {
  const live = useSnapshot(15);
  return (
    <CommodityBoardView
      {...props}
      snapshot={live.data ?? props.initial}
      live={!!live.data}
      stale={!!live.error}
      failed={!live.data && !props.initial && !!live.error}
    />
  );
}

/** The board for a resolved snapshot (also the design gallery's fixtures). */
export function CommodityBoardView({
  snapshot,
  live = false,
  stale = false,
  failed = false,
  maxCommodities,
  maxCurrencies,
  phoneCurrencies,
  density,
  titleId,
  className,
}: Omit<CommodityBoardProps, 'initial'> & {
  snapshot: Snapshot | null;
  live?: boolean;
  stale?: boolean;
  failed?: boolean;
}) {
  const board = density === 'board';
  const root = clsx(board && BOX, className);
  const head = (
    <ModuleHead
      title={COPY.commodityTitle}
      id={titleId}
      // "MCX open" / "MCX closed": W0's MarketStatus, from the live payload
      // only (an empty box on the server and the first client render).
      aside={<MarketStatus variant="line" only="commodity" />}
      className="mb-2"
    />
  );

  if (!snapshot) {
    if (failed) {
      return (
        <div className={root}>
          {head}
          <ModuleError />
        </div>
      );
    }
    return (
      <ModuleSkeleton
        className={root}
        rows={(maxCommodities ?? 4) + (maxCurrencies ?? 2)}
      >
        {head}
      </ModuleSkeleton>
    );
  }
  if (snapshot.right === 'OFF') return null;

  const pick = (kind: MarketQuote['kind'], max?: number) => {
    const rows = snapshot.instruments.filter((q) => q.kind === kind);
    return typeof max === 'number' ? rows.slice(0, max) : rows;
  };
  const commodities = pick('COMMODITY', maxCommodities);
  const currencies = pick('CURRENCY', maxCurrencies);
  const all = [...commodities, ...currencies];
  if (!all.length) return null;
  const stamp = stampOf(all);

  const table = (rows: MarketQuote[], caption: string, label: string, phoneRows?: number) =>
    rows.length ? (
      <table className={clsx('sv-mk-table w-full', cb.rows)}>
        <caption className="sv-mk-caption t-meta text-fg-3">{caption}</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">{label}</th>
            <th scope="col">Last</th>
            {board ? (
              <th scope="col" className="hidden md:table-cell">Change</th>
            ) : null}
            <th scope="col">%</th>
            {board ? (
              <th scope="col" className="hidden lg:table-cell">Day range</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((q, i) => {
            const month = contractMonth(q.contract);
            const second = [q.unit, month ? `${month} future` : null]
              .filter(Boolean)
              .join(' · ');
            return (
              <tr
                key={q.ref}
                className={
                  typeof phoneRows === 'number' && i >= phoneRows ? cb.phoneHidden : undefined
                }
              >
                <th scope="row" className="t-small font-semibold text-fg">
                  {q.name}
                  {second ? (
                    <span className="t-meta block font-normal text-fg-3">{second}</span>
                  ) : null}
                  {stamp.own(q) ? <RowStamp label={q.label} asOf={q.asOf} /> : null}
                </th>
                <td className="text-right">
                  <PriceCell value={q.ltp} kind={q.kind} size="num" live={live} />
                </td>
                {board ? (
                  <td className="t-num hidden text-right md:table-cell">
                    <SignedChange value={q.change} kind={q.kind} />
                  </td>
                ) : null}
                <td className="t-num text-right">
                  <Change change={null} pct={q.changePct} showAbs={false} />
                </td>
                {board ? (
                  <td className="hidden text-right lg:table-cell">
                    <DayRange
                      low={q.low}
                      high={q.high}
                      prevClose={q.prevClose}
                      ltp={q.ltp}
                      size="lg"
                      showValues
                      kind={q.kind}
                    />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    ) : null;

  return (
    <div className={root} data-market-module="commodity-board">
      {head}
      {table(commodities, COPY.commodityCaption, 'Commodity')}
      {currencies.length ? (
        <div className={commodities.length ? 'mt-4' : undefined}>
          {table(currencies, COPY.rupeeCaption, 'Rupee rate', phoneCurrencies)}
        </div>
      ) : null}
      <div className="sv-mk-foot">
        <Stamp
          label={stamp.label}
          asOf={stamp.asOf}
          attribution={snapshot.attribution}
          delay={delayFor(snapshot.right, snapshot.delayMinutes)}
          stream="snapshot"
          stale={stale}
        />
      </div>
    </div>
  );
}
