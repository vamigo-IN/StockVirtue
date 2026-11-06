'use client';

import Link from 'next/link';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/public/ui/Tabs';
import { useSnapshot } from '@/components/widgets/data';
import { Change } from '@/components/widgets/frame';
import { fmtDate, fmtPrice } from '@/components/widgets/format';
import { clsx } from 'clsx';
import { marketPath } from '@/market/paths';
import type {
  IpoBoard as IpoBoardData,
  IpoIssue,
  ListedIpo,
  Snapshot,
} from '@/market/types';
import { dateline } from '@/news/format';
import { COPY, ipoFooter, showMoreListings } from './copy';
import { fmtTimes, listingPriceLabel } from './listing-price';
import { BOX, ModuleError, ModuleHead, ModuleSkeleton } from './parts';
import { Stamp } from './Stamp';
import { useInViewMarket } from './useInViewMarket';
import { STACKED_PANEL, useMinWidth } from './useMinWidth';

type TableKey = keyof typeof COPY.ipoTables;
const TABLES: TableKey[] = ['open', 'upcoming', 'listingSoon', 'recentlyListed'];
/** Recently listed shows this many, newest first; the rest wait behind <details>. */
const RECENT_FIRST = 10;

// The listing-price rule and the "3.4×" format live in listing-price.ts,
// shared with the article IPO widget (one rule, never two copies).
export { fmtTimes, listingPriceLabel };

/** Mainboard / SME, 12/16 in a 1 px line, radius 4. */
function SegmentTag({ segment }: { segment: IpoIssue['segment'] }) {
  return <span className="sv-ipo-tag">{segment === 'SME' ? 'SME' : 'Mainboard'}</span>;
}

function Company({ name, segment }: { name: string; segment: IpoIssue['segment'] }) {
  return (
    <th scope="row" className="sv-ipo-company t-small font-semibold text-fg">
      <span>{name}</span> <SegmentTag segment={segment} />
    </th>
  );
}

/** "3.4×" with a 48 px bar to fully subscribed (1×); bold from 1×. */
function Subscribed({ n }: { n: number | null }) {
  if (n === null) return <span className="text-fg-3">–</span>;
  return (
    <span className="sv-ipo-sub">
      <span className={clsx('t-num', n >= 1 && 'font-[650]')}>{fmtTimes(n)}</span>
      <span className="sv-ipo-subbar" aria-hidden="true">
        <span style={{ width: `${Math.min(n, 1) * 48}px` }} />
      </span>
    </span>
  );
}

/**
 * The IPO calendar (spec §4.10, §5.10.3): Open now, Upcoming, Listing soon
 * and Recently listed, stacked (each table under its h3) from 768 px and
 * Radix Tabs below. Rows are <tr>, never links. Recently listed shows the
 * ten newest, then a native <details> "Show {n} more listings", closed at
 * every width. "Last price" and "Since issue" follow the listing-price rule
 * (`listingPriceLabel`) and then carry their own Stamp; the footer is
 * always "IPO data: NSE · as of {fetchedAt}". Works under every licence.
 *
 * `initial` is the server's `getIpos()`; `initialSnapshot` (optional) lets
 * the server render already apply the listing-price rule.
 */
export function IpoBoard({
  initial,
  initialSnapshot,
  className,
}: {
  initial: IpoBoardData | null;
  initialSnapshot?: Snapshot | null;
  className?: string;
}) {
  const res = useInViewMarket<IpoBoardData>(marketPath.ipos(), 300);
  const snap = useSnapshot(15);
  const board = res.data ?? initial;
  return (
    <div ref={res.ref} className={className}>
      <IpoBoardView
        board={board}
        snapshot={snap.data ?? initialSnapshot ?? null}
        failed={!board && !!res.error}
      />
    </div>
  );
}

