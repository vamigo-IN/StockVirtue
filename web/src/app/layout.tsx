import type { Metadata, Viewport } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { SITE } from '@/lib/site';
import { getSettings } from '@/lib/settings';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-space',
  display: 'swap',
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono-jb',
  display: 'swap',
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
    themeColor: branding.themeColor || '#0a0f0d',
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
  return {
    metadataBase: new URL(SITE.url),
    title: {
      default: `${title} — ${SITE.tagline}`,
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
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      locale: 'en_IN',
      siteName: SITE.name,
      url: SITE.url,
      title: `${title} — ${SITE.tagline}`,
      description,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} — ${SITE.tagline}`,
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
 * Shared shell only: fonts, metadata and <html>/<body>. Stylesheets live in the
 * area layouts — globals.css in (site)/layout.tsx for the marketing pages and
 * portal.css in admin/layout.tsx for the staff portal — so neither area's
 * resets or utilities can leak into the other.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
