import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { Container } from '@/components/public/Container';
import { cn } from '@/lib/utils';
import { newsPath } from '@/news/routes';
import type { NewsCard } from '@/news/types';
import { BreakingChip, StoryRankItem } from './StoryCard';
import s from './StoryCard.module.css';

/**
 * News furniture (spec §4.9). Server components: the rank items read
 * cardTime(), so a client component never imports this file (it imports
 * '@/components/public/Container' and the other primitives directly).
 */

/**
 * The breaking strip (spec §5.9.4): `<section aria-label="Breaking news">`
 * in the page container, a white box with a 3 px --sv-breaking left rule
 * and padding 12/16. The "Breaking" chip, then up to three headline links
 * (head-3 serif, hairline-separated): in one row from 768 px, stacked
 * below. No pulse.
 */
export function BreakingBar({
  items,
  className,
}: {
  items: NewsCard[];
  className?: string;
}) {
  if (!items.length) return null;
  return (
    <Container as="section" aria-label="Breaking news" className={className}>
      <div className={cn('bg-surface px-4 py-3 md:flex md:items-baseline md:gap-4', s.breakingBar)}>
        <BreakingChip className="shrink-0" />
        <ul className="mt-2 min-w-0 md:mt-0 md:flex md:flex-1">
          {items.slice(0, 3).map((c) => (
            <li
              key={c.id}
              className={cn(
                't-head-3 border-t border-rule py-2 text-fg first:border-t-0 first:pt-0 last:pb-0 md:min-w-0 md:flex-1 md:border-t-0 md:border-l md:px-4 md:py-0 md:first:border-l-0 md:first:pl-0 md:last:pr-0',
                s.hl,
              )}
            >
              <Link href={newsPath.article(c.slug)} className={s.inlineLink}>
                {c.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Container>
  );
}

/**
 * The most-read list (spec §4.8, §5.9.2): an `<ol>` of StoryRankItem with
 * h3 headlines (story headlines are h3 on /news). One column on phones,
 * two CSS columns on tablets and, with `columns`, one row of five from
 * 1024 px (6 to 10 stories: two rows of five; 11 or 12: rows of six).
 * Every item has a top hairline, so both tablet columns start alike. Rows
 * pad 12 px above and below on phones and 16 px from 768 px (lead
 * decision, 5 Nov 2026: the phone /news length).
 */
export function TrendingList({
  items,
  columns = false,
  className,
}: {
  items: NewsCard[];
  /** The /news band: tablet columns and a row of five from 1024 px. */
  columns?: boolean;
  className?: string;
}) {
  return (
    <ol
      className={cn(
        columns &&
          cn(
            'md:columns-2 md:gap-x-6 lg:grid lg:columns-auto lg:gap-x-8',
            items.length > 10 ? 'lg:grid-cols-6' : 'lg:grid-cols-5',
          ),
        className,
      )}
    >
      {items.map((c, i) => (
        <li key={c.id} className="break-inside-avoid border-t border-rule py-3 md:py-4">
          <StoryRankItem card={c} rank={i + 1} />
        </li>
      ))}
    </ol>
  );
}

/**
 * An empty or error state (spec §4.9): the existing copy in a 1 px dashed
 * --sv-line-strong box on paper, radius 12, padding 32, with a `title`
 * heading and a `small` body. Left-aligned, no illustration.
 * `headingLevel` (additive): h2 by default; h3 inside a section with its
 * own h2 (Learn's "All explainers").
 */
export function EmptyState({
  title,
  children,
  headingLevel = 'h2',
  className,
}: {
  title: string;
  children?: ReactNode;
  headingLevel?: 'h2' | 'h3';
  className?: string;
}) {
  const H = headingLevel;
  return (
    <div
      className={cn(
        'rounded-[16px] border border-dashed border-line-strong bg-surface p-8',
        className,
      )}
    >
      <H className={cn('t-title text-fg', s.hl)}>{title}</H>
      {children ? <div className="t-small mt-2 max-w-[34em] text-fg-2">{children}</div> : null}
    </div>
  );
}

/**
 * Numbered pages with Newer / Older (spec §4.9), as links crawlers can
 * follow: `nav aria-label="Pages"`. Newer and Older are quiet links
 * (rel prev / next). From 640 px: number cells 44 × 44, radius 8, each
 * named "Page {n}"; the current one is ink with white text and
 * aria-current="page". They show the first and last pages and the current
 * page ±1, with "…" between. Below 640 px (lead decision, 5 Nov 2026):
 * one line, Newer · "Page {n} of {N}" · Older, because seven cells plus
 * Newer and Older need about 408 px and a phone has 358.
 */
export function Pagination({
  page,
  totalPages,
  hrefFor,
  className,
}: {
  page: number;
  totalPages: number;
  hrefFor: (page: number) => string;
  className?: string;
}) {
  if (totalPages <= 1) return null;
  const nums = new Set<number>([1, totalPages]);
  for (let p = page - 1; p <= page + 1; p++) {
    if (p >= 1 && p <= totalPages) nums.add(p);
  }
  const sorted = [...nums].sort((a, b) => a - b);
  const cell =
    't-num font-mono inline-flex size-11 items-center justify-center rounded-[8px] text-fg';
  const quiet = 'sv-quiet t-small inline-flex min-h-11 items-center px-2';
  return (
    <nav aria-label="Pages" className={cn('mt-10', className)}>
      <ul className="flex items-center gap-1 max-sm:justify-between sm:flex-wrap">
        {page > 1 ? (
          <li className="sm:mr-2">
            <Link href={hrefFor(page - 1)} rel="prev" className={quiet}>
              Newer
            </Link>
          </li>
        ) : null}
        <li className="t-small inline-flex min-h-11 items-center px-2 text-fg-2 sm:hidden">
          Page {page} of {totalPages}
        </li>
        {sorted.map((p, i) => (
          <Fragment key={p}>
            {i > 0 && p - sorted[i - 1] > 1 ? (
              <li aria-hidden="true" className="t-num px-1 text-fg-3 max-sm:hidden">
                …
              </li>
            ) : null}
            <li className="max-sm:hidden">
              <Link
                href={hrefFor(p)}
                aria-label={`Page ${p}`}
                aria-current={p === page ? 'page' : undefined}
                className={cn(cell, p === page ? 'bg-green-700 text-white' : s.hoverCell)}
              >
                {p}
              </Link>
            </li>
          </Fragment>
        ))}
        {page < totalPages ? (
          <li className="sm:ml-2">
            <Link href={hrefFor(page + 1)} rel="next" className={quiet}>
              Older
            </Link>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}

/**
 * The breadcrumb trail (spec §4.9): `nav aria-label="Breadcrumb"` in the
 * `meta` style, "/" separators in --sv-fg-3 (aria-hidden), and the item
 * without a link as the current page (ink, 600, aria-current="page").
 * Links are 44 px tall on touch screens.
 */
export function Breadcrumbs({
  items,
  className,
}: {
  /** `lang` marks an item in another language (the Hindi notice's crumb). */
  items: { name: string; href?: string; lang?: string }[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn('t-meta text-fg-2', className)}>
      <ol className="flex flex-wrap items-center gap-x-2">
        {items.map((item, i) => (
          <li key={`${item.name}-${i}`} className="flex items-center gap-x-2">
            {i > 0 ? (
              <span aria-hidden="true" className="text-fg-3">
                /
              </span>
            ) : null}
            {item.href ? (
              <Link
                href={item.href}
                lang={item.lang}
                className={cn('inline-flex items-center pointer-coarse:min-h-11', s.inlineLink)}
              >
                {item.name}
              </Link>
            ) : (
              <span aria-current="page" lang={item.lang} className="font-semibold text-fg">
                {item.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
