import type { Metadata } from 'next';
import Link from 'next/link';
import { buttonClass } from '@/components/public/Button';
import { Container } from '@/components/public/Container';
import { newsPath } from '@/news/routes';
import c from '@/components/news/StoryCard.module.css';
import l from '@/components/news/listing/listing.module.css';

/**
 * A story (or any news address) that doesn't exist (spec §5.14). The title
 * still says "Story not found"; `robots: null` drops the inherited index
 * tags, so the page carries only Next's own noindex. `data-news-404` lets
 * public.css keep the news front's header on a story address (B-11).
 */
export const metadata: Metadata = { title: 'Story not found', robots: null };

export default function NewsNotFound() {
  return (
    <Container className="py-10 md:py-14 lg:py-[72px]" data-news-404="">
      <div className="sv-grid">
        {/* A white sheet on the mint ground (Emerald Terminal). */}
        <div className={`col-span-full lg:col-span-8 ${l.sheet}`}>
          <p className={c.kicker}>Not found</p>
          <h1 className={`t-hub-1 mt-3 text-fg ${c.hlBig}`}>We couldn’t find that story</h1>
          <p className={`t-standfirst mt-4 max-w-[36em] text-fg-2 ${c.standfirst}`}>
            It may have been moved or taken down, or the address may be mistyped.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={newsPath.home()} className={buttonClass({ variant: 'secondary' })}>
              Front page
            </Link>
            <Link href={newsPath.search()} className={buttonClass({ variant: 'secondary' })}>
              Search the news
            </Link>
          </div>
        </div>
      </div>
    </Container>
  );
}
