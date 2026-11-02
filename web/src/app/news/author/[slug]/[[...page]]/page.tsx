import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ListingView } from '@/components/news/ListingView';
import { getListing } from '@/news/api';
import { initials } from '@/news/format';
import { newsPath, pageFromSegments } from '@/news/routes';
import { absolute, JsonLdScript, listingMetadata } from '@/news/seo';
import type { AuthorContext } from '@/news/types';

export const revalidate = 30;

export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ slug: string; page?: string[] }> };

const SOCIAL_LABELS: Record<string, string> = {
  twitter: 'X / Twitter',
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  youtube: 'YouTube',
  facebook: 'Facebook',
  website: 'Website',
};

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

export default async function AuthorPage(props: Props) {
  const d = await load(props);
  if (!d) notFound();
  const a = d.author;
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
        eyebrow="Author"
        title={a.name}
        description={a.bio || undefined}
        crumbs={[{ name: 'News', href: newsPath.home() }, { name: a.name }]}
        aside={<AuthorAside author={a} />}
        listing={d.listing}
        hrefFor={(p) => newsPath.author(a.slug, p)}
        emptyTitle={`${a.name} hasn't published a story yet`}
      />
    </>
  );
}

function AuthorAside({ author }: { author: AuthorContext }) {
  const links = Object.entries(author.socials);
  return (
    <div className="mt-6 flex flex-wrap items-center gap-4">
      {author.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={author.avatarUrl}
          alt=""
          width={64}
          height={64}
          className="size-16 rounded-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="inline-flex size-16 items-center justify-center rounded-full bg-accent font-mono text-lg font-bold text-accent-foreground"
        >
          {initials(author.name)}
        </span>
      )}
      {links.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {links.map(([key, url]) => (
            <li key={key}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer me"
                className="font-medium text-primary hover:underline"
              >
                {SOCIAL_LABELS[key] ?? key}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
