'use client';

import { useEffect, useRef, useState } from 'react';
import { fmtPrice } from '@/components/widgets/format';
import { clsx } from 'clsx';
import type { InstrumentKind } from '@/market/types';

const SIZE = {
  hero: 't-num-hero',
  num: 't-num',
  'num-s': 't-num-s',
} as const;

/** How long the wash shows (--sv-dur-4). */
const WASH_MS = 600;

/**
 * A price as plain text with `data-price` (spec §4.10). When the value
 * changes after mount, `data-flash="up|down"` is set for 600 ms: a wash in
 * `--sv-up-tint` / `--sv-down-tint` (widgets.css), none under reduced
 * motion. NEVER aria-live.
 *
 * The first swap from the server's value to the first live value never
 * washes (F23): the ISR value can be 15 s or more old, and every price on
 * the page would flash at once. Pass `live` (whether `value` comes from live
 * data rather than the server's `initial`) and only live-to-live changes
 * wash; without it, the first change after mount is taken to be that swap.
 *
 * A null value prints an en dash (a missing price is never invented).
 */
export function PriceCell({
  value,
  kind,
  size,
  live,
  className,
}: {
  value: number | null;
  kind?: InstrumentKind;
  size: 'hero' | 'num' | 'num-s';
  /** True once `value` comes from live data (the stream or a poll). */
  live?: boolean;
  className?: string;
}) {
  const prev = useRef<{ value: number | null; live?: boolean; changes: number }>({
    value,
    live,
    changes: 0,
  });
  const [flash, setFlash] = useState<{ dir: 'up' | 'down'; n: number } | null>(
    null,
  );

  useEffect(() => {
    const p = prev.current;
    if (p.value === value) {
      p.live = live;
      return;
    }
    const before = p.value;
    const changes = p.changes + 1;
    const wash =
      before !== null &&
      value !== null &&
      (live === undefined ? changes > 1 : !!p.live && !!live);
    prev.current = { value, live, changes };
    if (!wash) return;
    setFlash((f) => ({ dir: value > before ? 'up' : 'down', n: (f?.n ?? 0) + 1 }));
  }, [value, live]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), WASH_MS);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <span
      // A new key per wash restarts the one-shot animation.
      key={flash ? `w${flash.n}` : 'still'}
      className={clsx('sv-price', SIZE[size], className)}
      data-price={value ?? undefined}
      data-flash={flash?.dir}
    >
      {value === null ? '–' : fmtPrice(value, kind)}
    </span>
  );
}
