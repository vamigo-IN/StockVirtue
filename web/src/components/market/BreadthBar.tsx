'use client';

import { useInView } from '@/lib/hooks/useInView';
import { clsx } from 'clsx';
import type { ListRow } from '@/market/types';
import { breadthText } from './copy';

/**
 * Breadth for an index's heatmap rows (spec §4.10, §9.7): an 8 px
 * two-part bar (rising in --sv-up, falling in --sv-down, unchanged in
 * --sv-surface-3) with "31 rising · 19 falling · Nifty 50 members" beside
 * it. It sits inside HeatGrid, above its stamp, and grows from the left
 * once when 40% visible (none under reduced motion). LIVE only, like the
 * heatmap it reads.
 */
export function BreadthBar({
  rows,
  indexName,
  className,
}: {
  rows: ListRow[];
  indexName: string;
  className?: string;
}) {
  const [ref, grown] = useInView<HTMLDivElement>({ threshold: 0.4, once: true });
  if (!rows.length) return null;
  const up = rows.filter((r) => (r.changePct ?? 0) > 0).length;
  const down = rows.filter((r) => (r.changePct ?? 0) < 0).length;
  const flat = rows.length - up - down;
  const share = (n: number) => `${(n / rows.length) * 100}%`;
  return (
    <div
      ref={ref}
      className={clsx('sv-breadth', className)}
      data-grow={grown ? 'go' : 'wait'}
    >
      <span className="sv-breadth-bar" aria-hidden="true">
        <span className="bg-up" style={{ width: share(up) }} />
        {flat ? <span className="bg-surface-3" style={{ width: share(flat) }} /> : null}
        <span className="bg-down" style={{ width: share(down) }} />
      </span>
      <span className="t-meta text-fg-2">{breadthText(up, down, indexName)}</span>
    </div>
  );
}
