import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PriceChart } from '@/components/market/PriceChart';
import { Breadcrumbs, EmptyState, Pagination } from '@/components/news/blocks';
import { DayGroups } from '@/components/news/DayGroups';
import { QuoteHeader } from '@/components/news/stock/QuoteHeader';
import { MarketsNow } from '@/components/news/story/MarketsNow';
import { TryItPanel } from '@/components/news/story/TryItPanel';
import { QuietArrow } from '@/components/public/Button';
import { Container } from '@/components/public/Container';
import { PageHead, RuleHead } from '@/components/public/Heads';
import { playStoreUrl } from '@/lib/metadata';
import { getSettings } from '@/lib/settings';
import { getQuotes, getSnapshot } from '@/market/server';
import type { QuotesData, Snapshot } from '@/market/types';
import { getStock } from '@/news/api';
import { newsPath, pageFromSegments } from '@/news/routes';
import { listingMetadata } from '@/news/seo';
import { cn } from '@/lib/utils';
import c from '@/components/news/StoryCard.module.css';
import l from '@/components/news/listing/listing.module.css';

export const revalidate = 30;

export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ symbol: string; page?: string[] }> };

async function load(props: Props) {
  const { symbol: segment, page: segments } = await props.params;
  // Next hands the segment over still percent-encoded ("M%26M" for M&M),
  // and getStock() encodes it for the API, so decode it once here. A
  // malformed escape is a 404.
  let symbol: string;
  try {
    symbol = decodeURIComponent(segment);
  } catch {
    return null;
  }
  const page = pageFromSegments(segments);
  if (page === null) return null;
  const listing = await getStock(symbol, page);
  if (!listing) return null;
  if (page > 1 && page > listing.totalPages) return null;
  // Any letter case works; the canonical address uses the exchange's symbol.
  return { page, listing, stock: listing.stock };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const d = await load(props);
  if (!d) return { title: 'Stock not found', robots: { index: false } };
  const name = d.stock.name ?? d.stock.symbol;
  return listingMetadata({
    title: `${name} (${d.stock.symbol}) news`,
    description: `Latest news and analysis on ${name} (${d.stock.exchange}: ${d.stock.symbol}) from the StockVirtue newsroom.`,
    path: newsPath.stock(d.stock.symbol, d.page),
    page: d.page,
    index: d.listing.total > 0,
  });
}

/**
 * What the page can say about the price (spec §5.13, §7.7):
 * - `priced`: quotable, and the server's getQuotes() has the quote;
 * - `unavailable`: quotable, but the quote came back `missing` or the call
 *   failed (the broker didn't answer); also when the snapshot itself
 *   couldn't be read, so the server can't tell (never claim "no price yet"
 *   then); the header and the chart try again in the browser;
 * - `off`: the licence is OFF (no quote request);
 * - `unlisted`: not quotable (no quote request).
 */
type PriceState = 'priced' | 'unavailable' | 'off' | 'unlisted';

/**
 * Quotable, decided from data the server already has and with no broker
 * call: a curated STOCK in the snapshot, a ref in `snapshot.quotableStocks`
 * (backend B1), or a stock named in a listed story (`listing.total > 0`:
 * every stock a listed story names is on the API's allowlist).
 */
function priceState(
  snapshot: Snapshot | null,
  ref: string,
  storyCount: number,
): { state: Exclude<PriceState, 'priced'> | 'quotable'; curated: boolean } {
  if (snapshot?.right === 'OFF') return { state: 'off', curated: false };
  const curated = !!snapshot?.instruments.some(
    (q) => q.kind === 'STOCK' && q.ref.toUpperCase() === ref,
  );
  const listed = !!snapshot?.quotableStocks?.some((r) => r.toUpperCase() === ref);
  if (curated || listed || storyCount > 0) return { state: 'quotable', curated };
  return { state: snapshot ? 'unlisted' : 'unavailable', curated: false };
}

