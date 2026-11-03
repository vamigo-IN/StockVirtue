import { getSettings } from '@/lib/settings';
import { SITE } from '@/lib/site';
import { getCategories, getSitemap } from '@/news/api';
import { newsPath } from '@/news/routes';
import { absolute } from '@/news/seo';

/**
 * /llms.txt (llmstxt.org): a plain Markdown map of the site for AI assistants,
 * with the main pages, news sections and latest stories. Switched on and
 * described under Site settings → Search & indexing.
 */
export const dynamic = 'force-static';
export const revalidate = 300;

/** Text safe inside a Markdown link label or note. */
const clean = (s: string) =>
  s
    .replace(/[[\]\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const item = (label: string, url: string, note?: string) =>
  `- [${clean(label)}](${url})${note ? `: ${clean(note)}` : ''}`;

const day = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

export async function GET() {
  const settings = await getSettings();
  const { search } = settings.config;
  if (!search.llmsEnabled) {
    return new Response('Not found\n', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  const [map, categories] = await Promise.all([getSitemap(), getCategories()]);
  const name = settings.siteTitle || SITE.name;
  const summary =
    search.llmsSummary || settings.siteDescription || SITE.description;
  const sections = categories.flatMap((c) => [c, ...c.children]);
  const lines = [
    `# ${clean(name)}`,
    '',
    `> ${clean(summary)}`,
    '',
    '## Main pages',
    item('Home', SITE.url),
    item('News', absolute(newsPath.home())),
    item('Latest news', absolute(newsPath.latest())),
    item('Features', `${SITE.url}/features`),
    item('Download the app', `${SITE.url}/download`),
    item('About', `${SITE.url}/about`),
    item('FAQ', `${SITE.url}/faq`),
    item('Contact', `${SITE.url}/contact`),
  ];
  if (sections.length > 0) {
    lines.push(
      '',
      '## News sections',
      ...sections.map((c) =>
        item(c.name, absolute(newsPath.category(c.slug)), c.description),
      ),
    );
  }
  const stories = map.articles.slice(0, search.llmsArticles);
  if (stories.length > 0) {
    lines.push(
      '',
      '## Latest stories',
      ...stories.map((a) =>
        item(a.title, absolute(newsPath.article(a.slug)), day(a.publishedAt)),
      ),
    );
  }
  lines.push(
    '',
    '## Optional',
    item('News RSS feed', absolute('/news/feed.xml')),
    item('Sitemap', `${SITE.url}/sitemap.xml`),
    item('News sitemap', absolute('/news/sitemap.xml')),
  );
  return new Response(`${lines.join('\n')}\n`, {
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}
