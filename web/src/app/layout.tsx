import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { SITE } from '@/lib/site';
import { getSettings } from '@/lib/settings';

// The staff portal's faces (/admin only). Their variables sit on <html> but
// public CSS never references them, so public pages never download them;
// preload: false keeps every route from preloading them too. The public
// site's own faces live in src/lib/fonts-public.ts, on #sv-public (spec §3.2.1).
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-space',
  display: 'swap',
  preload: false,
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono-jb',
  display: 'swap',
  preload: false,
});

const DEFAULT_KEYWORDS = [
  'stock market simulator',
  'virtual trading app India',
  'paper trading',
  'NSE BSE practice',
  'learn stock trading',
  'F&O simulator',
  'demat practice app',
  'StockVirtue',
];

export async function generateViewport(): Promise<Viewport> {
  const { branding } = (await getSettings()).config;
  return {
    width: 'device-width',
    initialScale: 1,
    themeColor: branding.themeColor || '#01261A',
    colorScheme: 'light',
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  const { branding, search, ads } = s.config;
  const title = s.siteTitle || SITE.name;
  const description = s.siteDescription || SITE.description;
  // Library images go through /brand as PNG/JPEG (the library keeps WebP).
  const share = branding.shareImage;
  const image = share
    ? {
        url: `/brand/share.jpg?v=${share.id}`,
        width: 1200,
        height: 630,
        alt: title,
      }
    : { url: '/og.png', width: 1200, height: 630, alt: SITE.name };
  const keywords = search.keywords
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  const favicon = branding.favicon?.id;
  const indexing = !search.noindex;
  // No dash in the default title (spec §1.1, rule R12).
  const defaultTitle = `${title}: ${SITE.tagline}`;
  return {
    metadataBase: new URL(SITE.url),
    title: {
      default: defaultTitle,
      template: search.titleTemplate.includes('%s')
        ? search.titleTemplate
        : `%s · ${title}`,
    },
    description,
    applicationName: SITE.name,
    keywords: keywords.length > 0 ? keywords : DEFAULT_KEYWORDS,
    icons: favicon
      ? {
          icon: [{ url: `/brand/icon.png?v=${favicon}`, type: 'image/png' }],
          apple: [{ url: `/brand/apple-icon.png?v=${favicon}` }],
        }
      : {
          icon: [
            { url: '/favicon.ico', sizes: 'any' },
            { url: '/icon.png', type: 'image/png' },
          ],
          apple: [{ url: '/apple-icon.png' }],
        },
    authors: [{ name: SITE.company }],
    creator: SITE.company,
    publisher: SITE.company,
    appleWebApp: { capable: true, title: SITE.name, statusBarStyle: 'default' },
    formatDetection: { telephone: false, address: false, email: false },
    openGraph: {
      type: 'website',
      locale: 'en_IN',
      siteName: SITE.name,
      url: SITE.url,
      title: defaultTitle,
      description,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: defaultTitle,
      description,
      images: [image.url],
      ...(search.twitterHandle
        ? { site: search.twitterHandle, creator: search.twitterHandle }
        : {}),
    },
    robots: {
      index: indexing,
      follow: indexing,
      googleBot: {
        index: indexing,
        follow: indexing,
        'max-image-preview': 'large',
      },
    },
    verification: {
      ...(search.googleVerification
        ? { google: search.googleVerification }
        : {}),
      ...(search.yandexVerification
        ? { yandex: search.yandexVerification }
        : {}),
      ...(search.bingVerification
        ? { other: { 'msvalidate.01': search.bingVerification } }
        : {}),
    },
    // AdSense's site check reads this tag as well as its script.
    ...(ads.adsenseClient
      ? { other: { 'google-adsense-account': ads.adsenseClient } }
      : {}),
    category: 'finance',
  };
}

/**
 * Shared shell only: metadata, <html> and <body>. No stylesheet and no
 * canonical (every page sets its own). The two areas bring their own CSS:
 * public.css in (public)/layout.tsx (and the root 404) for the public site,
 * portal.css in admin/layout.tsx for the staff portal, so neither area's
 * resets or utilities reach the other.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en-IN"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
