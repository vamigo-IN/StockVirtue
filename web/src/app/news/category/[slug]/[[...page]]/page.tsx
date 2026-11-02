import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { ListingView, SubSections } from '@/components/news/ListingView';
import { getListing } from '@/news/api';
import { isLanding, newsPath, pageFromSegments } from '@/news/routes';
import { listingMetadata } from '@/news/seo';

export const revalidate = 30;

export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string; page?: string[] }> };

async function load(props: Props) {
  const { slug, page: segments } = await props.params;
  const page = pageFromSegments(segments);
  if (page === null) return null;
  const listing = await getListing({ category: slug, page });
  if (!listing?.category) return null;
  if (page > 1 && page > listing.totalPages) return null;
  return { page, listing, category: listing.category };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const d = await load(props);
  if (!d) return { title: 'Section not found', robots: { index: false } };
  return listingMetadata({
    title: `${d.category.name} news`,
    description:
      d.category.description ||
      `The latest ${d.category.name} stories from the StockVirtue newsroom.`,
    path: newsPath.category(d.category.slug, d.page),
    page: d.page,
    index: d.listing.total > 0,
  });
}

export default async function CategoryPage(props: Props) {
  const d = await load(props);
  if (!d) notFound();
  const c = d.category;
  // Sections with a landing page keep their first page there.
  if (d.page === 1 && isLanding(c.slug)) permanentRedirect(`/news/${c.slug}`);
  return (
    <ListingView
      eyebrow={c.parent ? c.parent.name : 'Section'}
      title={c.name}
      description={c.description || undefined}
      crumbs={[
        { name: 'News', href: newsPath.home() },
        ...(c.parent
          ? [{ name: c.parent.name, href: newsPath.category(c.parent.slug) }]
          : []),
        { name: c.name },
      ]}
      aside={<SubSections items={c.children} />}
      listing={d.listing}
      hrefFor={(p) => newsPath.category(c.slug, p)}
      emptyTitle="No stories in this section yet"
    />
  );
}
