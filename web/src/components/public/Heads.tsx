import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { QuietArrow } from './Button';

/**
 * The three section heads (spec §4.7). Server components. Nothing ever sits
 * above a heading except SideHead's plain-text side label (R1): no pills,
 * no dots, no caps.
 */

/**
 * SideHead: home and site pages. A sentence-case side label, the H2 and an
 * optional lead.
 * - >= 1024: the label in cols 1–2 on the H2's first baseline, the H2 in
 *   cols 3–10, the lead in cols 3–8, 16 px below.
 * - Below 1024: the label sits 8 px above the H2 (a plain <p>, never a pill).
 * The H2 is `stage-2` on the home page (`family="home"`, the default) and
 * `stage-3` on site pages (`family="site"`). It is a 12-column grid that
 * spans its parent, so put it straight inside a Container or a .sv-grid.
 * Colours follow the surface: inside `.sv-stage` the same classes read
 * light. `tone="stage"` only marks it (data-tone) for page CSS.
 */
export function SideHead({
  label,
  title,
  lead,
  id,
  tone = 'paper',
  level = 'h2',
  family = 'home',
  className,
}: {
  label: string;
  title: ReactNode;
  lead?: ReactNode;
  /** The H2's id (for the section's aria-labelledby). */
  id?: string;
  tone?: 'paper' | 'stage';
  level?: 'h2';
  /** Additive (not in Appendix A): which H2 size. Default 'home' (stage-2). */
  family?: 'home' | 'site';
  className?: string;
}) {
  const H = level;
  return (
    <div
      className={cn('sv-sidehead sv-grid', className)}
      data-tone={tone === 'stage' ? 'stage' : undefined}
    >
      <p className="sv-sidehead-label t-label text-fg-2">{label}</p>
      <H
        id={id}
        className={cn(
          'sv-sidehead-title text-fg',
          family === 'site' ? 't-stage-3' : 't-stage-2',
        )}
      >
        {title}
      </H>
      {lead ? (
        <p className="sv-sidehead-lead t-lead text-fg-2">{lead}</p>
      ) : null}
    </div>
  );
}

/**
 * RuleHead: news sections. A 2 px rule (`--sv-fg`) above a `rule-head` H2
 * whose text is ONLY the title (public-e2e reads the CMS title from it),
 * and an aside on the same baseline with an optional LiveChip and a quiet
 * "More from {title}" link.
 *
 * Put the section's content (Trending's <ol> included) inside the SAME
 * <section> as this head, so `#section-{id} → .. → .. → ol li` resolves.
 * The H2's id is `section-{id}`. The "Top stories" section passes
 * `linkLabel="All the latest"`.
 */
export function RuleHead({
  id,
  title,
  href,
  linkLabel,
  aside,
  className,
}: {
  /** The H2's id is `section-${id}`. */
  id: string;
  title: string;
  /** Where "More from {title}" goes; no link without it. */
  href?: string;
  linkLabel?: string;
  /** Shown before the link: the LiveChip (>= 768 only, its own rule). */
  aside?: ReactNode;
  className?: string;
}) {
  const hasAside = Boolean(aside) || Boolean(href);
  return (
    <div className={cn('sv-rulehead', className)}>
      <h2 id={`section-${id}`} className="t-rule-head text-fg">
        {title}
      </h2>
      {hasAside ? (
        <div className="sv-rulehead-aside">
          {aside}
          {href ? (
            <Link href={href} className="sv-quiet sv-quiet-hit t-small">
              {linkLabel ?? `More from ${title}`}
              <QuietArrow />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * PageHead: site pages, legal pages, news listings and hubs. The H1, then
 * the optional meta line (for example "Updated 3 November 2026", or
 * "NSE · TCS" under a stock page's name: never above the H1, R1), then the
 * summary. `padding-block` 40/56/72 with no band colour, then a hairline.
 *
 * - `family="site"`: H1 `stage-2`, summary `lead`.
 * - `family="news"`: H1 `hub-1`, summary `standfirst`.
 * - `lang="hi"` puts lang="hi" on the H1, the meta line and the summary.
 * - `children` (additive) render after the summary inside the same
 *   container: jump links, a badge row, breadcrumbs.
 * It is full width with its own Container: render it straight inside
 * <main>, not inside another Container.
 */
export function PageHead({
  title,
  summary,
  meta,
  family,
  lang = 'en',
  crumbs,
  children,
  className,
}: {
  title: ReactNode;
  summary?: ReactNode;
  meta?: ReactNode;
  family: 'site' | 'news';
  lang?: 'en' | 'hi';
  /** The breadcrumbs, the only thing ever above the H1 (R1). */
  crumbs?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const langAttr = lang === 'hi' ? 'hi' : undefined;
  const news = family === 'news';
  return (
    <div className={cn('sv-pagehead', className)} data-family={family}>
      <div className="sv-container">
        {crumbs ? <div className="sv-pagehead-crumbs">{crumbs}</div> : null}
        <h1
          className={cn('sv-pagehead-title text-fg', news ? 't-hub-1' : 't-stage-2')}
          lang={langAttr}
        >
          {title}
        </h1>
        {meta ? (
          <p className="sv-pagehead-meta t-meta text-fg-3" lang={langAttr}>
            {meta}
          </p>
        ) : null}
        {summary ? (
          <p
            className={cn(
              'sv-pagehead-summary text-fg-2',
              news ? 't-standfirst' : 't-lead',
            )}
            lang={langAttr}
          >
            {summary}
          </p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
