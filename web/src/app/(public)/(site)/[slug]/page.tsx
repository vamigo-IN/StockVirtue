import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { CustomPage } from '@/components/site-content/CustomPage';
import { isValidSlug } from '@/content/site/reserved-ids';
import { pageMetadata } from '@/lib/metadata';
import { getContentIndex, getCustomPage } from '@/lib/site-content/api';

/**
 * Custom pages at /<slug> (W7 addendum §3.12): "Refund policy", "Careers"
 * and the like, made and published in the portal. Static routes win over
 * this segment, and reserved slugs can't be created, so no existing page is
 * ever shadowed.
 *
 * - The slug is checked BEFORE any request: a dot, an underscore, upper case,
 *   a reserved name or a bad length is a 404 at once (bot probes such as
 *   /wp-login.php cost nothing).
 * - An old slug answers { movedTo } and redirects permanently (308).
 * - Unpublished or unknown: 404.
 * - generateStaticParams lists the LIVE pages (none when the API is down at
 *   build); others render on first request (dynamicParams) and refresh by
 *   their `custom:<slug>` tag.
 * - At run time a failed fetch keeps the last good page (getCustomPage
 *   throws; Next keeps serving what it has).
 */
export const dynamicParams = true;

type Params = { slug: string };

export async function generateStaticParams(): Promise<Params[]> {
  const index = await getContentIndex();
  return index.custom.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  if (!isValidSlug(slug)) return {};
  const page = await getCustomPage(slug);
  if (!page || 'movedTo' in page) return {};
  return pageMetadata({
    title: page.seo.title.trim() || page.title,
    description: page.seo.description.trim() || page.intro.trim() || page.title,
    path: `/${page.slug}`,
    noindex: page.seo.noindex,
  });
}

export default async function CustomPageRoute({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  if (!isValidSlug(slug)) notFound();
  const page = await getCustomPage(slug);
  if (!page) notFound();
  if ('movedTo' in page) permanentRedirect(`/${page.movedTo}`);
  return <CustomPage page={page} />;
}
