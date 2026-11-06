import type { Metadata } from 'next';
import { siteShareImage } from '@/lib/metadata';
import { getSettings, type SiteSettings } from '@/lib/settings';
import { SITE } from '@/lib/site';
import { newsPath } from './routes';
import type { NewsArticle, NewsImage } from './types';

export const NEWS_NAME = `${SITE.name} News`;

/**
 * Bylines that are the newsroom itself, not a person: structured data names
 * them as an Organization (the automatic News Desk stories).
 */
const ORGANISATION_BYLINES = new Set(['news-desk']);

/** The crops /news/<slug>/image/<size> serves (see that route). */
export const SHARE_SIZES = {
  'og.jpg': { width: 1200, height: 630 },
  '16x9.jpg': { width: 1200, height: 675 },
  '4x3.jpg': { width: 1200, height: 900 },
  '1x1.jpg': { width: 1200, height: 1200 },
} as const;
export type ShareSize = keyof typeof SHARE_SIZES;

/** A story image crop, absolute (structured data and social tags need that). */
export const storyImage = (slug: string, size: ShareSize) =>
  absolute(`/news/${encodeURIComponent(slug)}/image/${size}`);

/// "2026-11-03T08:12:00+05:30": Indian time, as the newsroom publishes.
export function istIso(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return undefined;
  return `${new Date(t + 330 * 60_000).toISOString().slice(0, 19)}+05:30`;
}

/** Whether the site as a whole may be indexed (Site settings). */
const siteIndexable = (s: SiteSettings) => !s.config.search.noindex;

/**
 * The site's default share image, for pages without their own: the admin's
 * share image as a JPEG crop through /brand (the library keeps WebP), or
 * /og.png. The same image as `siteShareImage()` in src/lib/metadata.ts.
 */
export function defaultShareImage(s: SiteSettings) {
  return siteShareImage(s);
}

/**
 * RSS autodiscovery for news pages (spec §10). Next replaces `alternates`
 * as a whole in each segment that sets it, so every news page that sets a
 * canonical must include this in its own `alternates`.
 */
export const RSS_TYPES = {
  'application/rss+xml': [{ url: '/news/feed.xml', title: NEWS_NAME }],
};

export function absolute(path: string): string {
  return `${SITE.url}${path}`;
}

/** The copy social networks should use: about 1200 px wide when we have one. */
export function shareImage(img: NewsImage | null) {
  if (!img) return null;
  const big = img.variants.find((v) => v.width >= 1000);
  if (big) {
    const ratio = img.width && img.height ? img.height / img.width : null;
    return {
      url: big.url,
      width: big.width,
      height: ratio ? Math.round(big.width * ratio) : undefined,
      alt: img.alt,
    };
  }
  return {
    url: img.url,
    width: img.width ?? undefined,
    height: img.height ?? undefined,
    alt: img.alt,
  };
}

export async function articleMetadata(a: NewsArticle): Promise<Metadata> {
  const settings = await getSettings();
  const title = a.seo.title || a.title;
  const description = a.seo.description || a.summary || a.subtitle || undefined;
  const canonical = a.seo.canonicalUrl || absolute(newsPath.article(a.slug));
  const picture = a.seo.image ?? a.image;
  // The featured image cropped to 1200×630, or the site's share image.
  const og = picture
    ? {
        url: storyImage(a.slug, 'og.jpg'),
        width: 1200,
        height: 630,
        alt: picture.alt || title,
        type: 'image/jpeg',
      }
    : defaultShareImage(settings);
  const index = !a.seo.noIndex && siteIndexable(settings);
  const follow = !a.seo.noFollow && siteIndexable(settings);
  const authorUrl = a.author
    ? absolute(newsPath.author(a.author.slug))
    : undefined;
  return {
    title,
    description,
    alternates: { canonical, types: RSS_TYPES },
    robots: {
      index,
      follow,
      googleBot: { index, follow, 'max-image-preview': 'large' },
    },
    authors: a.author ? [{ name: a.author.name, url: authorUrl }] : undefined,
    openGraph: {
      type: 'article',
      url: canonical,
      siteName: NEWS_NAME,
      locale: 'en_IN',
      title,
      description,
      publishedTime: a.firstPublishedAt ?? a.publishedAt,
      modifiedTime: a.updatedAt,
      section: a.category?.name,
      tags: a.tags.map((t) => t.name),
      authors: authorUrl ? [authorUrl] : undefined,
      images: [og],
    },
    twitter: {
      card: 'summary_large_image',
      site: settings.config.search.twitterHandle || SITE.twitter,
      title,
      description,
      images: [{ url: og.url, alt: og.alt }],
    },
  };
}

