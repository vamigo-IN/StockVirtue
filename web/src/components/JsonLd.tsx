import { SITE } from '@/lib/site';
import { jsonLdHtml } from '@/news/seo';

/**
 * Structured data (schema.org) for every public page, rendered once by the
 * (public) layout: the organisation, the website with its news search
 * (SearchAction, spec §10), and the Android app as a MobileApplication.
 *
 * The tag stays exactly `<script type="application/ld+json">` with valid
 * JSON inside (privacy-e2e parses it with a regex), escaped by jsonLdHtml
 * (src/news/seo.tsx: `<`, `>`, `&`, U+2028 and U+2029), so no value can end
 * the tag early.
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
      description: SITE.description,
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: `${SITE.url}/news/search?q={search_term_string}`,
        },
        'query-input': 'required name=search_term_string',
      },
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
      dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }}
    />
  );
}
