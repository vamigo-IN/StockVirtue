import type { Metadata } from 'next';
import './globals.css';
import { SITE } from '@/lib/site';
import { getSettings } from '@/lib/settings';

export async function generateMetadata(): Promise<Metadata> {
  const s = await getSettings();
  const title = s.siteTitle || SITE.name;
  const description = s.siteDescription || SITE.description;
  return {
    metadataBase: new URL(SITE.url),
    title: { default: `${title} — ${SITE.tagline}`, template: `%s · ${title}` },
    description,
    applicationName: SITE.name,
    keywords: [
      'stock market simulator',
      'virtual trading app India',
      'paper trading',
      'NSE BSE practice',
      'learn stock trading',
      'F&O simulator',
      'demat practice app',
      'StockVirtue',
    ],
    authors: [{ name: SITE.company }],
    creator: SITE.company,
    publisher: SITE.company,
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      locale: 'en_IN',
      siteName: SITE.name,
      url: SITE.url,
      title: `${title} — ${SITE.tagline}`,
      description,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${title} — ${SITE.tagline}`,
      description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
    category: 'finance',
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
