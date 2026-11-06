import Link from 'next/link';
import type { ReactNode } from 'react';
import { LabelPill } from '@/components/widgets/frame';
import { direction, fmtChange } from '@/components/widgets/format';
import { StampTime } from '@/components/widgets/StampTime';
import { clsx } from 'clsx';
import type { DataLabel, InstrumentKind, MarketQuote, Snapshot } from '@/market/types';
import { newsPath } from '@/news/routes';
import { COPY } from './copy';

/**
 * Small pieces the market modules share (spec §4.10 "Shared states": one
 * vocabulary, never a pile of lock boxes). Server-safe: no hooks.
 */

/** A hub module's box: radius 12, a hairline, white (spec §5.10). */
export const BOX = 'rounded-[16px] border border-rule bg-card p-4 sm:p-5';

/**
 * A row's own pill and time, for a row whose label or time differs from the
 * module's Stamp (spec §4.10; common at night, when MCX is live and NSE is
 * closed). It goes in the row header, under the name and its second line,
 * never under the price: in a 360 px phone or a 300 px rail a no-wrap stamp
 * under the price squeezed the names to three lines and pushed "%" past the
 * card (W6, B-3). It may wrap between the pill and the time, never inside
 * either.
 */
export function RowStamp({ label, asOf }: { label: DataLabel; asOf: string | null | undefined }) {
  return (
    <span className="t-meta mt-0.5 block font-normal text-fg-3">
      <LabelPill label={label} />{' '}
      <span className="sr-only">{COPY.pricesAsOf}</span>
      <span className="whitespace-nowrap">
        <StampTime iso={asOf} />
      </span>
    </span>
  );
}

/** The h3 every module opens with (`rail-title`). */
export function ModuleHead({
  title,
  id,
  aside,
  className,
}: {
  title: ReactNode;
  id?: string;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'flex flex-wrap items-center justify-between gap-x-3 gap-y-2',
        className,
      )}
    >
      <h3 id={id} className="t-rail-title m-0 text-fg">
        {title}
      </h3>
      {aside}
    </div>
  );
}

/**
 * Loading: skeleton rows at the final height (`aria-busy`, "Loading market
 * data"), plus the stamp's two lines, so nothing shifts when data arrives.
 * Still: nothing pulses or loops.
 */
export function ModuleSkeleton({
  rows,
  rowHeight = 44,
  head = true,
  stamp = true,
  className,
  children,
}: {
  rows: number;
  rowHeight?: number;
  head?: boolean;
  stamp?: boolean;
  className?: string;
  /** A real head (title, tabs) to keep above the skeleton rows. */
  children?: ReactNode;
}) {
  return (
    <div
      className={className}
      aria-busy="true"
      aria-label={COPY.loading}
      role="group"
    >
      {children}
      {head && !children ? <div className="mb-3 h-5 w-32 rounded-[4px] bg-muted" /> : null}
      <div>
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="flex items-center border-b border-rule last:border-b-0"
            style={{ height: rowHeight }}
          >
            <div
              className="h-3.5 rounded-[4px] bg-muted"
              style={{ width: `${72 - ((i * 17) % 30)}%` }}
            />
          </div>
        ))}
      </div>
      {stamp ? <div className="mt-3 h-9" aria-hidden="true" /> : null}
    </div>
  );
}

/** No data at all (the store's fetch failed and nothing was kept). */
export function ModuleError({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <p className={clsx('t-small flex items-start gap-2 text-fg-2', className)}>
      <AlertGlyph />
      <span>{children ?? COPY.errorNoData}</span>
    </p>
  );
}

function AlertGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="mt-[3px] shrink-0"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}

/** Lucide's lock, inline (DataNotice and the rights lines). */
export function LockGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="mt-[3px] shrink-0"
    >
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

/**
 * A signed absolute move ("+140.72", "−11.83") in the direction colour, for
 * a table's Change column (the % column carries the triangle). `neutral`
 * for volatility indices. An en dash when there is no value yet.
 */
export function SignedChange({
  value,
  kind,
  neutral = false,
  className,
}: {
  value: number | null;
  kind?: InstrumentKind;
  neutral?: boolean;
  className?: string;
}) {
  if (value === null) {
    return (
      <span className={clsx('text-fg-3', className)}>
        <span aria-hidden="true">–</span>
        <span className="sr-only">{COPY.noChange}</span>
      </span>
    );
  }
  const dir = direction(value);
  return (
    <span
      data-dir={dir}
      className={clsx(
        'whitespace-nowrap tabular-nums',
        !neutral && (dir === 'up' ? 'text-up' : dir === 'down' ? 'text-down' : 'text-fg-3'),
        className,
      )}
    >
      {fmtChange(value, kind)}
    </span>
  );
}

/** "/news/stocks/INFY" for "NSE:INFY" or "INFY". */
export function stockHref(refOrSymbol: string): string {
  const sym = refOrSymbol.includes(':')
    ? refOrSymbol.slice(refOrSymbol.indexOf(':') + 1)
    : refOrSymbol;
  return newsPath.stock(sym.toUpperCase());
}

/**
 * A stock's name: a link to its stock page only when the page will have a
 * price (`quotable`, from useQuotable()), never prefetched (plan §0.13: each
 * prefetch of a cold stock page renders it, which can cost a broker call);
 * otherwise plain text.
 */
export function StockName({
  refId,
  quotable,
  children,
  className,
  ...rest
}: {
  refId: string;
  quotable: boolean;
  children: ReactNode;
  className?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  'aria-label'?: string;
  'data-bin'?: string;
  title?: string;
}) {
  if (!quotable) {
    return <span className={className}>{children}</span>;
  }
  return (
    <Link
      href={stockHref(refId)}
      prefetch={false}
      className={clsx('sv-mk-link', className)}
      {...rest}
    >
      {children}
    </Link>
  );
}

/** "Dec" from a futures contract ("GOLD26DECFUT", "GOLD05DEC26FUT", "USDINR26NOVFUT"). */
export function contractMonth(contract: string | null | undefined): string | null {
  if (!contract) return null;
  const m = /\d(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/.exec(
    contract.toUpperCase(),
  );
  return m ? m[1][0] + m[1].slice(1).toLowerCase() : null;
}

/**
 * The quote LiveChip shows (spec §4.10, §7.3): Nifty 50 for markets, the
 * first COMMODITY row for commodities. None under OFF or without a
 * snapshot, and then the chip is omitted. Here, not in LiveChip.tsx, so
 * server code (the design gallery's OFF state) can call it too.
 */
export function liveChipQuote(
  s: Snapshot | null | undefined,
  kind: 'markets' | 'commodities',
): MarketQuote | undefined {
  if (!s || s.right === 'OFF') return undefined;
  return kind === 'markets'
    ? s.instruments.find((q) => q.ref === 'NSE:NIFTY')
    : s.instruments.find((q) => q.kind === 'COMMODITY');
}
