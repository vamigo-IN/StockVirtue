'use client';

import { Info } from 'lucide-react';
import { useMarket } from '@/components/widgets/data';
import { LabelPill } from '@/components/widgets/frame';
import { fmtStamp, stampOf } from '@/components/widgets/format';
import { TickerTrack } from '@/components/widgets/ticker';
import { cn } from '@/lib/utils';
import type { TickerData } from '@/market/types';

/**
 * The site-wide ticker under the news masthead. Starts from the server's
 * copy, then moves with the live price stream (polling every 15 seconds
 * whenever the stream is unavailable).
 * Every price carries its label; the strip opens with the time they're as of.
 */
export function MarketTicker({ initial }: { initial: TickerData | null }) {
  const live = useMarket<TickerData>('ticker', 15);
  const data = live.data ?? initial;
  if (!data || !data.config.enabled || data.items.length === 0) return null;
  const { config, items } = data;
  const { label, asOf: latest } = stampOf(items);
  return (
    <div className={cn(config.mobile === 'hide' && 'hidden sm:block')}>
      <TickerTrack
        items={items}
        look={config}
        stamp={
          <>
            {label && (
              <LabelPill
                label={label}
                delay={label === 'DELAYED' ? data.delayMinutes : undefined}
              />
            )}
            <span className="font-mono text-[11px] whitespace-nowrap opacity-80">
              {fmtStamp(latest)}
            </span>
            <span
              title={`Market data: ${data.attribution}`}
              className="opacity-70"
            >
              <Info className="size-3.5" aria-hidden="true" />
              <span className="sr-only">
                Market data: {data.attribution}. Prices as of {fmtStamp(latest)}
                .
              </span>
            </span>
          </>
        }
      />
    </div>
  );
}
