import 'server-only';
import { API_V1, backendHeaders, type ClientInfo } from '@/portal/backend';
import type {
  HomeSection,
  NewsArticle,
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
 * feeds). If the API can't be reached then, they start empty and fill in at
 * their first refresh, rather than failing a deploy of the whole website.
 */
async function emptyAtBuild<T>(p: Promise<T>, empty: T): Promise<T> {
  try {
    return await p;
  } catch (err) {
    if (
      process.env.NEXT_PHASE === 'phase-production-build' &&
      !(err instanceof NewsNotFound)
    ) {
      return empty;
    }
    throw err;
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

function query(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export const PAGE_SIZE = 12;

export function getHome() {
  return emptyAtBuild(get<{ sections: HomeSection[] }>('/home'), {
    sections: [],
  });
}

export function getArticle(slug: string) {
  return orNull(get<NewsArticle>(`/${encodeURIComponent(slug)}`));
}

export function getListing(params: {
  category?: string;
  tag?: string;
  author?: string;
  page?: number;
  limit?: number;
}) {
  return emptyAtBuild(
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
}

export function getStock(symbol: string, page = 1) {
  return orNull(
    get<StockListing>(
      `/stocks/${encodeURIComponent(symbol)}${query({ page, limit: PAGE_SIZE })}`,
    ),
  );
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
  return (await res.json()) as SearchResults;
}
