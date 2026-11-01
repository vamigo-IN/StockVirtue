import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const routes: { path: string; priority: number }[] = [
    { path: '', priority: 1 },
    { path: '/features', priority: 0.9 },
    // The news site lists its own stories in /news/sitemap.xml.
    { path: '/news', priority: 0.8 },
    { path: '/download', priority: 0.9 },
    { path: '/about', priority: 0.7 },
    { path: '/faq', priority: 0.7 },
    { path: '/contact', priority: 0.6 },
    { path: '/terms', priority: 0.4 },
    { path: '/privacy', priority: 0.4 },
    { path: '/disclaimer', priority: 0.4 },
  ];
  return routes.map((r) => ({
    url: `${SITE.url}${r.path}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: r.priority,
  }));
}
