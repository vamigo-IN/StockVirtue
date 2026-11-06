import { IpoBoard } from '@/components/market/IpoBoard';
import { DISCLAIMERS } from '@/components/widgets/meta';
import { Container } from '@/components/public/Container';
import { RuleHead } from '@/components/public/Heads';
import { cn } from '@/lib/utils';
import { getIpos, getSnapshot } from '@/market/server';
import { getListing } from '@/news/api';
import { HubHead, hubTitle } from './HubHead';
import { HubStories } from './HubStories';
import h from './hubs.module.css';

/** Interface strings (spec §5.10.3). */
const IPO_CALENDAR = 'IPO calendar';
const IPO_STORIES = 'IPO stories';

/**
 * /news/ipo (spec §5.10.3, §7.4):
 * - RuleHead h2 "IPO calendar", then IpoBoard in cols 1–9: the four
 *   tables stacked (Radix Tabs below 768), rows are <tr> and never links;
 *   "Last price" and "Since issue" only under the listing-price rule (never
 *   "Live"); Recently listed shows the ten newest, then "Show {n} more
 *   listings". It works under every licence, OFF included;
 * - DISCLAIMERS.ipo verbatim, as a RiskDisclaimer-style note;
 * - then the stories (`main article` = stories only: 2 in the fixture)
 *   with "Most read in IPOs".
 */
export async function IpoHub() {
  const [listing, trending, ipos, snapshot] = await Promise.all([
    getListing({ category: 'ipo', page: 1 }),
    getListing({ category: 'ipo', sort: 'trending', limit: 5 }),
    getIpos(),
    getSnapshot(),
  ]);
  const category = listing?.category;
  const title = hubTitle('ipo', category);

  return (
    <>
      <HubHead slug="ipo" category={category} />
      <section aria-labelledby="section-ipo-calendar">
        <Container className={h.data}>
          <RuleHead id="ipo-calendar" title={IPO_CALENDAR} className="mb-[var(--sv-head-gap)]" />
          <div className={cn('sv-grid', h.row)}>
            <div className={cn(h.cell, h.c1to9)}>
              <IpoBoard initial={ipos} initialSnapshot={snapshot} />
              {/* DISCLAIMERS.ipo, verbatim (spec §9.8). */}
              <p role="note" className={cn(h.risk, 't-small text-fg-2')}>
                {DISCLAIMERS.ipo}
              </p>
            </div>
          </div>
        </Container>
      </section>
      <HubStories
        slug="ipo"
        title={title}
        storiesTitle={IPO_STORIES}
        listing={listing}
        mostRead={trending?.items ?? []}
      />
    </>
  );
}
