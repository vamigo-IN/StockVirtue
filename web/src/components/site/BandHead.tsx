import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import b from './band.module.css';

/**
 * The site pages' head (Emerald Terminal, 6 Nov 2026): a short emerald band
 * straight under the header, holding the optional breadcrumbs, the H1, the
 * meta line ("Updated 3 November 2026", in mono), the lead and anything the
 * page adds after it (jump links, the Play badge, the dated notice line).
 * The band ends in 40 px bottom corners on the mint ground. One pattern for
 * every site page: /features, /about, /contact, /faq, /download, the legal
 * pages (through LegalShell) and the custom pages at /[slug].
 *
 * - The lead keeps the class `t-lead` and the H1 is the page's only h1: the
 *   legal wording checks read them (the summary is "the .t-lead paragraph
 *   before the body").
 * - `aside` is a second column from 1024 px (the /features fact file, with
 *   `asideFrom="lg-only"`: the page shows it after the band when narrower),
 *   or from 768 px with `asideFrom="md"` (the /download QR card); otherwise
 *   it follows the main column when narrower.
 * - `lang="hi"` puts lang="hi" on the H1, the meta line and the lead (the
 *   Hindi notice); mono never sets Devanagari, so the Hindi meta line keeps
 *   the sans face.
 * - The band carries the `.sv-emerald` scope, so the semantic tokens read
 *   light inside it: the breadcrumbs, NoticeLine and buttons need no props
 *   of their own (Button primary turns the neon pill there).
 *
 * Server component, no client JS. Render it straight inside <main>: it has
 * its own container.
 */
export function BandHead({
  title,
  lead,
  meta,
  crumbs,
  lang = 'en',
  aside,
  asideFrom = 'lg',
  children,
  className,
}: {
  title: ReactNode;
  lead?: ReactNode;
  meta?: ReactNode;
  /** The breadcrumbs: the only thing ever above the H1. */
  crumbs?: ReactNode;
  lang?: 'en' | 'hi';
  /** A second column from 1024 px (cards on the band). */
  aside?: ReactNode;
  /**
   * 'md' puts the aside beside the text from 768 px, at its own width;
   * 'lg' beside it from 1024 px, under it narrower; 'lg-only' beside it from
   * 1024 px and not shown narrower (the page renders it after the band).
   */
  asideFrom?: 'md' | 'lg' | 'lg-only';
  /** After the lead, inside the main column. */
  children?: ReactNode;
  className?: string;
}) {
  const langAttr = lang === 'hi' ? 'hi' : undefined;
  return (
    <div className={cn('sv-emerald', b.band, className)} data-band="">
      <div className={cn('sv-container', b.inner)}>
        <div
          className={b.grid}
          data-aside={aside ? '' : undefined}
          data-from={aside && asideFrom !== 'lg' ? asideFrom : undefined}
        >
          <div className={b.main}>
            {crumbs ? <div className={b.crumbs}>{crumbs}</div> : null}
            <h1 className={b.title} lang={langAttr}>
              {title}
            </h1>
            {meta ? (
              <p className={b.meta} lang={langAttr} data-lang={langAttr}>
                {meta}
              </p>
            ) : null}
            {lead ? (
              <p className={cn('t-lead', b.lead)} lang={langAttr}>
                {lead}
              </p>
            ) : null}
            {children}
          </div>
          {aside ? <div className={b.aside}>{aside}</div> : null}
        </div>
      </div>
    </div>
  );
}

/**
 * A mono section label above an H2 (the design's "THE APP" eyebrow), in
 * sentence case in the markup: the capitals are the label's style only.
 * Decorative numbering ("01") goes in `index`; a number-only eyebrow is
 * hidden from assistive tech (the H2 says what the section is).
 */
export function Eyebrow({
  children,
  index,
  className,
  tone = 'light',
}: {
  children?: ReactNode;
  index?: string;
  className?: string;
  /** `band` on emerald grounds (neon), `light` on mint or white. */
  tone?: 'light' | 'band';
}) {
  return (
    <p className={cn(b.eyebrow, className)} data-tone={tone} aria-hidden={children ? undefined : true}>
      <span aria-hidden="true" className={b.eyebrowRule} />
      {index ? <span className={b.eyebrowIndex}>{index}</span> : null}
      {children ? <span>{children}</span> : null}
    </p>
  );
}
