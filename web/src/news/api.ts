import 'server-only';
import { API_V1, backendHeaders, type ClientInfo } from '@/portal/backend';
import { breakingNow, expireBreaking } from './breaking';
import type {
  HomeSection,
  NewsArticle,
  NewsCard,
  NewsCategoryNode,
  NewsListing,
  NewsSitemap,
  SearchResults,
  StockListing,
} from './types';

/** Every news fetch carries this tag; the API's refresh call revalidates it. */
export const NEWS_TAG = 'news';

/**
 * Longest a news page or response is reused before it refreshes itself. The
 * API also asks for an immediate refresh whenever something public changes,
 * so this only bounds staleness if that call is lost.
 */
export const NEWS_REVALIDATE = 30;

/** The API said there is no such story, category, author or page. */
export class NewsNotFound extends Error {}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_V1}/news${path}`, {
    headers: { accept: 'application/json' },
    next: { revalidate: NEWS_REVALIDATE, tags: [NEWS_TAG] },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) throw new NewsNotFound(path);
  if (!res.ok) throw new Error(`News API answered ${res.status} for ${path}`);
  return (await res.json()) as T;
}

/**
 * `next build` pre-renders a few news pages (the homepage, section fronts,
 * feeds). If the API can't serve them then (down, or still on a release
 * without these routes), they start empty and fill in at their first
 * refresh, rather than failing a deploy of the whole website.
 */
async function emptyAtBuild<T>(p: Promise<T>, empty: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (process.env.NEXT_PHASE !== 'phase-production-build') throw err;
    console.warn(
      `News API unavailable during the build (${(err as Error).message}); this page starts empty.`,
    );
    return empty;
  }
}

/** Null instead of NewsNotFound, for callers that render notFound(). */
async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof NewsNotFound) return null;
    throw err;
  }
}

/**
 * Cards with the Breaking label only inside their 24 hours (news/breaking.ts),
 * checked as the page is drawn: a response cached here or in the API a
 * moment before the end never shows a label that has run out.
 */
function current<T extends NewsCard>(cards: T[], now = Date.now()): T[] {
  return cards.map((card) => expireBreaking(card, now));
}

function query(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const PAGE_SIZE = 12;

/**
 * The API's last listing page (its PageQueryDto has @Max(500)); past it the
 * API answers 400. The listing routes accept /page/2 to /page/999, so a page
 * beyond this one is simply a page that doesn't exist: null, like any other
 * missing page, which the route turns into its 404 (not a 500).
 */
const MAX_PAGE = 500;

export async function getHome(): Promise<{ sections: HomeSection[] }> {
  const home = await emptyAtBuild(get<{ sections: HomeSection[] }>('/home'), {
    sections: [],
  });
  const now = Date.now();
  return {
    ...home,
    sections: home.sections.flatMap((section) => {
      if (section.type !== 'breaking') {
        return [{ ...section, items: current(section.items, now) }];
      }
      // The banner keeps only stories still breaking, and goes when none
      // are, as the API leaves out a section with no stories.
      const items = section.items.filter((card) => breakingNow(card, now));
      return items.length ? [{ ...section, items }] : [];
    }),
  };
}

export async function getArticle(slug: string): Promise<NewsArticle | null> {
  const article = await orNull(get<NewsArticle>(`/${encodeURIComponent(slug)}`));
  if (!article) return null;
  const now = Date.now();
  return { ...expireBreaking(article, now), related: current(article.related, now) };
}

/**
 * A page of stories, newest first, or most read first with
 * `sort: 'trending'` (the API ranks by views over its trending window).
 */
export async function getListing(params: {
  category?: string;
  tag?: string;
  author?: string;
  page?: number;
  limit?: number;
  sort?: 'trending';
}): Promise<NewsListing | null> {
  if ((params.page ?? 1) > MAX_PAGE) return null;
  const listing = await emptyAtBuild(
    orNull(
      get<NewsListing>(
        query({
          ...params,
          limit: params.limit ?? PAGE_SIZE,
          page: params.page,
        }),
      ),
    ),
    null,
  );
  return listing && { ...listing, items: current(listing.items) };
}

export async function getStock(
  symbol: string,
  page = 1,
): Promise<StockListing | null> {
  if (page > MAX_PAGE) return null;
  const listing = await orNull(
    get<StockListing>(
      `/stocks/${encodeURIComponent(symbol)}${query({ page, limit: PAGE_SIZE })}`,
    ),
  );
  return listing && { ...listing, items: current(listing.items) };
}

/**
 * The most-read stories right now (`GET /news/trending?limit=`, at most 20),
 * shared for 30 s like every news fetch. Empty on any error, so a page
 * simply leaves its trending list out.
 */
export async function getTrending(limit = 5): Promise<NewsCard[]> {
  try {
    return current(await get<NewsCard[]>(`/trending${query({ limit })}`));
  } catch {
    return [];
  }
}

export async function getCategories(): Promise<NewsCategoryNode[]> {
  try {
    return await get<NewsCategoryNode[]>('/categories');
  } catch {
    return [];
  }
}

export function getSitemap() {
  return emptyAtBuild(get<NewsSitemap>('/sitemap'), {
    articles: [],
    categories: [],
    tags: [],
    authors: [],
  });
}

/**
 * Search runs per request (results depend on the query), passing the reader's
 * address with the site key so the API's per-reader limit applies to them,
 * not to this server as a whole.
 */
export async function searchNews(
  q: string,
  page: number,
  client: ClientInfo,
): Promise<SearchResults> {
  const res = await fetch(
    `${API_V1}/news/search${query({ q, page, limit: PAGE_SIZE })}`,
    {
      headers: backendHeaders(undefined, client, false),
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (res.status === 429) {
    throw new Error('Too many searches. Try again in a minute.');
  }
  if (!res.ok) throw new Error(`News search answered ${res.status}`);
  const results = (await res.json()) as SearchResults;
  return { ...results, items: current(results.items) };
}