/** The calendar for a resolved board (also the design gallery's fixtures). */
export function IpoBoardView({
  board,
  snapshot,
  failed = false,
  className,
}: {
  board: IpoBoardData | null;
  snapshot: Pick<Snapshot, 'right' | 'sessions' | 'attribution'> | null;
  failed?: boolean;
  className?: string;
}) {
  const root = clsx('sv-ipo', BOX, className);
  // From 768 px the four tables stack under their h3s and the tab list is
  // hidden: the panels then drop their tab semantics (A-5).
  const stacked = useMinWidth(768);
  if (!board) {
    return failed ? (
      <div className={root}>
        <ModuleError>{COPY.ipoUnavailable}</ModuleError>
      </div>
    ) : (
      <ModuleSkeleton className={root} rows={8} />
    );
  }
  if (!board.available) {
    return (
      <div className={root}>
        <ModuleError>{COPY.ipoUnavailable}</ModuleError>
      </div>
    );
  }
  const priceLabel = listingPriceLabel(board, snapshot);
  const recent = [...board.recentlyListed].sort((a, b) =>
    b.listingDate.localeCompare(a.listingDate),
  );
  const counts: Record<TableKey, number> = {
    open: board.open.length,
    upcoming: board.upcoming.length,
    listingSoon: board.listingSoon.length,
    recentlyListed: recent.length,
  };
  // An empty list is left out, with its tab (the shared "empty: hidden").
  const tables = TABLES.filter((t) => counts[t] > 0);

  const panel = (t: TableKey) => {
    switch (t) {
      case 'open':
        return (
          <IssueTable
            caption={COPY.ipoTables.open}
            rows={board.open}
            cols={['band', 'closes', 'subscribed']}
          />
        );
      case 'upcoming':
        return (
          <IssueTable
            caption={COPY.ipoTables.upcoming}
            rows={board.upcoming}
            cols={['band', 'opens', 'closes']}
          />
        );
      case 'listingSoon':
        return (
          <IssueTable
            caption={COPY.ipoTables.listingSoon}
            rows={board.listingSoon}
            cols={['closedOn', 'band']}
          />
        );
      case 'recentlyListed':
        return (
          <>
            <ListedTable
              caption={COPY.ipoTables.recentlyListed}
              rows={recent.slice(0, RECENT_FIRST)}
              prices={!!priceLabel}
            />
            {recent.length > RECENT_FIRST ? (
              <details className="sv-ipo-more">
                <summary className="t-small">
                  {showMoreListings(recent.length - RECENT_FIRST)}
                </summary>
                <ListedTable
                  caption={`${COPY.ipoTables.recentlyListed}, older`}
                  rows={recent.slice(RECENT_FIRST)}
                  prices={!!priceLabel}
                />
              </details>
            ) : null}
          </>
        );
    }
  };

  return (
    <div className={root} data-market-module="ipo-board">
      {tables.length ? (
        <Tabs defaultValue={tables[0]} className="sv-ipo-tabs">
          <TabsList aria-label="IPO calendar" scrollable className="sv-ipo-tablist">
            {tables.map((t) => (
              <TabsTrigger key={t} value={t}>
                {COPY.ipoTables[t]}
              </TabsTrigger>
            ))}
          </TabsList>
          {tables.map((t) => (
            <TabsContent
              key={t}
              value={t}
              forceMount
              className="sv-ipo-panel"
              {...(stacked ? STACKED_PANEL : {})}
            >
              <h3 className="sv-ipo-h3 t-rail-title text-fg">{COPY.ipoTables[t]}</h3>
              {panel(t)}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        // Existing wording (the IPO widget's empty state).
        <p className="t-small text-fg-2">None right now.</p>
      )}
      <div className="sv-mk-foot">
        <p className="t-meta text-fg-3">
          {ipoFooter(board.attribution, dateline(board.fetchedAt))}
        </p>
        {priceLabel && snapshot ? (
          <Stamp
            label={priceLabel}
            asOf={board.fetchedAt}
            attribution={snapshot.attribution}
          />
        ) : null}
      </div>
    </div>
  );
}

type IssueCol = 'band' | 'opens' | 'closes' | 'closedOn' | 'subscribed';
const ISSUE_HEAD: Record<IssueCol, string> = {
  band: 'Price band',
  opens: 'Opens',
  closes: 'Closes',
  closedOn: 'Closed on',
  subscribed: 'Subscribed',
};

function IssueTable({
  caption,
  rows,
  cols,
}: {
  caption: string;
  rows: IpoIssue[];
  cols: IssueCol[];
}) {
  return (
    <table className="sv-mk-table sv-ipo-table w-full">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Company</th>
          {cols.map((c) => (
            <th key={c} scope="col">
              {ISSUE_HEAD[c]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((i) => (
          <tr key={i.symbol}>
            <Company name={i.companyName} segment={i.segment} />
            {cols.map((c) => (
              <td key={c} data-label={c === 'band' ? undefined : ISSUE_HEAD[c]}>
                {c === 'band' ? (
                  <span className="t-mono">{i.priceRange ?? '–'}</span>
                ) : c === 'opens' ? (
                  fmtDate(i.openDate)
                ) : c === 'closes' || c === 'closedOn' ? (
                  fmtDate(i.closeDate)
                ) : (
                  <Subscribed n={i.subscription} />
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ListedTable({
  caption,
  rows,
  prices,
}: {
  caption: string;
  rows: ListedIpo[];
  prices: boolean;
}) {
  return (
    <table className="sv-mk-table sv-ipo-table w-full">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Company</th>
          <th scope="col">Listed</th>
          <th scope="col">Issue price</th>
          {prices ? (
            <>
              <th scope="col">{COPY.lastPrice}</th>
              <th scope="col">{COPY.sinceIssue}</th>
            </>
          ) : null}
        </tr>
      </thead>
      <tbody>
        {rows.map((l) => (
          <tr key={l.symbol}>
            <Company name={l.companyName} segment={l.segment} />
            <td data-label="Listed">{fmtDate(l.listingDate)}</td>
            <td data-label="Issue price" className="t-num">
              {l.issuePrice === null ? '–' : `₹${fmtPrice(l.issuePrice)}`}
            </td>
            {prices ? (
              <>
                <td data-label={COPY.lastPrice} className="t-num">
                  {l.ltp === null ? '–' : `₹${fmtPrice(l.ltp)}`}
                </td>
                <td data-label={COPY.sinceIssue} className="t-num">
                  <Change change={null} pct={l.gainPct} showAbs={false} />
                </td>
              </>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * "IPO watch" (spec §4.10): the compact board for the home band, /news and
 * story rails. Open now (≤ 3), then Upcoming (≤ 2); with none open, "No
 * IPOs are open right now. These open next." and Upcoming (≤ 3). The link
 * "IPO calendar". Offer data, not prices: no Stamp; its footer is "IPO
 * data: NSE · as of {fetchedAt}". Hidden when both lists are empty.
 */
export function IpoWatch({
  initial,
  headingLevel = 'h3',
  className,
}: {
  initial: IpoBoardData | null;
  headingLevel?: 'h2' | 'h3';
  className?: string;
}) {
  const res = useInViewMarket<IpoBoardData>(marketPath.ipos(), 300);
  const board = res.data ?? initial;
  return (
    <div ref={res.ref} className={className}>
      <IpoWatchView board={board} headingLevel={headingLevel} failed={!board && !!res.error} />
    </div>
  );
}

/** IPO watch for a resolved board (also the design gallery's fixtures). */
export function IpoWatchView({
  board,
  headingLevel = 'h3',
  failed = false,
  className,
}: {
  board: IpoBoardData | null;
  headingLevel?: 'h2' | 'h3';
  failed?: boolean;
  className?: string;
}) {
  const H = headingLevel;
  const Sub = headingLevel === 'h2' ? 'h3' : 'h4';
  const head = <H className="t-rail-title m-0 text-fg">{COPY.ipoWatchTitle}</H>;
  if (!board) {
    return failed ? (
      <div className={className}>
        {head}
        <ModuleError className="mt-2">{COPY.ipoUnavailable}</ModuleError>
      </div>
    ) : (
      <ModuleSkeleton className={className} rows={5} rowHeight={52}>
        {head}
      </ModuleSkeleton>
    );
  }
  if (!board.available) {
    return (
      <div className={className}>
        {head}
        <ModuleError className="mt-2">{COPY.ipoUnavailable}</ModuleError>
      </div>
    );
  }
  if (!board.open.length && !board.upcoming.length) return null;
  const open = board.open.slice(0, 3);
  const upcoming = board.upcoming.slice(0, open.length ? 2 : 3);
  const item = (i: IpoIssue, when: 'open' | 'upcoming') => (
    <li key={i.symbol} className="sv-ipowatch-row">
      <p className="t-small m-0 font-semibold text-fg">
        {i.companyName} <SegmentTag segment={i.segment} />
      </p>
      <p className="t-meta m-0 text-fg-2">
        {[
          i.priceRange,
          when === 'open' ? `Closes ${fmtDate(i.closeDate)}` : `Opens ${fmtDate(i.openDate)}`,
          when === 'open' && i.subscription !== null
            ? `Subscribed ${fmtTimes(i.subscription)}`
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
    </li>
  );
  return (
    <div className={className} data-market-module="ipo-watch">
      {head}
      {open.length ? (
        <>
          <Sub className="t-label mt-3 text-fg-2">{COPY.ipoTables.open}</Sub>
          <ul className="sv-ipowatch-list">{open.map((i) => item(i, 'open'))}</ul>
        </>
      ) : (
        <p className="t-small mt-2 text-fg-2">{COPY.ipoNoneOpen}</p>
      )}
      {upcoming.length ? (
        <>
          <Sub className="t-label mt-3 text-fg-2">{COPY.ipoTables.upcoming}</Sub>
          <ul className="sv-ipowatch-list">{upcoming.map((i) => item(i, 'upcoming'))}</ul>
        </>
      ) : null}
      <div className="sv-mk-foot">
        <p className="t-meta text-fg-3">
          {ipoFooter(board.attribution, dateline(board.fetchedAt))}
        </p>
        <Link href="/news/ipo" className="sv-quiet sv-quiet-hit t-small">
          {COPY.ipoCalendar}
        </Link>
      </div>
    </div>
  );
}
