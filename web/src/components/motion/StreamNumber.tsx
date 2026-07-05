'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView } from 'motion/react';

type Fmt = 'inr' | 'pct' | 'int' | 'plain';

function format(n: number, fmt: Fmt, decimals: number) {
  const abs = Math.abs(n).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const sign = n < 0 ? '−' : '';
  switch (fmt) {
    case 'inr':
      return `${sign}₹${abs}`;
    case 'pct':
      return `${n >= 0 ? '+' : '−'}${abs}%`;
    default:
      return `${sign}${abs}`;
  }
}

/**
 * A live-feeling number. Counts up from 0 to [value] the first time it enters
 * the viewport, then — if [live] — re-ticks by small random deltas on an
 * interval, briefly flashing the cell green (up) or red (down) exactly like a
 * real LTP update. Tabular mono, reserved width, zero layout shift. Frozen to
 * the final value under reduced motion.
 */
export function StreamNumber({
  value,
  format: fmt = 'plain',
  decimals = 0,
  live = false,
  interval = 2600,
  jitter,
  duration = 1300,
  className,
}: {
  value: number;
  format?: Fmt;
  decimals?: number;
  live?: boolean;
  interval?: number;
  jitter?: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const [n, setN] = useState(0);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Count up on first reveal.
  useEffect(() => {
    if (!inView) return;
    if (reduce) {
      setN(value);
      return;
    }
    let raf = 0;
    let start = 0;
    const step = (t: number) => {
      if (!start) start = t;
      const p = Math.min((t - start) / duration, 1);
      setN(value * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration, reduce]);

  // Live re-tick.
  useEffect(() => {
    if (!live || !inView || reduce) return;
    const mag = jitter ?? Math.max(Math.abs(value) * 0.0012, 0.4);
    let flashT = 0;
    const id = setInterval(() => {
      if (document.hidden) return;
      const delta = (Math.random() - 0.45) * mag * 2;
      setN((prev) => prev + delta);
      setFlash(delta >= 0 ? 'up' : 'down');
      clearTimeout(flashT);
      flashT = window.setTimeout(() => setFlash(null), 220);
    }, interval);
    return () => {
      clearInterval(id);
      clearTimeout(flashT);
    };
  }, [live, inView, reduce, value, jitter, interval]);

  return (
    <span
      ref={ref}
      className={`stream-num${flash ? ` flash-${flash}` : ''}${
        className ? ` ${className}` : ''
      }`}
    >
      {format(n, fmt, decimals)}
    </span>
  );
}
