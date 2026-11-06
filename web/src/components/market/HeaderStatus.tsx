'use client';

import { lazy, Suspense } from 'react';
import { useMinWidth } from './useMinWidth';

const MarketStatus = lazy(() =>
  import('./MarketStatus').then((m) => ({ default: m.MarketStatus })),
);

/** MarketStatus's own chip before its data arrives: the same empty box. */
const EMPTY_CHIP = <span className="sv-status" data-variant="chip" data-market-status="" />;

/**
 * The header's MarketStatus chip (SiteHeader's `status` slot, spec §4.1,
 * §7.2). Render it only from layouts, never MarketStatus itself.
 *
 * - The chip shows from 1280 px only (Emerald Terminal: the pill reads
 *   "NSE · BSE · MCX open" and would crowd the nav at 1024), so below that
 *   this renders the empty chip and never loads MarketStatus: phones and
 *   tablets neither download its code nor ask for the ticker on its
 *   account. From 1280 px it loads
 *   MarketStatus after hydration (React.lazy) and shows the empty chip
 *   until then, as MarketStatus itself does until its data arrives, so
 *   nothing moves.
 * - A client module of its own because Next merges the client-reference
 *   manifests of entries whose paths differ only by route groups: the news
 *   layout and the /news front are one manifest group, and so are the
 *   (public), (home) and (site) layouts and the home page. A client module
 *   that a layout renders and a page in its group also imports (the market
 *   modules import MarketStatus) is mapped to that page's chunks on every
 *   other page: the /news front's market modules loaded on every news
 *   page. No page imports this module.
 * - Lazy for the same reason: the site pages are mapped to the (home)
 *   layout's chunks for the header and footer they share, so whatever that
 *   layout loads up front, every site page loads too.
 */
export function HeaderStatus() {
  const wide = useMinWidth(1280);
  if (!wide) return EMPTY_CHIP;
  return (
    <Suspense fallback={EMPTY_CHIP}>
      <MarketStatus variant="chip" media="(min-width: 1280px)" />
    </Suspense>
  );
}
