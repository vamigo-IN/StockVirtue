import { Diagram } from '@/components/diagrams/Diagram';
import { DIAGRAM_ORDER, DIAGRAMS } from '@/components/diagrams/catalog';
import { EmptyState, Pagination } from '@/components/news/blocks';
import { StoryList } from '@/components/news/ListingView';
import { StoryCard } from '@/components/news/StoryCard';
import { AcademyPanel } from '@/components/public/AcademyPanel';
import { Container } from '@/components/public/Container';
import { RuleHead } from '@/components/public/Heads';
import { playStoreUrl } from '@/lib/metadata';
import { getSettings } from '@/lib/settings';
import { cn } from '@/lib/utils';
import { getListing } from '@/news/api';
import { newsPath } from '@/news/routes';
import type { NewsCard } from '@/news/types';
import { Glossary } from './Glossary';
import { HubHead } from './HubHead';
import h from './hubs.module.css';

/** Interface strings (spec §9.6.2). */
const START_HERE = 'Start here';
const ORDERS = 'How orders and margin work';
const ORDERS_INTRO =
  'Three diagrams of what happens when you place an order. None of them shows a price.';
const ALL = 'All explainers';
/** public-e2e: exactly once, with noindex. */
const EMPTY = 'No Learn stories yet';
const EMPTY_BODY = 'The first explainers appear here as soon as they are published.';

/**
 * Up to three stories for "Start here": featured first (newest first),
 * then the newest of the rest. The API has no featured filter, so only
 * page 1 is considered; "All explainers" lists the rest of page 1.
 */
function pickStart(items: NewsCard[]): { start: NewsCard[]; rest: NewsCard[] } {
  const featured = items.filter((c) => c.isFeatured);
  const others = items.filter((c) => !c.isFeatured);
  const start = [...featured, ...others].slice(0, 3);
  const ids = new Set(start.map((c) => c.id));
  return { start, rest: items.filter((c) => !ids.has(c.id)) };
}

/**
 * /news/education, "Learn" (spec §5.10.4, §9.6.2). The Learn link on every
 * page lands here, so the page always has real content, whatever the CMS
 * returns: the three teaching diagrams, the Academy panel and the glossary.
 * The newsroom's explainers come on top of them.
 *
 * In order: the head (no status line); "Start here" (only with stories:
 * 1 → a large row, 2 → two features, 3 → three; "{n} min read", no clock
 * time); "How orders and margin work" with W2's three diagrams and their
 * Learn captions; "All explainers" (the rest of page 1 as rows and the
 * pagination, or "No Learn stories yet" exactly once) with the
 * AcademyPanel in its aside; then the glossary. No market data, so no
 * Stamp and no data-market-module. The page stays noindex until the first
 * Learn story (landingMetadata: index = total > 0).
 */
export async function LearnHub() {
  const [listing, settings] = await Promise.all([
    getListing({ category: 'education', page: 1 }),
    getSettings(),
  ]);
  const category = listing?.category;
  const items = listing?.items ?? [];
  const { start, rest } = pickStart(items);

  return (
    <>
      <HubHead slug="education" category={category} />

      {start.length ? (
        <section aria-labelledby="section-start-here" className={h.learnSection}>
          <Container>
            <RuleHead id="start-here" title={START_HERE} className="mb-[var(--sv-head-gap)]" />
            <div className={cn('sv-grid', h.start)} data-n={start.length}>
              {start.map((card) =>
                start.length === 1 ? (
                  <StoryCard key={card.id} card={card} variant="row" size="lg" clock={false} className="border-t-0" />
                ) : (
                  <StoryCard key={card.id} card={card} variant="feature" clock={false} />
                ),
              )}
            </div>
          </Container>
        </section>
      ) : null}

      <section aria-labelledby="section-orders-and-margin" className={h.learnSection}>
        <Container>
          <RuleHead id="orders-and-margin" title={ORDERS} />
          <p className={cn(h.intro, 't-body text-fg-2')}>{ORDERS_INTRO}</p>
          <div className={h.diagrams}>
            {DIAGRAM_ORDER.map((id) => (
              <Diagram key={id} entry={DIAGRAMS[id]} page="learn" />
            ))}
          </div>
        </Container>
      </section>

      <section aria-labelledby="section-all-explainers" className={h.learnSection}>
        <Container>
          <RuleHead id="all-explainers" title={ALL} className="mb-[var(--sv-head-gap)]" />
          <div className={cn('sv-grid', h.explainers)}>
            <div className={h.explainersMain}>
              {items.length === 0 ? (
                <EmptyState title={EMPTY} headingLevel="h3">
                  {EMPTY_BODY}
                </EmptyState>
              ) : (
                <StoryList items={rest} splash={false} headingLevel="h3" clock={false} />
              )}
              {listing ? (
                <Pagination
                  page={listing.page}
                  totalPages={listing.totalPages}
                  hrefFor={(p) => newsPath.category('education', p)}
                />
              ) : null}
            </div>
            <div className={h.explainersSide}>
              <AcademyPanel headingLevel="h3" playUrl={playStoreUrl(settings)} />
            </div>
          </div>
        </Container>
      </section>

      <Container className={h.learnLast}>
        <Glossary />
      </Container>
    </>
  );
}

