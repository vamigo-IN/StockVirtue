import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Internal search results and server endpoints aren't pages.
        disallow: ['/admin', '/api/', '/news/search'],
      },
    ],
    sitemap: [
      `${SITE.url}/sitemap.xml`,
      `${SITE.url}/news/sitemap.xml`,
      `${SITE.url}/news/news-sitemap.xml`,
    ],
    host: SITE.url,
  };
}
