import { fmtPrice } from '@/components/widgets/format';
import { clsx } from 'clsx';
import type { InstrumentKind } from '@/market/types';

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/**
 * The day's range (spec §4.10): an 80 × 4 track (120 × 4 with `size="lg"`,
 * hubs and the stock page) from the low to the high in `--sv-surface-3`, a
 * 1 px `--sv-fg-3` tick at the previous close and a 6 px ink dot at the
 * last price. `showValues` prints the low and the high under the track in
 * `meta`. Hidden when any value is missing.
 *
 * Server-safe: no hooks. The picture is one labelled image for screen
 * readers: "Day range 23,812.75 to 24,163.87, last 24,069.43".
 */
export function DayRange({
  low,
  high,
  prevClose,
  ltp,
  size = 'sm',
  showValues = false,
  kind,
  className,
}: {
  low: number | null;
  high: number | null;
  prevClose: number | null;
  ltp: number | null;
  size?: 'sm' | 'lg';
  showValues?: boolean;
  /** For the decimals (currency rates have four). */
  kind?: InstrumentKind;
  className?: string;
}) {
  if (low === null || high === null || prevClose === null || ltp === null) {
    return null;
  }
  const span = high - low;
  const at = (v: number) => (span > 0 ? clamp(((v - low) / span) * 100) : 50);
  const label = `Day range ${fmtPrice(low, kind)} to ${fmtPrice(high, kind)}, last ${fmtPrice(ltp, kind)}`;
  return (
    <span
      className={clsx('sv-dayrange', className)}
      data-size={size}
    >
      <span className="sv-dayrange-track" role="img" aria-label={label}>
        <span className="sv-dayrange-prev" style={{ left: `${at(prevClose)}%` }} />
        <span className="sv-dayrange-dot" style={{ left: `${at(ltp)}%` }} />
      </span>
      {showValues ? (
        <span className="sv-dayrange-values t-meta text-fg-3" aria-hidden="true">
          <span>{fmtPrice(low, kind)}</span>
          <span>{fmtPrice(high, kind)}</span>
        </span>
      ) : null}
    </span>
  );
}
