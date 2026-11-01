'use client';

import Link from 'next/link';

/** The news service didn't answer; cached pages keep serving meanwhile. */
export default function NewsError({ reset }: { reset: () => void }) {
  return (
    <div className="mx-auto w-full max-w-[1160px] px-4 py-20 text-center sm:px-6">
      <p className="font-mono text-sm tracking-[0.14em] text-alert-strong uppercase">
        Temporarily unavailable
      </p>
      <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
        The news didn’t load
      </h1>
      <p className="mx-auto mt-3 max-w-md text-muted-foreground">
        Our news service is taking too long to answer. Try again in a moment.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-primary px-5 py-2.5 font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
        <Link
          href="/news"
          className="rounded-lg border border-border px-5 py-2.5 font-semibold hover:bg-muted"
        >
          Top stories
        </Link>
      </div>
    </div>
  );
}
