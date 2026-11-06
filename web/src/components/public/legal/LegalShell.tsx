import Link from 'next/link';
import type { ReactNode } from 'react';
import { Breadcrumbs } from '@/components/news/blocks';
import { BandHead } from '@/components/site/BandHead';
import styles from './legal.module.css';
import { LegalToc } from './LegalToc';

// The shell's own words. Hindi uses the spec's two translations (§4.13);
// the phone "Contents" control reuses "इस पेज पर" (On this page).
const COPY = {
  en: { updated: 'Updated', onThisPage: 'On this page', contents: 'Contents', close: 'Close' },
  hi: { updated: 'अपडेट किया गया', onThisPage: 'इस पेज पर', contents: 'इस पेज पर', close: 'Close' },
} as const;

/**
 * The legal pages' layout (spec §4.13, §5.7; Emerald Terminal, 6 Nov 2026):
 * the site pages' emerald BandHead (the H1, "Updated …" in mono and the
 * summary), then the body on a white reading sheet (a 68–72ch column)
 * beside its contents list. Nothing fades in: the whole notice is in the
 * server HTML, visible at every size (no Reveal). There is no badge above
 * the H1 (R1).
 *
 * lang="hi" puts lang on the H1, the meta line, the summary and the body,
 * and localises the shell's own words, so the whole Hindi notice sits
 * inside main [lang="hi"].
 *
 * The body keeps the class `legal-body` (LegalToc reads its h2s; the reveal
 * probe measures it). Pass the existing prose as children; tables go in
 * LegalTable (or a `.legal-table` region wrapper).
 *
 * `breadcrumbs` (spec §2.3, §5.7, §9.5.7) goes above the H1, for the two
 * pages that have them: /privacy/hi `[{ name: 'Privacy notice', href:
 * '/privacy' }, { name: 'गोपनीयता सूचना', lang: 'hi' }]` and
 * /privacy/requests `[{ name: 'Privacy notice', href: '/privacy' },
 * { name: 'Privacy requests and grievances' }]`. The last item is the
 * current page (no href).
 *
 * `notice` (W7 addendum §5.6, §11.2): the two privacy notices' dated "We
 * updated this notice on …" line (NoticeLine kind="notice"), rendered in
 * the band under "Updated …" and the summary: outside `.legal-body`, so
 * the F20 extract and the contents list ignore it.
 *
 * `switchTo` (owner, 6 Nov 2026): the other language's notice as a button in
 * the band ("हिंदी में पढ़ें" on /privacy, "Read in English" on /privacy/hi).
 * The footer no longer lists the Hindi notice; this button is how readers
 * reach it, next to the body's own link to it.
 */
export function LegalShell({
  title,
  updated,
  summary,
  lang = 'en',
  breadcrumbs,
  notice,
  switchTo,
  children,
}: {
  title: string;
  updated?: string;
  summary?: string;
  lang?: 'en' | 'hi';
  breadcrumbs?: { name: string; href?: string; lang?: string }[];
  /** The dated change line under the head (the two notices only); nothing when null. */
  notice?: ReactNode;
  /** The same notice in the other language, shown as a button in the head. */
  switchTo?: { href: string; label: string; lang: 'en' | 'hi'; title: string };
  /** Removed: no eyebrow badge above legal H1s (R1). */
  badge?: never;
  children: ReactNode;
}) {
  const t = COPY[lang];
  const langAttr = lang === 'hi' ? 'hi' : undefined;
  return (
    <>
      <BandHead
        title={title}
        meta={updated ? `${t.updated} ${updated}` : undefined}
        lead={summary}
        lang={lang}
        crumbs={breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : undefined}
      >
        {switchTo ? (
          <p className={styles.switchRow}>
            <Link
              href={switchTo.href}
              hrefLang={switchTo.lang}
              lang={switchTo.lang}
              title={switchTo.title}
              className={styles.switch}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m5 8 6 6" />
                <path d="m4 14 6-6 2-3" />
                <path d="M2 5h12" />
                <path d="M7 2h1" />
                <path d="m22 22-5-10-5 10" />
                <path d="M14 18h6" />
              </svg>
              {switchTo.label}
            </Link>
          </p>
        ) : null}
        {notice ? <div className={styles.notice}>{notice}</div> : null}
      </BandHead>
      <div className="sv-container">
        <div className={`sv-grid ${styles.grid}`}>
          <LegalToc
            onThisPage={t.onThisPage}
            contents={t.contents}
            close={t.close}
            lang={langAttr}
          />
          <div className={`legal-body ${styles.body}`} lang={langAttr}>
            {children}
          </div>
        </div>
      </div>
    </>
  );
}
