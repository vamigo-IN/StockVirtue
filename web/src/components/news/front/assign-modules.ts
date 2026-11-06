import type { DataRight, IpoBoard, Snapshot, TickerData } from '@/market/types';
import type { HomeSection } from '@/news/types';
import { sectionRenders } from './chooser';

/**
 * Module pairing on the news front (spec §5.9.3, §7.3): which market module
 * sits beside which CMS section. PURE (no React, no fetch): the page builds
 * the context from its server data, and the design gallery feeds it each
 * licence. Each module appears AT MOST ONCE per page, and modules never
 * link to stories (only to stock pages, hubs or nothing), so an official
 * update can't leak into a module outside its own section.
 */

export type FrontModule =
  /** IndexBoard compact (≤ 6 INDEX rows) + MarketStatus line + Stamp + "All markets". */
  | 'markets-now'
  /** MoversBoard rail (LIVE only), in a phone disclosure. */
  | 'movers'
  /** SectorBars compact (LIVE only), in a phone disclosure. */
  | 'sectors'
  /** MiniChart "Nifty 50 · 6 months · daily" (DELAYED or EOD), from the server's chart. */
  | 'nifty-chart'
  /** IpoWatch. */
  | 'ipo-watch'
  /** CommodityBoard rail ("Commodities and the rupee"). */
  | 'commodities'
  /** AcademyPanel (no market data). */
  | 'academy';

export interface ModuleContext {
  /** The website's licence: the snapshot's, else the ticker's; null with neither. */
  right: DataRight | null;
  /** The snapshot has COMMODITY or CURRENCY rows. */
  hasCommodities: boolean;
  /** IPOs are open or upcoming: `ipos.open.length + ipos.upcoming.length > 0`. */
  ipoActive: boolean;
  /** The server holds a drawable Nifty 50 6-month daily chart. The page asks
   * for it only when the pairing would use it (pass true to find out). */
  niftyChart: boolean;
}

export interface ModuleAssignment {
  /** The modules beside each section, by section id, top to bottom. */
  bySection: Record<string, FrontModule[]>;
  /**
   * With no featured and no Top stories section on the page, Markets now
   * becomes its own full-width band after this section (spec §5.9.3 row 1).
   */
  bandAfter: string | null;
  /** Every module placed, once each. */
  used: FrontModule[];
}

/** The pairing context from the page's server data (spec §5.9.3). */
export function moduleContext(data: {
  snapshot: Snapshot | null;
  ticker: TickerData | null;
  ipos: IpoBoard | null;
  niftyChart: boolean;
}): ModuleContext {
  const { snapshot, ticker, ipos } = data;
  return {
    right: snapshot?.right ?? ticker?.right ?? null,
    hasCommodities: Boolean(
      snapshot?.instruments.some((q) => q.kind === 'COMMODITY' || q.kind === 'CURRENCY'),
    ),
    ipoActive: Boolean(ipos?.available && ipos.open.length + ipos.upcoming.length > 0),
    niftyChart: data.niftyChart,
  };
}

/**
 * Pairs modules with sections, in the order of spec §5.9.3's table:
 * 1. Markets now (licence set and not OFF): the first featured section,
 *    else the first Top stories, else a full-width band after the first
 *    section.
 * 2. Biggest moves (LIVE): the first Top stories. Otherwise IPO watch there
 *    when IPOs are active and the page has no IPOs section; otherwise
 *    Commodities and the rupee when the snapshot has them, the licence isn't
 *    OFF and the page has no Commodities section; otherwise nothing.
 * 3. The Markets section: LIVE → Sector moves; DELAYED or EOD → the Nifty 50
 *    six-month chart; OFF → nothing.
 * 4. The IPOs section: IPO watch, when IPOs are active and it isn't used yet.
 * 5. The Commodities section: the commodity board, when the snapshot has the
 *    rows, the licence isn't OFF and it isn't used yet.
 * 6. The Learn section: the Academy panel (no data), always.
 * Sections that draw nothing (no stories, unknown types) are skipped, and
 * only the first section of each kind gets a module.
 */
export function assignModules(sections: HomeSection[], ctx: ModuleContext): ModuleAssignment {
  const shown = sections.filter(sectionRenders);
  const first = (pred: (s: HomeSection) => boolean) => shown.find(pred);
  const category = (slug: string) =>
    first((s) => s.type === 'category' && s.category?.slug === slug);
  const firstFeatured = first((s) => s.type === 'featured');
  const firstLatest = first((s) => s.type === 'latest');

  const bySection: Record<string, FrontModule[]> = {};
  const used = new Set<FrontModule>();
  const put = (s: HomeSection, m: FrontModule) => {
    if (used.has(m)) return;
    (bySection[s.id] ??= []).push(m);
    used.add(m);
  };
  const priced = ctx.right !== null && ctx.right !== 'OFF';
  let bandAfter: string | null = null;

  // 1. Markets now.
  if (priced) {
    const target = firstFeatured ?? firstLatest;
    if (target) put(target, 'markets-now');
    else if (shown.length) {
      bandAfter = shown[0].id;
      used.add('markets-now');
    }
  }

  // 2. Biggest moves, or its fallback, beside the first Top stories.
  if (firstLatest) {
    if (ctx.right === 'LIVE') put(firstLatest, 'movers');
    else if (ctx.ipoActive && !category('ipo')) put(firstLatest, 'ipo-watch');
    else if (ctx.hasCommodities && priced && !category('commodities')) {
      put(firstLatest, 'commodities');
    }
  }

  // 3. Markets.
  const markets = category('markets');
  if (markets) {
    if (ctx.right === 'LIVE') put(markets, 'sectors');
    else if ((ctx.right === 'DELAYED' || ctx.right === 'EOD') && ctx.niftyChart) {
      put(markets, 'nifty-chart');
    }
  }

  // 4. IPOs.
  const ipo = category('ipo');
  if (ipo && ctx.ipoActive) put(ipo, 'ipo-watch');

  // 5. Commodities.
  const commodities = category('commodities');
  if (commodities && ctx.hasCommodities && priced) put(commodities, 'commodities');

  // 6. Learn.
  const learn = category('education');
  if (learn) put(learn, 'academy');

  return { bySection, bandAfter, used: [...used] };
}
