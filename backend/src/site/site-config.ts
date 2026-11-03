/**
 * Website settings beyond the basics, edited in the portal (Site settings):
 * branding, search & indexing (SEO, robots.txt, sitemaps, llms.txt),
 * analytics and advertising. Stored as one JSON document on the settings row;
 * the website builds tags, robots.txt, ads.txt and llms.txt from it. Every
 * value that ends up inside a <script> or a file is format-checked here, so
 * these fields can't carry code (raw HTML stays behind code injection).
 */

export interface BrandingConfig {
  /** Media library images (READY). */
  logoMediaId: string | null;
  faviconMediaId: string | null;
  shareImageMediaId: string | null;
  /** Browser UI colour on phones, e.g. #16a34a. Blank = the site's own. */
  themeColor: string;
}

export interface SearchConfig {
  /** Page title pattern; %s is the page's own title. Blank = the default. */
  titleTemplate: string;
  /** Comma-separated. */
  keywords: string;
  twitterHandle: string;
  googleVerification: string;
  bingVerification: string;
  yandexVerification: string;
  /** Ask search engines to leave the whole site out (e.g. while testing). */
  noindex: boolean;
  /** robots.txt: keep AI training crawlers (GPTBot, CCBot, …) out. */
  blockAiCrawlers: boolean;
  /** robots.txt: extra lines, robots directives only. */
  robotsExtra: string;
  sitemapCategories: boolean;
  sitemapTags: boolean;
  sitemapAuthors: boolean;
  /** /news/news-sitemap.xml for Google News. */
  googleNewsSitemap: boolean;
  /** /llms.txt: a plain map of the site for AI assistants. */
  llmsEnabled: boolean;
  llmsSummary: string;
  /** Latest stories listed in llms.txt. */
  llmsArticles: number;
}

export interface AnalyticsConfig {
  /** Google Analytics 4 measurement id, G-XXXXXXX. */
  ga4Id: string;
  /** Google Tag Manager container, GTM-XXXXXXX. */
  gtmId: string;
  metaPixelId: string;
  clarityId: string;
}

export interface AdsConfig {
  /** AdSense publisher id, ca-pub-0000000000000000. */
  adsenseClient: string;
  /** Let AdSense place ads automatically (Auto ads). */
  autoAds: boolean;
  /** Extra ads.txt lines for other ad networks. */
  adsTxt: string;
}

export interface SiteConfig {
  branding: BrandingConfig;
  search: SearchConfig;
  analytics: AnalyticsConfig;
  ads: AdsConfig;
}

export type SiteConfigGroup = keyof SiteConfig;

export const DEFAULT_CONFIG: SiteConfig = {
  branding: {
    logoMediaId: null,
    faviconMediaId: null,
    shareImageMediaId: null,
    themeColor: '',
  },
  search: {
    titleTemplate: '',
    keywords: '',
    twitterHandle: '',
    googleVerification: '',
    bingVerification: '',
    yandexVerification: '',
    noindex: false,
    blockAiCrawlers: false,
    robotsExtra: '',
    sitemapCategories: true,
    sitemapTags: true,
    sitemapAuthors: true,
    googleNewsSitemap: true,
    llmsEnabled: true,
    llmsSummary: '',
    llmsArticles: 50,
  },
  analytics: { ga4Id: '', gtmId: '', metaPixelId: '', clarityId: '' },
  ads: { adsenseClient: '', autoAds: false, adsTxt: '' },
};

/** The stored document over the defaults; unknown or wrong-typed keys drop. */
export function readConfig(stored: unknown): SiteConfig {
  const src = (stored && typeof stored === 'object' ? stored : {}) as Partial<
    Record<SiteConfigGroup, Record<string, unknown>>
  >;
  const merge = <T extends object>(defaults: T, given: unknown): T => {
    const g = (given && typeof given === 'object' ? given : {}) as Record<
      string,
      unknown
    >;
    const out = { ...defaults } as Record<string, unknown>;
    for (const [k, v] of Object.entries(defaults)) {
      const value = g[k];
      if (value === undefined) continue;
      if (v === null || typeof v === 'string') {
        if (value === null || typeof value === 'string') out[k] = value;
      } else if (typeof value === typeof v) {
        out[k] = value;
      }
    }
    return out as T;
  };
  return {
    branding: merge(DEFAULT_CONFIG.branding, src.branding),
    search: merge(DEFAULT_CONFIG.search, src.search),
    analytics: merge(DEFAULT_CONFIG.analytics, src.analytics),
    ads: merge(DEFAULT_CONFIG.ads, src.ads),
  };
}

const ROBOTS_LINE =
  /^(#.*|(user-agent|allow|disallow|crawl-delay|sitemap)\s*:\s*[^<>]*)$/i;
const ADS_TXT_LINE =
  /^(#.*|[a-z0-9.-]+\.[a-z]{2,}\s*,\s*[\w.-]+\s*,\s*(DIRECT|RESELLER)(\s*,\s*[\w.-]+)?\s*(#[^<>]*)?|(contact|subdomain|inventorypartnerdomain|ownerdomain|managerdomain)\s*=\s*[^<>\s]+)$/i;

/** The first line that isn't a robots.txt directive, or null. */
export function badRobotsLine(text: string): string | null {
  return lines(text).find((l) => !ROBOTS_LINE.test(l)) ?? null;
}

/** The first line that isn't an ads.txt record or variable, or null. */
export function badAdsTxtLine(text: string): string | null {
  return lines(text).find((l) => !ADS_TXT_LINE.test(l)) ?? null;
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Trimmed lines, blank ones dropped: how multi-line fields are stored. */
export function tidyLines(text: string): string {
  return lines(text).join('\n');
}
