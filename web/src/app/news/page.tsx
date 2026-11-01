import type { Metadata } from 'next';
import { ArticleCard } from '@/components/news/ArticleCard';
import {
  AppPromo,
  BreakingBar,
  Container,
  EmptyState,
  SectionHeader,
  TrendingList,
} from '@/components/news/blocks';
import { getSettings } from '@/lib/settings';
import { SITE } from '@/lib/site';
import { getHome } from '@/news/api';
import { newsPath } from '@/news/routes';
import { absolute, NEWS_NAME } from '@/news/seo';
import type { HomeSection } from '@/news/types';

export const revalidate = 30;

const DESCRIPTION =
  'Indian and global market news, IPOs, commodities and plain-English explainers from the StockVirtue newsroom.';

export const metadata: Metadata = {
  title: { absolute: `${NEWS_NAME}: Indian stock market news, explained` },
  description: DESCRIPTION,
  alternates: { canonical: '/news' },
  openGraph: {
    type: 'website',
    url: absolute('/news'),
    siteName: NEWS_NAME,
    locale: 'en_IN',
    title: NEWS_NAME,
    description: DESCRIPTION,
  },
};

export default async function NewsHome() {
  const [{ sections }, settings] = await Promise.all([
    getHome(),
    getSettings(),
  ]);
  const hasStories = sections.some((s) => s.items.length > 0);

  return (
    <>
      <h1 className="sr-only">{NEWS_NAME}</h1>
      {!hasStories && (
        <Container className="py-16">
          <EmptyState title="The newsroom is getting ready">
            The first stories appear here as soon as they are published.
          </EmptyState>
        </Container>
      )}
      {sections.map((s, i) => (
        <Section
          key={s.id}
          section={s}
          first={i === 0}
          playUrl={settings.playStoreUrl || SITE.playUrl}
        />
      ))}
    </>
  );
}

function Section({
  section: s,
  first,
  playUrl,
}: {
  section: HomeSection;
  first: boolean;
  playUrl: string;
}) {
  const headingId = `section-${s.id}`;
  switch (s.type) {
    case 'breaking':
      return <BreakingBar items={s.items} />;

    case 'featured': {
      const [lead, ...rest] = s.items;
      return (
        <section aria-labelledby={headingId}>
          <Container className={first ? 'pt-8 pb-10' : 'py-10'}>
            <h2 id={headingId} className="sr-only">
              {s.title}
            </h2>
            <div className="grid gap-8 lg:grid-cols-12">
              <ArticleCard
                card={lead}
                variant="lead"
                priority
                className="lg:col-span-8"
              />
              {rest.length > 0 && (
                <div className="divide-y divide-border lg:col-span-4 lg:border-l lg:border-border lg:pl-8">
                  {rest.map((c) => (
                    <ArticleCard key={c.id} card={c} variant="compact" />
                  ))}
                </div>
              )}
            </div>
          </Container>
        </section>
      );
    }

    case 'latest':
      return (
        <section aria-labelledby={headingId}>
          <Container className="py-10">
            <SectionHeader
              id={headingId}
              title={s.title}
              href={newsPath.latest()}
              linkLabel="All the latest"
            />
            <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
              {s.items.map((c, i) => (
                <ArticleCard key={c.id} card={c} priority={first && i === 0} />
              ))}
            </div>
          </Container>
        </section>
      );

    case 'trending':
      return (
        <section aria-labelledby={headingId} className="bg-paper">
          <Container className="py-10">
            <SectionHeader id={headingId} title={s.title} />
            <TrendingList items={s.items} columns />
          </Container>
        </section>
      );

    case 'category': {
      const [lead, ...rest] = s.items;
      return (
        <section aria-labelledby={headingId}>
          <Container className="py-10">
            <SectionHeader
              id={headingId}
              title={s.title}
              href={s.category ? newsPath.category(s.category.slug) : undefined}
            />
            {s.items.length < 3 ? (
              // Too few for a lead and a column: a plain row of cards.
              <div className="grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
                {s.items.map((c) => (
                  <ArticleCard key={c.id} card={c} />
                ))}
              </div>
            ) : (
              <div className="grid gap-8 lg:grid-cols-2">
                <ArticleCard card={lead} />
                <div className="divide-y divide-border">
                  {rest.map((c) => (
                    <ArticleCard key={c.id} card={c} variant="compact" />
                  ))}
                </div>
              </div>
            )}
          </Container>
        </section>
      );
    }

    case 'app_promo':
      return (
        <Container className="py-10">
          <AppPromo playUrl={playUrl} title={s.title} />
        </Container>
      );

    default:
      return null;
  }
}
