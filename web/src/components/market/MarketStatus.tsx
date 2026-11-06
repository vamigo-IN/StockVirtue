'use client';

import { clsx } from 'clsx';
import { useEffect, useState } from 'react';
import { useMarket } from '@/components/widgets/data';
import { marketPath } from '@/market/paths';
import type { Sessions, TickerData } from '@/market/types';

type Segment = keyof Sessions;

/** Spec §9.7 "Status". */
const NAME: Record<Segment, string> = {
  equity: 'NSE & BSE',
  commodity: 'MCX',
  currency: 'Currency',
};
const ORDER: readonly Segment[] = ['equity', 'commodity', 'currency'];
const ALL_CLOSED = 'Markets closed · prices shown are end of day';

/** Whether `media` matches; false on the server and the first client render. */
function useMediaMatch(media: string | undefined): boolean {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    if (!media || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(media);
    const sync = () => setMatch(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [media]);
  return match;
}

function Dot({ open }: { open: boolean }) {
  return <span className="sv-status-dot" data-open={open} aria-hidden="true" />;
}

/**
 * The header pill's words (design I): the three exchanges in one line,
 * grouped by state, so it stays compact and still says open or closed.
 * NSE and BSE share the equity session; MCX is the commodity session.
 */
function chipLine(s: Sessions): { text: string; open: boolean } {
  const eq = !!s.equity;
  const mcx = !!s.commodity;
  if (eq === mcx) return { text: `NSE · BSE · MCX ${eq ? 'open' : 'closed'}`, open: eq };
  return eq
    ? { text: 'NSE and BSE open · MCX closed', open: true }
    : { text: 'MCX open · NSE and BSE closed', open: true };
}

function Part({ seg, open }: { seg: Segment; open: boolean }) {
  return (
    <span className="sv-status-part">
      <Dot open={open} />
      {`${NAME[seg]} ${open ? 'open' : 'closed'}`}
    </span>
  );
}

/**
 * Which exchanges are open now (spec §4.10, §9.7), from the ticker's
 * `sessions` (`useMarket('ticker', 15)`: the live price stream, or a
 * 15-second poll when the stream is quiet). Client.
 *
 * The server render and the first client render show an EMPTY, text-free
 * placeholder that already has the final box, so cached HTML never claims
 * a session is open, nothing shifts on hydration and no bare word appears
 * in the header. Without data (still loading, or the API is down) it stays
 * empty, which hides it.
 *
 * - `chip` (the header, at >= 1280 px): a 32 px mono pill, a dot plus the
 *   three exchanges grouped by state: "NSE · BSE · MCX open", "NSE · BSE ·
 *   MCX closed", "NSE and BSE open · MCX closed" or "MCX open · NSE and BSE
 *   closed" (chipLine). With `only`, one segment as before.
 * - `line` (Markets now): "NSE & BSE open · MCX open · Currency closed".
 * - `block` (the phone drawer): one row per segment.
 * Dots: open = 8 px filled `--sv-live-dot`; closed = an 8 px ring of 1.5 px
 * `--sv-fg-3`. The words always say open or closed. When every session is
 * closed, `line` and `block` read "Markets closed · prices shown are end of
 * day".
 *
 * Additive props (plan Appendix A lists only `variant`):
 * - `only`: show one segment, e.g. `only="commodity"` → "MCX open" beside
 *   the commodities board;
 * - `media`: subscribe only while this media query matches (the header chip
 *   passes "(min-width: 1024px)", so phones and tablets, where the chip is
 *   hidden, never ask for the ticker on its account).
 *
 * Classes are joined with clsx, not tailwind-merge (about 8 KB gzip kept
 * out of the header's initial JS; spec §6.10).
 */
export function MarketStatus({
  variant,
  only,
  media,
  className,
}: {
  variant: 'chip' | 'line' | 'block';
  only?: Segment;
  media?: string;
  className?: string;
}) {
  const wide = useMediaMatch(media);
  const live = useMarket<TickerData>(
    media && !wide ? null : marketPath.ticker(),
    15,
  );
  const s = live.data?.sessions;
  const ready = !!s && typeof s.equity === 'boolean';

  let body: React.ReactNode = null;
  if (ready && variant === 'chip' && !only) {
    const line = chipLine(s);
    body = (
      <span className="sv-status-part">
        <Dot open={line.open} />
        {line.text}
      </span>
    );
  } else if (ready) {
    const segs: Segment[] =
      variant === 'chip' ? [only ?? 'equity'] : only ? [only] : [...ORDER];
    const allClosed = segs.length > 1 && segs.every((g) => !s[g]);
    if (allClosed) {
      body = (
        <span className="sv-status-part">
          <Dot open={false} />
          {ALL_CLOSED}
        </span>
      );
    } else if (variant === 'line') {
      // Each separator stays with the item before it, so a line that wraps
      // ends on "·" instead of starting the next line with one.
      body = segs.map((g, i) => (
        <span key={g} className="sv-status-item">
          <Part seg={g} open={!!s[g]} />
          {i < segs.length - 1 ? <span className="sv-status-sep">{' · '}</span> : null}
        </span>
      ));
    } else {
      body = segs.map((g) => <Part key={g} seg={g} open={!!s[g]} />);
    }
  }

  return (
    <span
      className={clsx('sv-status', className)}
      data-variant={variant}
      data-ready={ready ? '' : undefined}
      data-market-status=""
    >
      {body}
    </span>
  );
}
