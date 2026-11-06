import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AuthorHead } from '@/components/news/listing/AuthorHead';
import { ListingView } from '@/components/news/ListingView';
import { RuleHead } from '@/components/public/Heads';
import { getListing } from '@/news/api';
import { newsPath, pageFromSegments } from '@/news/routes';
import { absolute, JsonLdScript, listingMetadata } from '@/news/seo';

export const revalidate = 30;

export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string; page?: string[] }> };

async function load(props: Props) {
  const { slug, page: segments } = await props.params;
  const page = pageFromSegments(segments);
  if (page === null) return null;
  const listing = await getListing({ author: slug, page });
  if (!listing?.author) return null;
  if (page > 1 && page > listing.totalPages) return null;
  return { page, listing, author: listing.author };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const d = await load(props);
  if (!d) return { title: 'Author not found', robots: { index: false } };
  return listingMetadata({
    title: `${d.author.name}`,
    description:
      d.author.bio ||
      `Stories by ${d.author.name} for the StockVirtue newsroom.`,
    path: newsPath.author(d.author.slug, d.page),
    page: d.page,
    index: d.listing.total > 0,
  });
}

/**
 * An author's page (spec §5.11): the profile head on paper (photo, H1 name,
 * bio, social links as icon plus text), then a RuleHead "Stories by {name}"
 * and the stories in DayGroups with h3 day headings. No aside. The
 * ProfilePage JSON-LD is unchanged.
 */
export default async function AuthorPage(props: Props) {
  const d = await load(props);
  if (!d) notFound();
  const a = d.author;
  const crumbs = [{ name: 'News', href: newsPath.home() }, { name: a.name }];
  return (
    <>
      <JsonLdScript
        data={{
          '@context': 'https://schema.org',
          '@type': 'ProfilePage',
          mainEntity: {
            '@type': 'Person',
            name: a.name,
            description: a.bio || undefined,
            image: a.avatarUrl || undefined,
            url: absolute(newsPath.author(a.slug)),
            sameAs: Object.values(a.socials),
          },
        }}
      />
      <ListingView
        title={a.name}
        crumbs={crumbs}
        head={<AuthorHead author={a} crumbs={crumbs} />}
        storiesHead={
          <RuleHead
            id="author-stories"
            title={`Stories by ${a.name}`}
            className="mb-[var(--sv-head-gap)]"
          />
        }
        listing={d.listing}
        hrefFor={(p) => newsPath.author(a.slug, p)}
        emptyTitle={`${a.name} hasn't published a story yet`}
        layout="days"
      />
    </>
  );
}
