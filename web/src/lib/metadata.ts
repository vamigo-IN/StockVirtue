import type { Metadata } from 'next';
import { getSettings, type SiteSettings } from './settings';
import { SITE } from './site';

/**
 * Metadata helpers for the public site's own pages (spec §10). News pages
 * keep theirs in src/news/seo.tsx (listingMetadata, articleMetadata).
 */

/**
 * The site's share image (Open Graph and Twitter), 1200×630: the admin's
 * share image as a JPEG crop through /brand (the media library keeps WebP),
 * or the built-in /og.png. The `?v=` id keeps webp-e2e's
 * `/brand/share.jpg?v=` check true wherever this is used.
 */
export function siteShareImage(s: SiteSettings): {
  url: string;
  width: 1200;
  height: 630;
  alt: string;
} {
  const share = s.config.branding.shareImage;
  const path = share ? `/brand/share.jpg?v=${share.id}` : '/og.png';
  return { url: `${SITE.url}${path}`, width: 1200, height: 630, alt: SITE.name };
}

/** Where "Get the app" and every Play badge go. */
export function playStoreUrl(s: SiteSettings): string {
  return s.playStoreUrl || SITE.playUrl;
}

/**
 * The header logo's own size when the admin's logo has one, so the image
 * has an intrinsic box (no layout shift); undefined means the owner's
 * /logo.png at 567×144 (SiteHeader's default).
 */
export function logoSize(
  s: SiteSettings,
): { width: number; height: number } | undefined {
  const logo = s.config.branding.logo;
  return logo?.width && logo.height
    ? { width: logo.width, height: logo.height }
    : undefined;
}

/**
 * The root layout's title template, so a page's og:title and twitter:title
 * read exactly like its <title> ("About · StockVirtue").
 */
function withTemplate(s: SiteSettings, title: string): string {
  const template = s.config.search.titleTemplate;
  return template.includes('%s')
    ? template.replace('%s', title)
    : `${title} · ${s.siteTitle || SITE.name}`;
}

/**
 * A public page's metadata: its title (through the site's template unless
 * `absoluteTitle`), description, canonical (and hreflang `languages`), Open
 * Graph with the site share image, and Twitter. Next replaces `alternates`,
 * `openGraph` and `twitter` as wholes in each segment that sets them, so a
 * page that uses this gets its own canonical and share tags instead of the
 * home page's.
 *
 * `noindex` marks just this page "noindex, follow"; the site-wide switch
 * (Site settings → Search & indexing) still comes from the root layout.
 *
 * `path` is site-relative ("/about"); the root layout's metadataBase makes
 * the canonical absolute.
 */
export async function pageMetadata(o: {
  title: string;
  description: string;
  path: string;
  absoluteTitle?: boolean;
  noindex?: boolean;
  languages?: Record<string, string>;
}): Promise<Metadata> {
  const settings = await getSettings();
  const image = siteShareImage(settings);
  const fullTitle = o.absoluteTitle ? o.title : withTemplate(settings, o.title);
  const handle = settings.config.search.twitterHandle;
  const siteIndexable = !settings.config.search.noindex;
  return {
    title: o.absoluteTitle ? { absolute: o.title } : o.title,
    description: o.description,
    alternates: {
      canonical: o.path,
      ...(o.languages ? { languages: o.languages } : {}),
    },
    openGraph: {
      type: 'website',
      locale: 'en_IN',
      siteName: SITE.name,
      url: `${SITE.url}${o.path === '/' ? '' : o.path}`,
      title: fullTitle,
      description: o.description,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description: o.description,
      images: [{ url: image.url, alt: image.alt }],
      ...(handle ? { site: handle, creator: handle } : {}),
    },
    ...(o.noindex
      ? {
          robots: {
            index: false,
            follow: siteIndexable,
            googleBot: { index: false, follow: siteIndexable },
          },
        }
      : {}),
  };
}