/** Metadata for a paginated listing; page 2+ get their own canonical. */
export async function listingMetadata(opts: {
  title: string;
  description: string;
  path: string;
  page: number;
  index?: boolean;
}): Promise<Metadata> {
  const settings = await getSettings();
  const title =
    opts.page > 1 ? `${opts.title} (page ${opts.page})` : opts.title;
  const index = (opts.index ?? true) && siteIndexable(settings);
  return {
    title,
    description: opts.description,
    alternates: { canonical: opts.path, types: RSS_TYPES },
    robots: { index, follow: siteIndexable(settings) },
    openGraph: {
      type: 'website',
      url: absolute(opts.path),
      siteName: NEWS_NAME,
      locale: 'en_IN',
      title,
      description: opts.description,
      images: [defaultShareImage(settings)],
    },
    twitter: { card: 'summary_large_image' },
  };
}

/**
 * NewsArticle structured data, matching what the page shows: the featured
 * image in Google's three article shapes, Indian time, a person's byline as a
 * Person and the News Desk as an Organization (never the publisher posing as
 * a journalist), the companies the story is about, and the publisher's logo.
 */
export function newsArticleJsonLd(
  a: NewsArticle,
  opts: { logoUrl?: string | null } = {},
) {
  const url = absolute(newsPath.article(a.slug));
  const img = a.seo.image ?? a.image;
  const author = a.author
    ? {
        '@type': ORGANISATION_BYLINES.has(a.author.slug)
          ? 'Organization'
          : 'Person',
        name: a.author.name,
        url: absolute(newsPath.author(a.author.slug)),
      }
    : {
        '@type': 'Organization',
        name: `${SITE.name} News Desk`,
        url: SITE.url,
      };
  const keywords = [
    ...new Set(
      [
        ...a.tags.map((t) => t.name),
        ...a.stocks.map((s) => s.name ?? s.symbol),
        a.category?.name,
      ].filter((k): k is string => !!k),
    ),
  ];
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: a.title.slice(0, 110),
    description: a.seo.description || a.summary || undefined,
    image: img
      ? (['16x9.jpg', '4x3.jpg', '1x1.jpg'] as const).map((size) => ({
          '@type': 'ImageObject',
          url: storyImage(a.slug, size),
          width: SHARE_SIZES[size].width,
          height: SHARE_SIZES[size].height,
        }))
      : undefined,
    thumbnailUrl: img ? storyImage(a.slug, '16x9.jpg') : undefined,
    datePublished: istIso(a.firstPublishedAt ?? a.publishedAt),
    dateModified: istIso(a.updatedAt),
    author: [author],
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
      url: SITE.url,
      logo: {
        '@type': 'ImageObject',
        url: opts.logoUrl || `${SITE.url}/logo.png`,
      },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    articleSection: a.category?.name,
    keywords: keywords.length ? keywords : undefined,
    about: a.stocks.length
      ? a.stocks.map((s) => ({
          '@type': 'Corporation',
          name: s.name ?? s.symbol,
          tickerSymbol: `${s.exchange}:${s.symbol}`,
        }))
      : undefined,
    isAccessibleForFree: true,
    inLanguage: 'en-IN',
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: absolute(item.path),
    })),
  };
}

/** The characters escaped inside a JSON-LD script, and their JSON escapes. */
const JSON_LD_ESCAPES: Record<string, string> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
  '\u2028': '\\u2028',
  '\u2029': '\\u2029',
};

/**
 * Structured data as the text of a `<script type="application/ld+json">`
 * (W7 addendum §9.1): `JSON.stringify(data)` with `<`, `>`, `&`, U+2028 and
 * U+2029 written as JSON unicode escapes. No value (a headline, an editable
 * FAQ answer) can then end the tag early ("</script>"), open a comment or
 * a character reference, or break the line in older script parsers, and
 * JSON.parse reads back exactly the same data. The ONLY way site code puts
 * text into a script tag; never pass anything else to
 * dangerouslySetInnerHTML.
 */
export function jsonLdHtml(data: unknown): string {
  return (JSON.stringify(data) ?? 'null').replace(/[<>&\u2028\u2029]/g, (c) => JSON_LD_ESCAPES[c]);
}

/**
 * Structured data as a script tag, escaped by jsonLdHtml, so a headline
 * containing "</script>" can never end the tag early.
 */
export function JsonLdScript({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }}
    />
  );
}
