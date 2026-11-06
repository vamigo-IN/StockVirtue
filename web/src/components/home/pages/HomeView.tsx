import { pricesOnSite } from '@/components/market/gate';
import type { HomeContent, WontDoContent } from '@/content/site/types';
import { playStoreUrl } from '@/lib/metadata';
import type { SiteSettings } from '@/lib/settings';
import type { RidgeData } from '@/market/ridgeline';
import type {
  ContractNoteData,
  IpoBoard,
  Labelled,
  ListRow,
  OptionChainData,
  Snapshot,
  TickerData,
} from '@/market/types';
import type { NewsCard } from '@/news/types';
import { realDesk } from '../et/desk-model';
import { FactCards } from '../et/FactCards';
import { DownloadBand, Faq } from '../et/FaqDownload';
import { HeroBand } from '../et/HeroBand';
import { HowItWorks } from '../et/HowItWorks';
import { IpoSection, NewsSection } from '../et/IpoNews';
import { Academy, Rooms } from '../et/LearnRooms';
import { HeatmapBand, MarketOverview } from '../et/MarketSections';
import { FeatureGrid, TradeCards } from '../et/TradeFeatures';
import { resolveScreen } from '../screens';

/** The home page's data, fetched in parallel by loadHomeData() (spec §5.1.5, §7.2). */
export type HomeData = {
  /** getTicker(): the site-prices gate (pricesOnSite) and the fallback licence. */
  ticker: TickerData | null;
  /** getSnapshot(). */
  snapshot: Snapshot | null;
  /**
   * getRidgeline(gateOn): a year of daily closes for the curated indices;
   * the hero desk draws its chart from it. Null with the gate off, under
   * OFF or without data.
   */
  ridge: RidgeData | null;
  /** getIpos(). */
  ipos: IpoBoard | null;
  /** getListing({ limit: 5 }).items; null when the news API failed. */
  news: NewsCard[] | null;
  /**
   * getMovers('gainers' | 'losers'): the desk's "Biggest moves". Asked for
   * only with the gate on under LIVE; a null list is unavailable.
   */
  movers?: { gainers: Labelled<ListRow[]> | null; losers: Labelled<ListRow[]> | null } | null;
  /** getOptionChain('NIFTY'): the F&O card's chain (gate on, LIVE). */
  chain?: OptionChainData | null;
  /** getContractNote(noteRef(snapshot)): "How a trade works" (gate on). */
  note?: ContractNoteData | null;
};

export type HomeViewProps = {
  /** getPageContent('home', HOME_DEFAULT), or a draft in the preview route. */
  content: HomeContent;
  /** getSharedContent('wont-do'). */
  wontDo: WontDoContent;
  /** getSettings(): the Play link. */
  settings: SiteSettings;
  data: HomeData;
};

/**
 * The home page body, "I · Emerald Terminal" (6 Nov 2026; the brief in
 * redesign/design/emerald-terminal-brief.md): a pure view of (content,
 * settings, data), rendered by `/` and by the preview route with a draft.
 * Server component; no fetches, no clock, no three.js. The (home) layout
 * around it supplies the header, `<main>` and the footer.
 *
 * Order: hero (emerald, with the desk) · four fact cards · market overview
 * · Nifty 50 heatmap (terminal band) · what you can trade · features · how
 * a trade works (#inside-the-app) · IPO watch · news · Trading Academy ·
 * rooms · questions (with "What it won't do" and #prices) · download band.
 *
 * Real data or no data (6 Nov 2026, the owner's request): every figure on
 * the page comes from the market API under the gate (spec §7.0 rule 4:
 * `gateOn` = pricesOnSite(ticker), and a snapshot whose licence isn't OFF)
 * and carries its Stamp; a panel without real data shows no figures, so
 * nothing on the page is made up.
 * - The desk: the chart, the watchlist, an order ticket at the first stock's
 *   last price and "Biggest moves" (the large caps' movers under LIVE, else
 *   the curated indices), when the Ridgeline and the snapshot are there.
 *   Otherwise the owner's home screenshot (content first, SCREENS second),
 *   or no desk: the type-led hero.
 * - The market overview needs the snapshot, the heatmap band LIVE.
 * - "What you can trade": the stocks, the NIFTY option chain (else the F&O
 *   indices) and the MCX commodities, each with its Stamp; chips without.
 * - "How a trade works": the contract note the API works out with the app's
 *   own charges on today's prices; without it, the lines and when each is
 *   charged, with no amounts.
 * - Rooms explain themselves in words: no leaderboard, no people.
 * - IPO watch is offer data (no prices): it follows the board alone; the
 *   news heading is `market.titleGateOff` while prices are off.
 */
export function HomeView({ content, wontDo, settings, data }: HomeViewProps) {
  const playUrl = playStoreUrl(settings);
  const gateOn = pricesOnSite(data.ticker);
  const snapshot = gateOn && data.snapshot && data.snapshot.right !== 'OFF' ? data.snapshot : null;
  const desk = realDesk(snapshot, snapshot ? data.ridge : null, snapshot ? (data.movers ?? null) : null);
  const live = snapshot?.right === 'LIVE';
  // How to read a price: the snapshot's licence, else the ticker's (§7.2).
  const source = data.snapshot ?? data.ticker;
  return (
    <>
      <HeroBand
        content={content.hero}
        playUrl={playUrl}
        desk={desk}
        homeScreen={desk ? null : resolveScreen(content.gateOff.homeScreen, 'home')}
      />
      <FactCards content={content.facts} />
      {snapshot ? <MarketOverview content={content.market} snapshot={snapshot} live={live} /> : null}
      {live ? <HeatmapBand content={content.heatmap} /> : null}
      <TradeCards content={content.trade} snapshot={snapshot} chain={live ? (data.chain ?? null) : null} />
      <FeatureGrid content={content.features} />
      <HowItWorks content={content.stage} snapshot={snapshot} note={snapshot ? (data.note ?? null) : null} />
      <IpoSection content={content.ipos} ipos={data.ipos} />
      <NewsSection content={content.market} gateOn={!!snapshot} news={data.news} />
      <Academy content={content.learning} />
      <Rooms content={content.learning.board} />
      <Faq
        content={content.answers}
        wontDo={wontDo}
        right={source?.right ?? null}
        delayMinutes={source?.delayMinutes ?? null}
        attribution={source?.attribution ?? null}
      />
      <DownloadBand content={content.finalCta} playUrl={playUrl} />
    </>
  );
}
