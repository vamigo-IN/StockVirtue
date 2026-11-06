import { IndexBoard } from '@/components/market/IndexBoard';
import { PriceChart } from '@/components/market/PriceChart';
import { Container } from '@/components/public/Container';
import { cn } from '@/lib/utils';
import { getSnapshot } from '@/market/server';
import { getListing } from '@/news/api';
import { HubHead, hubTitle } from './HubHead';
import { HubStories } from './HubStories';
import h from './hubs.module.css';
import { MarketsLive } from './MarketsLive';

/** The chart opens on Nifty 50; Compare adds these when they are curated. */
const NIFTY = 'NSE:NIFTY';
const COMPARE = ['BSE:SENSEX', 'NSE:BANKNIFTY'];
/** Interface strings (spec §5.10.1). */
const MARKET_DATA = 'Market data';
const INDICES = 'Indices';
const NIFTY_50 = 'Nifty 50';

/**
 * /news/markets (spec §5.10.1, §7.4), data first:
 * - an sr-only h2 "Market data"; IndexBoard board "Indices" (every curated
 *   INDEX row; India VIX neutral) in cols 1–7 beside the Nifty 50 chart in
 *   8–12 (opens on 6 months; Daily; Compare with Sensex and Bank Nifty
 *   when they are curated, offered by PriceChart only when every series
 *   has 60 sessions);
 * - (LIVE) the heatmap with the Nifty Field, the movers and the sectors
 *   (MarketsLive), else one DataNotice;
 * - then the stories with "Most read in Markets".
 * Rows link to stock pages only when quotable (the modules' StockName).
 */
export async function MarketsHub() {
  const [listing, trending, snapshot] = await Promise.all([
    getListing({ category: 'markets', page: 1 }),
    getListing({ category: 'markets', sort: 'trending', limit: 5 }),
    getSnapshot(),
  ]);
  const category = listing?.category;
  const title = hubTitle('markets', category);
  const curated = snapshot?.instruments ?? [];
  const nameOf = (ref: string) => curated.find((q) => q.ref === ref)?.name;
  const compare = COMPARE.filter((ref) => curated.some((q) => q.ref === ref && q.kind === 'INDEX'));
  const refs = [NIFTY, ...compare];
  const names = Object.fromEntries(refs.map((ref) => [ref, nameOf(ref) ?? (ref === NIFTY ? NIFTY_50 : ref.split(':')[1])]));

  return (
    <>
      <HubHead slug="markets" category={category} status />
      <section aria-labelledby="hub-market-data">
        <Container className={h.data}>
          <h2 id="hub-market-data" className="sr-only">
            {MARKET_DATA}
          </h2>
          <div className={cn('sv-terminal', h.terminal, h.rows)}>
            <div className={cn('sv-grid', h.row)}>
              <div className={cn(h.cell, h.c1to7)}>
                <IndexBoard initial={snapshot} density="board" title={INDICES} />
              </div>
              <div className={cn(h.cell, h.c8to12)}>
                <PriceChart
                  refs={refs}
                  names={names}
                  instrument="index"
                  defaultRange="6M"
                  modes={compare.length ? ['candles', 'compare'] : ['candles']}
                  numbers
                />
              </div>
            </div>
            <MarketsLive initialRight={snapshot?.right ?? null} />
          </div>
        </Container>
      </section>
      <HubStories
        slug="markets"
        title={title}
        listing={listing}
        mostRead={trending?.items ?? []}
        mostReadBelowOnTablet
      />
    </>
  );
}
