import Link from 'next/link';
import { clsx } from 'clsx';
import { CommodityBoard } from '@/components/market/CommodityBoard';
import { HeatGrid } from '@/components/market/HeatGrid';
import { IndexBoard } from '@/components/market/IndexBoard';
import { MarketStatus } from '@/components/market/MarketStatus';
import { MoversBoard } from '@/components/market/MoversBoard';
import { SectorBars } from '@/components/market/SectorBars';
import { BOX } from '@/components/market/parts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/public/ui/Tabs';
import type { HomeContent } from '@/content/site/types';
import type { Snapshot } from '@/market/types';
import { ArrowRight, SectionHead } from './parts';
import e from './et.module.css';

const MARKET_TITLE_ID = 'home-market-title';
const HEAT_TITLE_ID = 'home-heatmap-title';

/**
 * Market overview (Emerald Terminal; spec §5.1, §7.2): shown only with the
 * site-prices gate on and a snapshot whose licence isn't OFF. Stream A's
 * market modules, each a client island fed the server's snapshot as
 * `initial`, each ending in its own Stamp: Indices (c1–7 from 1024 px) and
 * MCX and the rupee (c8–12), and under LIVE also the biggest moves (c1–8)
 * and sector moves (c9–12), the two LIVE-only modules. Stacked from 768
 * to 1023 px; on phones one Tabs card [Indices | MCX | Moves | Sectors]
 * (Moves and Sectors under LIVE only). The MarketStatus line follows the
 * gate. Server component.
 */
export function MarketOverview({
  content,
  snapshot,
  live,
}: {
  content: HomeContent['market'];
  snapshot: Snapshot;
  live: boolean;
}) {
  return (
    <section className={clsx(e.section, e.mint)} aria-labelledby={MARKET_TITLE_ID}>
      <div className="sv-container">
        <SectionHead
          id={MARKET_TITLE_ID}
          label={content.label}
          title={content.title}
          lead={content.lead}
          aside={
            <Link href="/news/markets" prefetch={false} className={e.moreLink}>
              {content.allLink}
              <ArrowRight />
            </Link>
          }
        />
        <div className={e.status}>
          <MarketStatus variant="line" />
        </div>
        {/* Phones: one Radix Tabs card (the panels force-mounted, the inactive
            ones hidden); from 768 px the tab list hides and every panel shows. */}
        <Tabs defaultValue="indices">
          <TabsList aria-label={content.label} className={e.mkTabsList}>
            {/* Phone tab labels: interface strings. */}
            <TabsTrigger value="indices">Indices</TabsTrigger>
            <TabsTrigger value="mcx">MCX</TabsTrigger>
            {live ? <TabsTrigger value="moves">Moves</TabsTrigger> : null}
            {live ? <TabsTrigger value="sectors">Sectors</TabsTrigger> : null}
          </TabsList>
          <div className={e.marketGrid}>
            <TabsContent value="indices" forceMount className={clsx(e.mkPanel, e.mkIndices)}>
              <IndexBoard initial={snapshot} density="board" title="Indices" />
            </TabsContent>
            {/* The rail cut (four commodities, two rupee rows) in a box like the others. */}
            <TabsContent value="mcx" forceMount className={clsx(e.mkPanel, e.mkCommodities)}>
              <div className={BOX}>
                <CommodityBoard initial={snapshot} density="rail" maxCommodities={4} maxCurrencies={2} />
              </div>
            </TabsContent>
            {live ? (
              <TabsContent value="moves" forceMount className={clsx(e.mkPanel, e.mkMovers)}>
                <MoversBoard variant="home" boxed />
              </TabsContent>
            ) : null}
            {live ? (
              <TabsContent value="sectors" forceMount className={clsx(e.mkPanel, e.mkSectors)}>
                <SectorBars variant="compact" boxed />
              </TabsContent>
            ) : null}
          </div>
        </Tabs>
      </div>
    </section>
  );
}

/**
 * The Nifty 50 heatmap in the page's one dark terminal band (40 px
 * corners): HeatGrid with its index tabs, tiles, legend, list, BreadthBar,
 * caption and Stamp. HeatGrid is LIVE-only, so the band is drawn only under
 * a LIVE licence with the gate on. Server component around the client
 * island.
 */
export function HeatmapBand({ content }: { content: HomeContent['heatmap'] }) {
  return (
    <section className={e.heatSection} aria-labelledby={HEAT_TITLE_ID}>
      <div className={clsx('sv-terminal', e.heatBand)}>
        <div className={clsx('sv-container', e.heatInner)}>
          <SectionHead id={HEAT_TITLE_ID} label={content.label} title={content.title} lead={content.lead} dark />
          <HeatGrid defaultIndex="NIFTY" boxed={false} />
        </div>
      </div>
    </section>
  );
}
