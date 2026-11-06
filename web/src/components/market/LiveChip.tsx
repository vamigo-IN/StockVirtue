'use client';

import { LazyPopover } from '@/components/public/ui/LazyPopover';
import { useMarket } from '@/components/widgets/data';
import { Change, LabelPill } from '@/components/widgets/frame';
import { StampTime } from '@/components/widgets/StampTime';
import { clsx } from 'clsx';
import { marketPath } from '@/market/paths';
import type { IpoBoard, MarketQuote, Snapshot } from '@/market/types';
import { COPY, openNow } from './copy';
import { delayFor, isVolatilityIndex } from './gate';
import { liveChipQuote } from './parts';
import { InfoGlyph } from './Stamp';
import { useInViewMarket } from './useInViewMarket';

export type LiveChipKind = 'markets' | 'commodities' | 'ipo';

/**
 * The chip in a section's RuleHead aside on /news, from 768 px only (spec
 * §4.10, §7.3):
 * - markets: "Nifty 50 ▲0.42% · [Live] 4 Nov, 3:05 pm IST" (NSE:NIFTY);
 * - commodities: the first COMMODITY row, the same way;
 * - ipo: "3 open now" (an offer count: no price, no pill, no stamp).
 * The time is StampTime's (the full form first; "3:05 pm IST" only after
 * hydration, always with "IST"). The attribution is an sr-only span inside
 * the chip and the text of its ⓘ popover, which loads on first use.
 * Omitted under OFF, with no data, and below 768 px (CSS).
 */
export function LiveChip({
  kind,
  initialSnapshot,
  initialIpos,
  className,
}: {
  kind: LiveChipKind;
  initialSnapshot?: Snapshot | null;
  initialIpos?: IpoBoard | null;
  className?: string;
}) {
  // The snapshot only for the priced chips: the IPO count never opens the stream.
  const snap = useMarket<Snapshot>(kind === 'ipo' ? null : marketPath.snapshot(), 15);
  const ipos = useInViewMarket<IpoBoard>(kind === 'ipo' ? marketPath.ipos() : null, 300);
  if (kind === 'ipo') {
    const board = ipos.data ?? initialIpos ?? null;
    return (
      <span ref={ipos.ref} className={clsx('sv-livechip-host', className)}>
        {board?.available && board.open.length > 0 ? (
          <span className="sv-livechip t-meta text-fg-2">{openNow(board.open.length)}</span>
        ) : null}
      </span>
    );
  }
  const s = snap.data ?? initialSnapshot ?? null;
  const q = liveChipQuote(s, kind);
  if (!s || !q) return null;
  return (
    <LiveChipView
      quote={q}
      attribution={s.attribution}
      delay={delayFor(s.right, s.delayMinutes)}
      className={className}
    />
  );
}

/** The chip for one quote (also the design gallery's fixtures). */
export function LiveChipView({
  quote: q,
  attribution,
  delay,
  className,
}: {
  quote: MarketQuote;
  attribution: string;
  delay?: number;
  className?: string;
}) {
  return (
    <span className={clsx('sv-livechip-host', className)}>
      <span className="sv-livechip t-meta text-fg-2" data-market-module="live-chip">
        <span className="font-semibold text-fg">{q.name}</span>{' '}
        <Change
          change={null}
          pct={q.changePct}
          showAbs={false}
          neutral={isVolatilityIndex(q.ref)}
          className="t-mono"
        />
        {' · '}
        <LabelPill label={q.label} delay={delay} stream="snapshot" />{' '}
        <span className="t-mono whitespace-nowrap text-[12px]">
          <span className="sr-only">{COPY.pricesAsOf}</span>
          <StampTime iso={q.asOf} />
        </span>
        <span className="sr-only"> · {attribution}</span>
        <LazyPopover
          label="About these prices"
          triggerClassName="sv-stamp-info"
          className="max-w-[320px] p-4"
          trigger={<InfoGlyph />}
        >
          <p className="t-small text-fg">Market data: {attribution}.</p>
          <p className="t-small mt-3">
            <a href="/#prices" className="sv-quiet sv-quiet-hit">
              How to read our prices
            </a>
          </p>
        </LazyPopover>
      </span>
    </span>
  );
}
