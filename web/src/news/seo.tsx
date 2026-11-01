import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import { newsPath } from './routes';
import type { NewsArticle, NewsImage } from './types';

export const NEWS_NAME = `${SITE.name} News`;

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

export function articleMetadata(a: NewsArticle): Metadata {
  const title = a.seo.title || a.title;
  const description = a.seo.description || a.summary || a.subtitle || undefined;
  const canonical = a.seo.canonicalUrl || absolute(newsPath.article(a.slug));
  const og = shareImage(a.seo.image ?? a.image);
  const index = !a.seo.noIndex;
  const follow = !a.seo.noFollow;
  const authorUrl = a.author
    ? absolute(newsPath.author(a.author.slug))
    : undefined;
  return {
    title,
    description,
    alternates: { canonical },
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
      images: og ? [og] : undefined,
    },
    twitter: {
      card: og ? 'summary_large_image' : 'summary',
      site: SITE.twitter,
      title,
      description,
      images: og ? [og.url] : undefined,
    },
  };
}

/** Metadata for a paginated listing; page 2+ get their own canonical. */
export function listingMetadata(opts: {
  title: string;
  description: string;
  path: string;
  page: number;
  index?: boolean;
}): Metadata {
  const title =
    opts.page > 1 ? `${opts.title} (page ${opts.page})` : opts.title;
  const index = opts.index ?? true;
  return {
    title,
    description: opts.description,
    alternates: { canonical: opts.path },
    robots: { index, follow: true },
    openGraph: {
      type: 'website',
      url: absolute(opts.path),
      siteName: NEWS_NAME,
      locale: 'en_IN',
      title,
      description: opts.description,
    },
  };
}

export function newsArticleJsonLd(a: NewsArticle) {
  const url = absolute(newsPath.article(a.slug));
  const img = a.seo.image ?? a.image;
  const images = img
    ? [...new Set([img.url, ...img.variants.map((v) => v.url)])]
    : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: a.title.slice(0, 110),
    description: a.seo.description || a.summary || undefined,
    image: images,
    datePublished: a.firstPublishedAt ?? a.publishedAt,
    dateModified: a.updatedAt,
    author: a.author
      ? [
          {
            '@type': 'Person',
            name: a.author.name,
            url: absolute(newsPath.author(a.author.slug)),
          },
        ]
      : [{ '@type': 'Organization', name: SITE.name, url: SITE.url }],
    publisher: {
      '@type': 'Organization',
      name: SITE.name,
      url: SITE.url,
      logo: { '@type': 'ImageObject', url: `${SITE.url}/logo.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    articleSection: a.category?.name,
    keywords: a.tags.length ? a.tags.map((t) => t.name).join(', ') : undefined,
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

/**
 * Structured data as a script tag. `<` is escaped so a headline containing
 * "</script>" can never end the tag early.
 */
export function JsonLdScript({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
