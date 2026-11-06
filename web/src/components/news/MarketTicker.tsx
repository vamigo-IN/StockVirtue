'use client';

import { Info, Pause, Play } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { delayFor } from '@/components/market/gate';
import { PaletteToggle } from '@/components/public/PaletteToggle';
import { LazyPopover } from '@/components/public/ui/LazyPopover';
import { useMarket } from '@/components/widgets/data';
import { LabelPill } from '@/components/widgets/frame';
import { fmtStamp, stampOf } from '@/components/widgets/format';
import { StampTime } from '@/components/widgets/StampTime';
import { TickerTrack } from '@/components/widgets/ticker';
import { clsx } from 'clsx';
import { marketPath } from '@/market/paths';
import type { DataLabel, TickerData } from '@/market/types';

/** Where the reader's Pause choice is kept (spec §4.4). */
const PAUSE_KEY = 'sv:ticker-paused';
const PILL_TEXT: Record<DataLabel, string> = {
  LIVE: 'Live',
  DELAYED: 'Delayed',
  EOD: 'End of day',
};

/**
 * The masthead ticker on news pages (spec §4.4). It starts from the
 * server's copy, then moves with the live price stream (polling every 15
 * seconds whenever the stream is unavailable). Hidden when the admin turned
 * it off, when there is nothing to show, and under an OFF licence;
 * `mobile: 'hide'` hides it below 640 px.
 *
 * The stamp block: from 640 px the label and time, a Pause button and an ⓘ
 * that loads the "About these prices" popover on first use (LazyPopover).
 * Below 640 px only the label pill shows: no date, time or chevron (the
 * owner, 6 Nov 2026). The pill is still the button that opens the same
 * popover, which holds the time and, on phones, Pause (the strip moves on
 * its own, so readers must be able to stop it: WCAG 2.2.2); screen readers
 * get the time from the sr-only line and the button's name. The Pause
 * choice is kept in localStorage and applied after mount, so the first
 * render always plays. Items are never links; "All markets" sits at the
 * right end from 1024 px.
 */
export function MarketTicker({ initial }: { initial: TickerData | null }) {
  const live = useMarket<TickerData>(marketPath.ticker(), 15);
  const data = live.data ?? initial;
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    try {
      if (window.localStorage.getItem(PAUSE_KEY) === '1') setPaused(true);
    } catch {
      // storage blocked: the strip just plays
    }
  }, []);

  if (
    !data ||
    !data.config.enabled ||
    data.right === 'OFF' ||
    data.items.length === 0
  ) {
    return null;
  }
  const { config, items } = data;
  const { label, asOf: latest } = stampOf(items);
  const delay = delayFor(data.right, data.delayMinutes);
  // The clock-free full form: the same on the server and in the browser.
  const asOfText = fmtStamp(latest);
  const about = `Market data: ${data.attribution}. Prices as of ${asOfText}.`;

  const togglePause = () => {
    const next = !paused;
    setPaused(next);
    try {
      if (next) window.localStorage.setItem(PAUSE_KEY, '1');
      else window.localStorage.removeItem(PAUSE_KEY);
    } catch {
      // storage blocked: the choice lasts for this page
    }
  };
  const pauseLabel = paused ? 'Play prices' : 'Pause prices';
  const PauseIcon = paused ? Play : Pause;

  const popover = (
    <div className="space-y-3">
      <p>{about}</p>
      <button
        type="button"
        onClick={togglePause}
        className="sv-tk-pause flex min-h-11 w-full items-center gap-2 text-left font-[640] sm:hidden"
      >
        <PauseIcon className="size-4 shrink-0" aria-hidden="true" />
        {pauseLabel}
      </button>
      {/* The shared switch (spec §4.5 item 4), the same as the footer's. */}
      <PaletteToggle className="w-full" />
      <p>
        <a href="/#prices" className="sv-quiet sv-quiet-hit">
          How to read our prices
        </a>
      </p>
    </div>
  );

  return (
    <div className={clsx(config.mobile === 'hide' && 'hidden sm:block')}>
      <TickerTrack
        items={items}
        look={config}
        paused={paused}
        module="ticker"
        stamp={
          <>
            <span className="sr-only">{about}</span>
            {/* From 640 px: label and time, Pause, ⓘ. */}
            <span className="hidden items-center gap-2 sm:inline-flex">
              {label && (
                <LabelPill label={label} delay={delay} stream="ticker" />
              )}
              {latest && (
                <span className="sv-tk-2 whitespace-nowrap" aria-hidden="true">
                  <StampTime iso={latest} />
                </span>
              )}
              <span className="ml-1 inline-flex items-center gap-3">
                <button
                  type="button"
                  onClick={togglePause}
                  aria-label={pauseLabel}
                  title={pauseLabel}
                  className="sv-tk-btn sv-tk-pause inline-flex size-8 items-center justify-center rounded-[8px] hover:bg-current/10"
                >
                  <PauseIcon className="size-4" aria-hidden="true" />
                </button>
                <LazyPopover
                  label="About these prices"
                  trigger={<Info className="size-4" aria-hidden="true" />}
                  triggerClassName="sv-tk-btn inline-flex size-8 items-center justify-center rounded-[8px] hover:bg-current/10"
                  className="w-[280px]"
                  align="end"
                >
                  {popover}
                </LazyPopover>
              </span>
            </span>
            {/* Below 640 px: the label pill alone, which opens the popover.
                Its name keeps the time for screen readers. */}
            <LazyPopover
              label={`${label ? `${PILL_TEXT[label]}${label === 'DELAYED' && delay ? ` ${delay}m` : ''}, ` : ''}${asOfText}. About these prices`}
              trigger={
                label ? (
                  <LabelPill label={label} delay={delay} stream="ticker" />
                ) : (
                  <Info className="size-4" aria-hidden="true" />
                )
              }
              // sv-tk-btn: a 44 px hit area around the 32 px trigger, as the
              // >= 640 buttons have; the ring sits inside, so the sticky
              // header never clips its top edge (B-6).
              triggerClassName="sv-tk-btn inline-flex min-h-8 items-center rounded-[8px] text-left focus-visible:outline-offset-[-2px] sm:hidden"
              className="w-[280px]"
              align="start"
            >
              {popover}
            </LazyPopover>
          </>
        }
        end={
          <Link href="/news/markets" className="sv-quiet sv-quiet-hit whitespace-nowrap">
            All markets
          </Link>
        }
      />
    </div>
  );
}

