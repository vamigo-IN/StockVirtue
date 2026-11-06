import { CommodityBoard } from '@/components/market/CommodityBoard';
import { COPY } from '@/components/market/copy';
import { PriceChart } from '@/components/market/PriceChart';
import { Container } from '@/components/public/Container';
import { cn } from '@/lib/utils';
import { getSnapshot } from '@/market/server';
import { getListing } from '@/news/api';
import { HubHead, hubTitle } from './HubHead';
import { HubStories } from './HubStories';
import h from './hubs.module.css';

const GOLD = 'MCX:GOLD';
const SILVER = 'MCX:SILVER';
const MARKET_DATA = 'Market data';
const GOLD_SILVER = 'Gold and silver, rebased';

/**
 * /news/commodities (spec §5.10.2, §7.4), data first:
 * - CommodityBoard board (every curated COMMODITY row with its unit and
 *   contract month, the day range, the MCX status, the rupee table) in
 *   cols 1–7, and one PriceChart with a tab per curated commodity in portal
 *   order, named after its contract, opening on 1 month (1 day and 5 days
 *   only under LIVE; the short-history rule and the intraday-unavailable
 *   line are PriceChart's) in 8–12;
 * - "Gold and silver, rebased" (Compare only, 6 months or 1 year) when
 *   both are curated; PriceChart leaves it out unless both have 60
 *   sessions, and the data note then runs across the row;
 * - no risk note of its own: DISCLAIMERS.commodities is article wording,
 *   and the hub line waits on the owner (§5.10.2, §9.8; B07). Hub copy
 *   never promises MCX lots or margin (F7);
 * - then the stories with "Most read in Commodities".
 */
export async function CommoditiesHub() {
  const [listing, trending, snapshot] = await Promise.all([
    getListing({ category: 'commodities', page: 1 }),
    getListing({ category: 'commodities', sort: 'trending', limit: 5 }),
    getSnapshot(),
  ]);
  const category = listing?.category;
  const title = hubTitle('commodities', category);
  const commodities = (snapshot?.instruments ?? []).filter((q) => q.kind === 'COMMODITY');
  const refs = commodities.map((q) => q.ref);
  const names = Object.fromEntries(commodities.map((q) => [q.ref, q.name]));
  const goldSilver = refs.includes(GOLD) && refs.includes(SILVER);

  return (
    <>
      <HubHead slug="commodities" category={category} status />
      <section aria-labelledby="hub-market-data">
        <Container className={h.data}>
          <h2 id="hub-market-data" className="sr-only">
            {MARKET_DATA}
          </h2>
          <div className={h.rows}>
            <div className={cn('sv-grid', h.row)}>
              <div className={cn(h.cell, h.c1to7)}>
                <CommodityBoard initial={snapshot} density="board" />
              </div>
              {refs.length ? (
                <div className={cn(h.cell, h.c8to12)}>
                  <PriceChart
                    refs={refs}
                    names={names}
                    instrument="commodity"
                    defaultRange="1M"
                    numbers
                  />
                </div>
              ) : null}
            </div>
            <div className={cn('sv-grid', h.row)}>
              {goldSilver ? (
                <div className={cn(h.cell, h.c1to8)}>
                  <PriceChart
                    refs={[GOLD, SILVER]}
                    names={{ [GOLD]: names[GOLD], [SILVER]: names[SILVER] }}
                    instrument="commodity"
                    defaultRange="6M"
                    modes={['compare']}
                    title={GOLD_SILVER}
                  />
                </div>
              ) : null}
              <p className={cn(h.cell, goldSilver && h.c9to12, h.note, 't-meta text-fg-2')}>
                {/* The board already says "MCX futures, nearest expiry. Prices are
                    per the unit shown." (COPY.commodityCaption), so the note
                    adds only the charts' sentence of the §5.10.2 caption. */}
                {COPY.commodityHubCaption}
              </p>
            </div>
          </div>
        </Container>
      </section>
      <HubStories slug="commodities" title={title} listing={listing} mostRead={trending?.items ?? []} />
    </>
  );
}
