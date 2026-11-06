'use client';

import Link from 'next/link';
import c from '@/components/news/StoryCard.module.css';
import l from '@/components/news/listing/listing.module.css';

/**
 * The news service didn't answer (spec §5.14); cached pages keep serving
 * meanwhile. Client (Next's error boundary). Left-aligned, nothing above
 * the H1. The button classes are written out (public.css `.sv-btn*`)
 * rather than imported, so this boundary, which every news page loads,
 * stays small.
 */
export default function NewsError({ reset }: { reset: () => void }) {
  return (
    // data-no-ads: ConsentScripts (stream E) keeps AdSense off this page.
    <div className="sv-container py-10 md:py-14 lg:py-[72px]" data-no-ads="">
      <div className="sv-grid">
        {/* A white sheet on the mint ground (Emerald Terminal). */}
        <div className={`col-span-full lg:col-span-8 ${l.sheet}`}>
          <p className={c.kicker}>Newsroom</p>
          <h1 className={`t-hub-1 mt-3 text-fg ${c.hlBig}`}>The news didn’t load</h1>
          <p className={`t-standfirst mt-4 max-w-[36em] text-fg-2 ${c.standfirst}`}>
            Our news service is taking too long to answer. Try again in a moment.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" onClick={reset} className="sv-btn sv-btn-primary">
              Try again
            </button>
            <Link href="/news" className="sv-btn sv-btn-secondary">
              Front page
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
