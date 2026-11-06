'use client';

import Link from 'next/link';
import { useSnapshot } from '@/components/widgets/data';
import { fmtPct } from '@/components/widgets/format';
import { useInView } from '@/lib/hooks/useInView';
import { clsx } from 'clsx';
import { marketPath } from '@/market/paths';
import type { Labelled, ListRow } from '@/market/types';
import { COPY } from './copy';
import { BOX, ModuleError, ModuleHead, ModuleSkeleton } from './parts';
import { Stamp } from './Stamp';
import { useInViewMarket, type InViewMarket } from './useInViewMarket';

export type SectorVariant = 'compact' | 'full';
type SectorRes = Pick<InViewMarket<Labelled<ListRow[]>>, 'data' | 'error' | 'loading'>;

/**
 * "Sector moves" (spec §4.10): the 14 sector indices sorted by the day's
 * change, each a diverging bar from a centre axis (up to the right in
 * --sv-up, down to the left in --sv-down) with its value just beyond the
 * bar's end. The bars grow from the axis once, when 40% of the module is
 * in view (600 ms; none under reduced motion).
 * - `compact` (home, rails): the top 3 and the bottom 3, then the quiet
 *   link "All 14 sectors on the Markets page".
 * - `full` (the Markets hub, in its box): all 14, in two columns of 7 from
 *   1024 px.
 * A Stamp ends it. LIVE only (nothing under any other licence); polled
 * every 30 s while near the viewport.
 */
export function SectorBars({
  variant,
  boxed,
  className,
}: {
  variant: SectorVariant;
  /** Its own hub box (default: only the `full` variant has one). */
  boxed?: boolean;
  className?: string;
}) {
  const snap = useSnapshot(15);
  const right = snap.data?.right;
  const res = useInViewMarket<Labelled<ListRow[]>>(
    right === 'LIVE' ? marketPath.sectors() : null,
    30,
  );
  if (right && right !== 'LIVE') return null;
  const failed = !snap.data && !!snap.error;
  return (
    <div ref={res.ref} className={className}>
      <SectorBarsView
        variant={variant}
        boxed={boxed}
        res={failed && !res.data ? { loading: false, error: 'unavailable' } : res}
      />
    </div>
  );
}

/** The bars for a resolved answer (also the design gallery's fixtures). */
export function SectorBarsView({
  variant,
  boxed,
  res,
  className,
}: {
  variant: SectorVariant;
  boxed?: boolean;
  res: SectorRes;
  className?: string;
}) {
  const [growRef, grown] = useInView<HTMLDivElement>({ threshold: 0.4, once: true });
  const full = variant === 'full';
  const root = clsx('sv-sectors', (boxed ?? full) && BOX, className);
  const head = <ModuleHead title={COPY.sectorsTitle} className="mb-2" />;
  const payload = res.data;
  if (!payload) {
    return res.loading ? (
      <ModuleSkeleton className={root} rows={full ? 7 : 6} rowHeight={32}>
        {head}
      </ModuleSkeleton>
    ) : (
      <div className={root}>
        {head}
        <ModuleError />
      </div>
    );
  }
  const sorted = (payload.available ? payload.data : [])
    .filter((r) => r.changePct !== null)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  if (!payload.available || !sorted.length || !payload.label || !payload.asOf) {
    return (
      <div className={root}>
        {head}
        <ModuleError>{payload.reason === 'rights' ? COPY.rights : undefined}</ModuleError>
      </div>
    );
  }
  const rows =
    full || sorted.length <= 6 ? sorted : [...sorted.slice(0, 3), ...sorted.slice(-3)];
  const max = Math.max(0.5, ...rows.map((r) => Math.abs(r.changePct ?? 0)));

  return (
    <div className={root} data-market-module="sectors">
      {head}
      <div
        ref={growRef}
        className="sv-sector-rows"
        data-full={full ? '' : undefined}
        data-grow={grown ? 'go' : 'wait'}
        style={full ? { ['--rows' as string]: Math.ceil(rows.length / 2) } : undefined}
      >
        {rows.map((r) => {
          const pct = r.changePct ?? 0;
          const share = Math.abs(pct) / max;
          const up = pct >= 0;
          return (
            <div key={r.ref} className="sv-sector-row">
              <span className="sv-sector-name t-small text-fg">{r.name}</span>
              <span className="sv-sector-plot">
                <span className="sv-sector-axis" aria-hidden="true" />
                <span
                  className={clsx('sv-sector-bar', up ? 'bg-up' : 'bg-down')}
                  data-dir={up ? 'up' : 'down'}
                  style={{ ['--w' as string]: share.toFixed(4) }}
                  aria-hidden="true"
                />
                <span
                  className={clsx('sv-sector-val t-num-s', up ? 'text-up' : 'text-down')}
                  data-dir={up ? 'up' : 'down'}
                  style={{ ['--w' as string]: share.toFixed(4) }}
                >
                  {fmtPct(pct)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
      {!full && sorted.length > rows.length ? (
        <p className="t-small mt-3">
          <Link href="/news/markets" className="sv-quiet sv-quiet-hit">
            {COPY.sectorsAll}
          </Link>
        </p>
      ) : null}
      <div className="sv-mk-foot">
        <Stamp
          label={payload.label}
          asOf={payload.asOf}
          attribution={payload.attribution}
          stale={!!res.error}
        />
      </div>
    </div>
  );
}
