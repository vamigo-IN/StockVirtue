import { getSettings } from '@/lib/settings';
import { SITE } from '@/lib/site';

/**
 * robots.txt, built from Site settings → Search & indexing. Replaces the old
 * static robots.ts so admins can hide the site, keep AI training crawlers out
 * and add their own lines.
 */
export const dynamic = 'force-static';
export const revalidate = 300;

/** Crawlers that collect pages to train AI models (not search or AI answers). */
const AI_TRAINING_CRAWLERS = [
  'GPTBot',
  'Google-Extended',
  'CCBot',
  'ClaudeBot',
  'anthropic-ai',
  'Applebot-Extended',
  'Bytespider',
  'Meta-ExternalAgent',
  'cohere-training-data-crawler',
];

export async function GET() {
  const { search } = (await getSettings()).config;
  const out = [
    '# Edited in the newsroom portal: Site settings > Search & indexing.',
    '',
  ];
  if (search.noindex) {
    out.push('User-agent: *', 'Disallow: /');
  } else {
    // Internal search results and server endpoints aren't pages.
    out.push(
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /api/',
      'Disallow: /news/search',
    );
    if (search.blockAiCrawlers) {
      out.push(
        '',
        ...AI_TRAINING_CRAWLERS.map((bot) => `User-agent: ${bot}`),
        'Disallow: /',
      );
    }
  }
  if (search.robotsExtra.trim()) out.push('', search.robotsExtra.trim());
  out.push(
    '',
    `Sitemap: ${SITE.url}/sitemap.xml`,
    `Sitemap: ${SITE.url}/news/sitemap.xml`,
  );
  if (search.googleNewsSitemap) {
    out.push(`Sitemap: ${SITE.url}/news/news-sitemap.xml`);
  }
  return new Response(`${out.join('\n')}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
