import type { ReactNode } from 'react';
import { formatLegalDate, formatShortDate, toDate } from '@/lib/site-content/format-date';

/**
 * The dated "We updated our privacy notice" lines (W7 addendum §5.6). The
 * API decides when they show (an announced material change: 30 days in the
 * footer, 90 days on the two notices) and the web caches its answer for at
 * most 60 s, so a line appears within seconds of the publish and goes at the
 * first regeneration after its end date. Absolute dates only, no client code.
 *
 * - `kind="footer"`: "We updated our [privacy notice] on 14 Sep 2027." The
 *   first line of the footer's bottom block on every public page and the
 *   404 (W6 places it, M7.5: FooterBody's `noticeLine`). The short date keeps
 *   it one line at 390 px. The link goes through `renderLink` (SiteFooter
 *   passes next/link; the default is a plain <a>, as the 404 needs).
 * - `kind="notice"`: under the "Updated" line of /privacy and /privacy/hi
 *   (LegalShell's `notice` slot, outside .legal-body and not .t-lead, so the
 *   F20 extract and the contents list ignore it):
 *   "We updated this notice on 14 September 2027. What changed: {summaryEn}"
 *   "हमने यह सूचना 14 सितंबर 2027 को अपडेट की। क्या बदला: {summaryHi}"
 *
 * Renders nothing for an invalid date, or once `until` has passed.
 * SERVER-SAFE AND CLIENT-FREE: no hooks, no next/link, no client import,
 * because the root 404's footer renders it.
 */

export type NoticeLineRenderLink = (p: { href: string; className?: string; children: ReactNode }) => ReactNode;

const plainLink: NoticeLineRenderLink = ({ href, className, children }) => (
  <a href={href} className={className}>
    {children}
  </a>
);

type FooterProps = {
  kind: 'footer';
  /** The change's materialAt (ISO). */
  date: string;
  /** The line's end (ISO): nothing renders after it. */
  until?: string | null;
  renderLink?: NoticeLineRenderLink;
  className?: string;
  linkClassName?: string;
};

type NoticeProps = {
  kind: 'notice';
  lang: 'en' | 'hi';
  /** The change's materialAt (ISO). */
  date: string;
  /** What changed, in the page's language (summaryEn / summaryHi). */
  summary: string;
  /** showUntil (ISO): nothing renders after it. */
  until?: string | null;
  className?: string;
};

export type NoticeLineProps = FooterProps | NoticeProps;

const ended = (until: string | null | undefined, now: number) => {
  if (!until) return false;
  const d = toDate(until);
  return !!d && d.getTime() <= now;
};

/** The footer line's text: "We updated our privacy notice on 14 Sep 2027." ('' for an invalid date). */
export function footerNoticeText(date: string): string {
  const day = formatShortDate(date);
  return day ? `We updated our privacy notice on ${day}.` : '';
}

/** The notice pages' line as text ('' for an invalid date). */
export function noticeChangeText(lang: 'en' | 'hi', date: string, summary: string): string {
  const day = formatLegalDate(date, lang);
  if (!day) return '';
  const what = summary.trim();
  if (lang === 'hi') return `हमने यह सूचना ${day} को अपडेट की।${what ? ` क्या बदला: ${what}` : ''}`;
  return `We updated this notice on ${day}.${what ? ` What changed: ${what}` : ''}`;
}

export function NoticeLine(props: NoticeLineProps) {
  const now = Date.now();
  if (ended(props.until, now)) return null;

  if (props.kind === 'footer') {
    const day = formatShortDate(props.date);
    if (!day) return null;
    const link = props.renderLink ?? plainLink;
    return (
      <p className={props.className} data-notice-line="footer">
        We updated our {link({ href: '/privacy', className: props.linkClassName, children: 'privacy notice' })} on{' '}
        {day}.
      </p>
    );
  }

  const text = noticeChangeText(props.lang, props.date, props.summary);
  if (!text) return null;
  return (
    <p
      className={props.className ?? 't-body mt-4 max-w-[34em] text-fg'}
      lang={props.lang === 'hi' ? 'hi' : undefined}
      data-notice-line="notice"
    >
      {text}
    </p>
  );
}
