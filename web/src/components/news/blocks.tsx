import { ArrowRight, ChevronLeft, ChevronRight, Newspaper } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { cardTime } from '@/news/format';
import { newsPath } from '@/news/routes';
import type { NewsCard } from '@/news/types';

/** Width and gutters shared by every news page (16 px on phones). */
export function Container({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn('mx-auto w-full max-w-[1160px] px-4 sm:px-6', className)}
    >
      {children}
    </div>
  );
}

export function SectionHeader({
  title,
  href,
  linkLabel = 'View all',
  id,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  id?: string;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 border-b-2 border-foreground pb-2">
      <h2 id={id} className="text-xl font-bold sm:text-2xl">
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="group inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {linkLabel}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          <span className="sr-only"> of {title}</span>
        </Link>
      )}
    </div>
  );
}

/** The amber strip at the top of the homepage. */
export function BreakingBar({ items }: { items: NewsCard[] }) {
  if (!items.length) return null;
  return (
    <section aria-label="Breaking news" className="bg-ink text-ink-foreground">
      <Container className="flex items-start gap-3 py-3 sm:items-center">
        <span className="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-alert px-2 py-0.5 font-mono text-[11px] font-bold tracking-[0.1em] text-ink uppercase sm:mt-0">
          <span className="sv-live-dot size-1.5 rounded-full bg-ink" />
          Breaking
        </span>
        <ul className="flex min-w-0 flex-col gap-1 sm:flex-row sm:gap-6">
          {items.map((c) => (
            <li key={c.id} className="min-w-0">
              <Link
                href={newsPath.article(c.slug)}
                className="line-clamp-2 text-sm font-medium hover:text-glow hover:underline sm:line-clamp-1"
              >
                {c.title}
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

/** Most-read list: big mono numerals, as on a market board. */
export function TrendingList({
  items,
  columns = false,
}: {
  items: NewsCard[];
  columns?: boolean;
}) {
  return (
    <ol
      className={cn(
        'grid gap-x-8',
        columns ? 'sm:grid-cols-2 lg:grid-cols-5' : 'grid-cols-1',
      )}
    >
      {items.map((c, i) => (
        <li
          key={c.id}
          className="relative flex gap-3 border-b border-border py-4 lg:border-b-0"
        >
          <span
            aria-hidden="true"
            className="font-mono text-3xl leading-none font-bold text-primary/80 tabular-nums"
          >
            {i + 1}
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] leading-snug font-semibold">
              <Link
                href={newsPath.article(c.slug)}
                className="headline-link after:absolute after:inset-0 after:content-['']"
              >
                {c.title}
              </Link>
            </h3>
            <p className="mt-1.5 text-xs text-muted-foreground">
              <time dateTime={c.publishedAt}>{cardTime(c.publishedAt)}</time>
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function AppPromo({
  playUrl,
  title = 'Read it here. Practise it in the app.',
  compact = false,
}: {
  playUrl: string;
  title?: string;
  compact?: boolean;
}) {
  return (
    <aside
      aria-label="The StockVirtue app"
      className={cn(
        'relative overflow-hidden rounded-xl bg-ink text-ink-foreground',
        compact ? 'p-6' : 'p-6 sm:p-10',
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.08)_1px,transparent_1px)] bg-[size:32px_32px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -bottom-24 size-72 rounded-full bg-glow/20 blur-3xl"
      />
      <div
        className={cn(
          'relative flex flex-col gap-5',
          !compact && 'sm:flex-row sm:items-center sm:justify-between',
        )}
      >
        <div className="max-w-xl">
          <p className="font-mono text-[11px] tracking-[0.12em] text-glow uppercase">
            StockVirtue app · virtual money
          </p>
          <h2
            className={cn(
              'mt-2 font-bold',
              compact ? 'text-xl' : 'text-2xl sm:text-3xl',
            )}
          >
            {title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Trade the stories you read with ₹10 lakh of virtual money, at live
            NSE and BSE prices. Real order types, zero real risk.
          </p>
        </div>
        <a
          href={playUrl}
          target="_blank"
          rel="noopener"
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-glow px-5 py-3 text-sm font-bold text-ink transition-colors hover:bg-white focus-visible:outline-white"
        >
          Get it on Google Play
        </a>
      </div>
    </aside>
  );
}

export function EmptyState({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-paper px-6 py-14 text-center">
      <Newspaper className="size-8 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-3 text-lg font-semibold">{title}</h2>
      {children && (
        <div className="mt-1 max-w-md text-sm text-muted-foreground">
          {children}
        </div>
      )}
    </div>
  );
}

/** Numbered pages with Newer / Older, as links crawlers can follow. */
export function Pagination({
  page,
  totalPages,
  hrefFor,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  const nums = new Set<number>([1, totalPages]);
  for (let p = page - 1; p <= page + 1; p++) {
    if (p >= 1 && p <= totalPages) nums.add(p);
  }
  const sorted = [...nums].sort((a, b) => a - b);
  const cell =
    'inline-flex h-10 min-w-10 items-center justify-center rounded-md px-3 text-sm font-medium';
  return (
    <nav
      aria-label="Pages"
      className="mt-10 flex flex-wrap items-center justify-center gap-1"
    >
      {page > 1 ? (
        <Link
          href={hrefFor(page - 1)}
          rel="prev"
          className={cn(cell, 'gap-1 hover:bg-muted')}
        >
          <ChevronLeft className="size-4" /> Newer
        </Link>
      ) : null}
      {sorted.map((p, i) => (
        <span key={p} className="contents">
          {i > 0 && p - sorted[i - 1] > 1 && (
            <span className="px-1 text-muted-foreground" aria-hidden="true">
              …
            </span>
          )}
          {p === page ? (
            <span
              aria-current="page"
              className={cn(cell, 'bg-foreground text-background')}
            >
              {p}
            </span>
          ) : (
            <Link
              href={hrefFor(p)}
              className={cn(cell, 'hover:bg-muted')}
              aria-label={`Page ${p}`}
            >
              {p}
            </Link>
          )}
        </span>
      ))}
      {page < totalPages ? (
        <Link
          href={hrefFor(page + 1)}
          rel="next"
          className={cn(cell, 'gap-1 hover:bg-muted')}
        >
          Older <ChevronRight className="size-4" />
        </Link>
      ) : null}
    </nav>
  );
}

export function Breadcrumbs({
  items,
}: {
  items: { name: string; href?: string }[];
}) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => (
          <li key={`${item.name}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden="true">/</span>}
            {item.href ? (
              <Link
                href={item.href}
                className="hover:text-primary hover:underline"
              >
                {item.name}
              </Link>
            ) : (
              <span aria-current="page" className="text-foreground">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