export default async function StockPage(props: Props) {
  const d = await load(props);
  if (!d) notFound();
  const { stock, listing, page } = d;
  const name = stock.name ?? stock.symbol;
  // The stock page always prices NSE (BSE-only stocks are a known gap, spec §7.9).
  const ref = `NSE:${stock.symbol.toUpperCase()}`;

  const [settings, snapshot] = await Promise.all([getSettings(), getSnapshot()]);
  const decided = priceState(snapshot, ref, listing.total);
  // The one server quote request on the news pages, made only for a quotable
  // stock (spec §5.15 rule 2); a curated stock is answered from the API's
  // own snapshot at no broker cost.
  const quotes: QuotesData | null =
    decided.state === 'quotable' ? await getQuotes([ref]) : null;
  const state: PriceState =
    decided.state === 'quotable'
      ? quotes?.quotes.some((q) => q.ref.toUpperCase() === ref)
        ? 'priced'
        : 'unavailable'
      : decided.state;
  const showData = state === 'priced' || state === 'unavailable';
  const showMarkets = state !== 'off';
  const playUrl = playStoreUrl(settings);

  return (
    <>
      <PageHead
        family="news"
        crumbs={
          <Breadcrumbs items={[{ name: 'News', href: newsPath.home() }, { name }]} />
        }
        title={name}
        meta={`${stock.exchange} · ${stock.symbol}`}
        summary={`News and analysis about ${name}.`}
      >
        {state === 'off' ? (
          <p className="t-body mt-4 max-w-[40em] text-fg-2">
            Prices are switched off on the website at the moment.
          </p>
        ) : state === 'unlisted' ? (
          <>
            <p className="t-body mt-4 max-w-[40em] text-fg-2">
              We show prices for companies on our market list and companies
              named in our stories. There’s no price for {name} yet.
            </p>
            <p className="t-small mt-1">
              <Link href={newsPath.category('markets')} className="sv-quiet sv-quiet-hit">
                See the Markets page
                <QuietArrow />
              </Link>
            </p>
          </>
        ) : null}
      </PageHead>

      <Container className="pb-[var(--sv-section-site)]">
        <div className="lg:grid lg:grid-cols-12 lg:gap-x-[var(--sv-gutter)]">
          {showData ? (
            <section
              aria-labelledby="price-and-chart"
              // A terminal panel: the quote and the chart are the page's
              // dense figures (Emerald Terminal).
              className={cn(
                'sv-terminal mt-[var(--sv-block-news)] lg:col-span-8 lg:col-start-1 lg:row-start-1',
                c.termCard,
                l.termPad,
              )}
            >
              <h2 id="price-and-chart" className="sr-only">
                Price and chart
              </h2>
              <QuoteHeader
                refId={ref}
                initial={quotes}
                right={snapshot?.right}
                delayMinutes={snapshot?.delayMinutes}
                curated={decided.curated}
              />
              <PriceChart
                refs={[ref]}
                names={{ [ref]: name }}
                instrument="stock"
                defaultRange="1M"
                load="view"
                right={snapshot?.right}
                className="mt-6"
              />
            </section>
          ) : null}

          {showMarkets ? (
            // Beside the quote and the chart from 1024 px, after the chart on
            // tablets; phones get the shorter copy after the news (below).
            <aside
              aria-labelledby="stock-markets-now"
              className="mt-[var(--sv-block-news)] max-md:hidden lg:col-span-4 lg:col-start-9 lg:row-start-1"
            >
              <MarketsNow initial={snapshot} limit={6} titleId="stock-markets-now" />
            </aside>
          ) : null}

          <section
            aria-labelledby="section-stock-news"
            className={cn('mt-[var(--sv-block-news)] lg:col-span-8 lg:col-start-1', l.sheet)}
          >
            <RuleHead id="stock-news" title={`${name} in the news`} />
            {listing.items.length > 0 ? (
              <>
                <DayGroups items={listing.items} headingLevel="h3" className="mt-4" />
                <Pagination
                  page={page}
                  totalPages={listing.totalPages}
                  hrefFor={(p) => newsPath.stock(stock.symbol, p)}
                />
              </>
            ) : (
              <EmptyState
                title={`No stories about ${name} yet`}
                headingLevel="h3"
                className="mt-4"
              />
            )}
          </section>

          {showMarkets ? (
            <aside aria-labelledby="stock-markets-now-phone" className="mt-[var(--sv-block-news)] md:hidden">
              <MarketsNow initial={snapshot} limit={4} titleId="stock-markets-now-phone" />
            </aside>
          ) : null}

          <TryItPanel playUrl={playUrl} className="mt-[var(--sv-block-news)] lg:col-span-8 lg:col-start-1" />
        </div>
      </Container>
    </>
  );
}
