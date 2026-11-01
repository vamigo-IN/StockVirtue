/** Shapes of the public news API (/api/v1/news). Dates arrive as ISO strings. */

export interface NewsImage {
  url: string;
  width: number | null;
  height: number | null;
  alt: string;
  credit: string | null;
  /** Smaller WebP copies, narrowest first. */
  variants: { url: string; width: number }[];
}

export interface NewsCard {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  summary: string;
  publishedAt: string;
  updatedAt: string;
  readingMinutes: number;
  isBreaking: boolean;
  isFeatured: boolean;
  isAiGenerated: boolean;
  category: { slug: string; name: string } | null;
  author: { slug: string; name: string; avatarUrl: string | null } | null;
  image: NewsImage | null;
}

export interface NewsPage<T = NewsCard> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface CategoryContext {
  slug: string;
  name: string;
  description: string;
  parent: { slug: string; name: string } | null;
  children: { slug: string; name: string }[];
}

export interface AuthorContext {
  slug: string;
  name: string;
  bio: string;
  avatarUrl: string | null;
  socials: Partial<
    Record<
      'twitter' | 'linkedin' | 'instagram' | 'youtube' | 'facebook' | 'website',
      string
    >
  >;
}

export interface NewsListing extends NewsPage {
  category?: CategoryContext;
  tag?: { slug: string; name: string };
  author?: AuthorContext;
}

export interface StockListing extends NewsPage {
  stock: { symbol: string; exchange: string; name: string | null };
}

export interface SearchResults extends NewsPage {
  query: string;
}

export interface NewsArticle extends Omit<NewsCard, 'category' | 'author'> {
  firstPublishedAt: string | null;
  contentHtml: string;
  imageCaption: string | null;
  category: {
    slug: string;
    name: string;
    parent: { slug: string; name: string } | null;
  } | null;
  author: AuthorContext | null;
  tags: { slug: string; name: string }[];
  sectors: string[];
  stocks: { exchange: string; symbol: string; name: string | null }[];
  sources: { name: string; url: string | null; note: string | null }[];
  correctionNote: string | null;
  retractedAt: string | null;
  retractionNote: string | null;
  seo: {
    title: string | null;
    description: string | null;
    canonicalUrl: string | null;
    noIndex: boolean;
    noFollow: boolean;
    image: NewsImage | null;
  };
  related: NewsCard[];
}

export type HomeSectionType =
  'breaking' | 'featured' | 'latest' | 'category' | 'trending' | 'app_promo';

export interface HomeSection {
  id: string;
  type: HomeSectionType;
  title: string;
  category?: { slug: string; name: string };
  items: NewsCard[];
}

export interface NewsCategoryNode {
  slug: string;
  name: string;
  description: string;
  children: { slug: string; name: string; description: string }[];
}

export interface NewsSitemap {
  articles: {
    slug: string;
    title: string;
    publishedAt: string;
    updatedAt: string;
    image: { url: string; alt: string } | null;
  }[];
  categories: { slug: string; updatedAt: string }[];
  tags: { slug: string }[];
  authors: { slug: string; updatedAt: string }[];
}
