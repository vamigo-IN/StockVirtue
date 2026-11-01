'use client';

import { cn } from '@/lib/utils';
import type { MarketQuote } from '@/market/types';
import { LabelPill } from './frame';
import { direction, fmtPct, fmtPrice, fmtStamp, stampOf } from './format';

export interface TickerLook {
  speed: 'slow' | 'normal' | 'fast';
  direction: 'left' | 'right';
  theme: 'dark' | 'light' | 'brand';
  show: { change: boolean; percent: boolean; labels: boolean };
  nameStyle: 'name' | 'symbol';
}

const SECONDS_PER_ITEM = { slow: 9, normal: 6, fast: 3.5 };
const THEMES = {
  dark: 'bg-[#0a0f0d] text-[#e7f3ec]',
  light: 'bg-card text-foreground border-y border-border',
  brand: 'bg-[#14532d] text-white',
};
const UP = {
  dark: 'text-[#4ade80]',
  light: 'text-emerald-600',
  brand: 'text-[#86efac]',
};
const DOWN = {
  dark: 'text-[#f87171]',
  light: 'text-red-600',
  brand: 'text-[#fecaca]',
};

/**
 * A scrolling strip of prices (the site ticker and the inline ticker widget).
 * The row is drawn twice so the loop is seamless; it pauses on hover and
 * focus, and stands still for readers who prefer reduced motion. The strip
 * opens with the prices' label and time (see stampOf); an item that differs
 * carries its own, and `show.labels` repeats the label on any that isn't
 * live.
 */
export function TickerTrack({
  items,
  look,
  stamp,
  className,
}: {
  items: MarketQuote[];
  look: TickerLook;
  /** Shown before the prices: "LIVE · 3:05 pm" or "Closing prices · …". */
  stamp?: React.ReactNode;
  className?: string;
}) {
  if (items.length === 0) return null;
  const stampAll = stampOf(items);
  const row = (copy: number) => (
    <ul
      className="flex shrink-0 items-center"
      aria-hidden={copy > 0 || undefined}
    >
      {items.map((q) => {
        const dir = direction(q.changePct ?? q.change);
        const tone =
          dir === 'up'
            ? UP[look.theme]
            : dir === 'down'
              ? DOWN[look.theme]
              : 'opacity-70';
        return (
          <li
            key={`${copy}-${q.ref}`}
            className="flex items-center gap-2 px-4 text-[13px] whitespace-nowrap"
          >
            <span className="font-semibold">
              {look.nameStyle === 'symbol' ? q.symbol : q.name}
            </span>
            <span className="font-mono tabular-nums">
              {fmtPrice(q.ltp, q.kind)}
            </span>
            {(look.show.change || look.show.percent) &&
              (q.change !== null || q.changePct !== null) && (
                <span className={cn('font-mono text-xs tabular-nums', tone)}>
                  <span aria-hidden="true">
                    {dir === 'up' ? '▲' : dir === 'down' ? '▼' : '•'}
                  </span>
                  {look.show.change &&
                    q.change !== null &&
                    ` ${fmtPrice(Math.abs(q.change), q.kind)}`}
                  {look.show.percent &&
                    q.changePct !== null &&
                    ` ${fmtPct(q.changePct)}`}
                </span>
              )}
            {stampAll.own(q) ? (
              <span className="flex items-center gap-1">
                <LabelPill label={q.label} />
                <span className="font-mono text-[10px] opacity-75">
                  {fmtStamp(q.asOf)}
                </span>
              </span>
            ) : (
              look.show.labels &&
              q.label !== 'LIVE' && <LabelPill label={q.label} />
            )}
          </li>
        );
      })}
    </ul>
  );
  return (
    <div
      className={cn(
        'sv-marquee-host flex items-stretch overflow-hidden',
        THEMES[look.theme],
        className,
      )}
      role="region"
      aria-label="Market prices"
    >
      {stamp && (
        <div className="relative z-10 flex shrink-0 items-center gap-2 px-3 text-xs shadow-[8px_0_12px_-6px_rgba(0,0,0,0.35)]">
          {stamp}
        </div>
      )}
      <div className="min-w-0 flex-1 overflow-hidden py-2">
        <div
          className="sv-marquee"
          data-direction={look.direction}
          style={
            {
              '--sv-marquee-duration': `${Math.max(20, items.length * SECONDS_PER_ITEM[look.speed])}s`,
            } as React.CSSProperties
          }
        >
          {row(0)}
          {row(1)}
        </div>
      </div>
    </div>
  );
}
