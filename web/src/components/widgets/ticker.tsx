'use client';

import { isVolatilityIndex } from '@/components/market/gate';
import { clsx } from 'clsx';
import type { MarketQuote } from '@/market/types';
import { fmtPrice, stampOf } from './format';
import { Change, LabelPill } from './frame';
import { StampTime } from './StampTime';

export interface TickerLook {
  speed: 'slow' | 'normal' | 'fast';
  direction: 'left' | 'right';
  theme: 'dark' | 'light' | 'brand';
  show: { change: boolean; percent: boolean; labels: boolean };
  nameStyle: 'name' | 'symbol';
}

const SECONDS_PER_ITEM = { slow: 9, normal: 6, fast: 3.5 };

/**
 * A scrolling strip of prices: the masthead ticker (MarketTicker), the
 * inline ticker widget and the portal's preview (spec §4.4).
 *
 * The DOM hooks tests read stay as they were: the root is
 * role="region" aria-label="Market prices"; each price is the first
 * `span.font-mono` of its `ul > li`; the second row, which makes the loop
 * seamless, is aria-hidden; the light theme carries `bg-card`.
 *
 * Themes come from the tokens (widgets.css, tokens.css, public.css): light
 * is the card with hairlines, dark the terminal strip (#0A0D12, the
 * .sv-terminal tokens), brand the emerald strip (#01261A, the .sv-emerald
 * tokens). Emerald Terminal: everything on the strip is mono (SV Mono),
 * names as small upper-case labels, 1 px separators between items. India
 * VIX is never coloured up or down. The strip pauses
 * while a reader points at the prices, and while `paused` (the Pause
 * button) sets data-paused on the host. Under reduced motion it is a still
 * row that scrolls sideways, with the duplicate row gone (pure CSS).
 *
 * The strip opens with `stamp` (the prices' label and time; see stampOf);
 * an item whose label or time differs carries its own, and `show.labels`
 * repeats the label on any item that isn't live. Below 640 px the strip
 * shows no dates or times (the owner, 6 Nov 2026): an item's own stamp is
 * its label pill, with the time kept for screen readers only.
 */
export function TickerTrack({
  items,
  look,
  stamp,
  end,
  paused = false,
  module,
  className,
}: {
  items: MarketQuote[];
  look: TickerLook;
  /** Before the prices: the label, the time and (MarketTicker) its buttons. */
  stamp?: React.ReactNode;
  /** After the prices, outside the moving track (MarketTicker's link). */
  end?: React.ReactNode;
  /** Holds the marquee still (the reader pressed Pause). */
  paused?: boolean;
  /** data-market-module on the root (the masthead ticker passes "ticker"). */
  module?: string;
  className?: string;
}) {
  if (items.length === 0) return null;
  const stampAll = stampOf(items);
  const showChange = look.show.change || look.show.percent;
  const row = (copy: number) => (
    <ul
      className="flex shrink-0 items-center"
      aria-hidden={copy > 0 || undefined}
    >
      {items.map((q) => (
        <li
          key={`${copy}-${q.ref}`}
          className="sv-tk-item flex items-center gap-2 px-4 text-[12.5px] leading-[18px] whitespace-nowrap"
        >
          <span className="sv-tk-name font-medium">
            {look.nameStyle === 'symbol' ? q.symbol : q.name}
          </span>
          <span className="font-mono tabular-nums">
            {fmtPrice(q.ltp, q.kind)}
          </span>
          {showChange && (q.change !== null || q.changePct !== null) && (
            <Change
              change={look.show.change ? q.change : null}
              pct={look.show.percent ? q.changePct : null}
              kind={q.kind}
              showAbs={look.show.change}
              neutral={isVolatilityIndex(q.ref)}
            />
          )}
          {stampAll.own(q) ? (
            <span className="sv-tk-2 whitespace-nowrap">
              <LabelPill label={q.label} />
              {/* Phones show the label alone; the time stays for screen readers. */}
              <span className="max-sm:sr-only">
                {' '}
                <span className="sr-only">Price as of </span>
                <StampTime iso={q.asOf} />
              </span>
            </span>
          ) : (
            look.show.labels &&
            q.label !== 'LIVE' && <LabelPill label={q.label} />
          )}
        </li>
      ))}
    </ul>
  );
  return (
    <div
      className={clsx(
        'sv-ticker sv-marquee-host flex min-h-9 items-stretch sm:min-h-10',
        look.theme === 'light' &&
          'border-y border-border bg-card text-card-foreground',
        className,
      )}
      role="region"
      aria-label="Market prices"
      data-theme={look.theme}
      data-market-module={module}
      data-paused={paused ? '' : undefined}
    >
      {stamp && (
        <div className="sv-tk-stamp flex shrink-0 items-center gap-2 px-3 text-[13px] leading-[18px]">
          {stamp}
        </div>
      )}
      <div className="sv-marquee-track flex min-w-0 flex-1 items-center overflow-hidden">
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
      {end && (
        <div className="sv-tk-end hidden shrink-0 items-center px-3 text-[13px] leading-[18px] lg:flex">
          {end}
        </div>
      )}
    </div>
  );
}
