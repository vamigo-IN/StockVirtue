import { SITE } from '@/lib/site';

/**
 * Structured data (schema.org) for rich results & SEO: the organisation, the
 * website (with search action), and the Android app as a MobileApplication.
 */
export function JsonLd({ logoUrl }: { logoUrl?: string }) {
  const data = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE.name,
      legalName: SITE.company,
      url: SITE.url,
      logo: logoUrl ?? `${SITE.url}/logo.png`,
      email: SITE.email,
      sameAs: [SITE.playUrl],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE.name,
      url: SITE.url,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'MobileApplication',
      name: SITE.name,
      operatingSystem: 'ANDROID',
      applicationCategory: 'FinanceApplication',
      description: SITE.description,
      url: SITE.url,
      installUrl: SITE.playUrl,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'INR' },
    },
  ];
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
