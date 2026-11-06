import { Fragment, type ReactNode } from 'react';
import { NoticeLine } from '@/components/site-content/NoticeLine';
import { FOOTER_LINKS, isFileHref, type FooterColumnKey, type NavLink } from '@/lib/nav';
import type { SiteSettings } from '@/lib/settings';
import { SITE } from '@/lib/site';
import { withFullStop } from '@/lib/text';
import { FacebookF, InstagramGlyph, LinkedInBug, XLogo, YouTubeIcon } from './icons';

/**
 * The footer's markup (spec §4.5), shared by SiteFooter (every public page)
 * and StaticFooter (the root 404). SERVER-SAFE AND CLIENT-FREE: no hooks,
 * no 'use client', and no import of a client module, not even a re-export,
 * because the server-only root 404 renders it. The client pieces (Cookie
 * settings, the palette switch, next/link, the phone accordions) come in
 * from SiteFooter through props.
 *
 * Admin-managed (W7 addendum §6, §5.6): the link columns, the three
 * legal-locked lines, the company line's tail and the dated notice line can
 * come from the published chrome (`columns`, `texts`, `noticeLine`). Left
 * out, today's constants render, so the footer is unchanged until someone
 * publishes. The Legal column is the one keyed `legal` (its title may be
 * renamed); the three lines keep `data-verbatim` whatever their source.
 * Never import src/content/site/chrome.ts here (it imports src/lib/nav.ts
 * and copies the constants below: a cycle).
 */

export type FooterVariant = 'home' | 'site' | 'news';
/** One link column: today's FOOTER_LINKS entries, or the published chrome's (`key` fixed, title and links editable). */
export type FooterColumn = { key: FooterColumnKey; title: string; links: readonly NavLink[] };
/** The footer's texts (the published chrome's `footer` lines, W7 addendum §6.1). */
export type FooterTexts = {
  /** Home and site pages; legal-locked, data-verbatim. */
  legalLine: string;
  /** News pages; legal-locked, data-verbatim. */
  newsLine: string;
  /** Every page; legal-locked, data-verbatim. */
  notBrokerLine: string;
  /** "© {year} {SITE.company} · {companyTail}"; '' drops the " · {tail}". */
  companyTail: string;
};
/** The dated "We updated our privacy notice on …" line (W7 addendum §5.6): `date` is the change's materialAt (ISO). */
export type FooterNoticeLine = { date: string; until?: string | null };
/**
 * What SiteFooter and StaticFooter take from getChrome() (`SiteChrome` from
 * src/lib/site-content/site-chrome.ts fits it as it is).
 */
export type FooterChrome = {
  footer: { columns: readonly FooterColumn[] } & FooterTexts;
  noticeLine?: FooterNoticeLine | null;
};

/** Never rewritten (spec §9.8): the legal line on home and site pages. */
export const FOOTER_LEGAL_LINE =
  'StockVirtue is an educational stock-market simulator. Every trade uses virtual money — not real funds. Nothing here is investment advice.';
/** Never rewritten (spec §9.8): the newsroom line on news pages. */
export const FOOTER_NEWS_LINE =
  'News and explainers on Indian and global markets, from the StockVirtue newsroom. For information and learning only: nothing here is investment advice.';
/** Never rewritten (spec §9.8): replaces the old "Simulated · not a broker" chip, on every page. */
export const NOT_A_BROKER_LINE =
  'StockVirtue is an educational trading simulator, not a broker.';

/** Today's footer texts: the three lines above and the company line's tail. */
export const FOOTER_TEXTS: FooterTexts = {
  legalLine: FOOTER_LEGAL_LINE,
  newsLine: FOOTER_NEWS_LINE,
  notBrokerLine: NOT_A_BROKER_LINE,
  companyTail: 'Made in India',
};

/** The footer's parts from a published chrome, for FooterBody's `columns`, `texts` and `noticeLine`. */
export function footerParts(chrome: FooterChrome | null | undefined): {
  columns?: readonly FooterColumn[];
  texts?: FooterTexts;
  noticeLine?: FooterNoticeLine | null;
} {
  if (!chrome) return {};
  const { columns, legalLine, newsLine, notBrokerLine, companyTail } = chrome.footer;
  return {
    columns,
    texts: { legalLine, newsLine, notBrokerLine, companyTail },
    noticeLine: chrome.noticeLine ?? null,
  };
}

/** Renders one footer link; SiteFooter passes next/link, the 404 plain <a>. */
export type RenderLink = (p: {
  href: string;
  className?: string;
  lang?: string;
  /** aria-label (the logo link). */
  label?: string;
  children: ReactNode;
}) => ReactNode;

export const plainLink: RenderLink = ({ href, className, lang, label, children }) => (
  <a href={href} className={className} lang={lang} aria-label={label}>
    {children}
  </a>
);

/**
 * Wraps one link column. The default is an always-open column; SiteFooter
 * turns News, The app and Company into phone accordions (PhoneDisclosure
 * "head") and keeps Legal (`column.key === 'legal'`) open.
 */
export type RenderColumn = (p: {
  column: FooterColumn;
  heading: ReactNode;
  list: ReactNode;
}) => ReactNode;

const openColumn: RenderColumn = ({ heading, list }) => (
  <div className="sv-footer-col">
    {heading}
    {list}
  </div>
);

const SOCIAL: {
  key: keyof SiteSettings['social'];
  name: string;
  Icon: ((p: { size?: number; className?: string }) => ReactNode) | null;
}[] = [
  // Each icon is the brand's official mark (src/components/public/icons): never a drawn logo.
  { key: 'twitter', name: 'X', Icon: XLogo },
  { key: 'instagram', name: 'Instagram', Icon: InstagramGlyph },
  { key: 'linkedin', name: 'LinkedIn', Icon: LinkedInBug },
  { key: 'youtube', name: 'YouTube', Icon: YouTubeIcon },
  { key: 'facebook', name: 'Facebook', Icon: FacebookF },
];

/** An external link (W7 addendum §6.2): a new tab, with an sr-only note. */
function externalLink(l: NavLink, className: string): ReactNode {
  return (
    <a href={l.href} className={className} lang={l.lang} target="_blank" rel="noopener noreferrer">
      {l.label}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

export function FooterBody({
  variant,
  settings,
  marketAttribution,
  cookieSettings,
  paletteToggle,
  renderLink = plainLink,
  renderColumn = openColumn,
  columns = FOOTER_LINKS,
  texts = FOOTER_TEXTS,
  noticeLine = null,
}: {
  variant: FooterVariant;
  settings?: SiteSettings;
  /** "Market data: …" line: news pages always, home only with the site-prices gate on. */
  marketAttribution?: string | null;
  /** The Cookie settings button, ending the Legal column (SiteFooter only). */
  cookieSettings?: ReactNode;
  /** PaletteToggle, ending the bottom block (SiteFooter only). */
  paletteToggle?: ReactNode;
  renderLink?: RenderLink;
  renderColumn?: RenderColumn;
  /** The link columns (the published chrome's), else FOOTER_LINKS. */
  columns?: readonly FooterColumn[];
  /** The three lines and the company tail (the published chrome's), else FOOTER_TEXTS. */
  texts?: FooterTexts;
  /** The dated notice line (getChrome()'s `noticeLine`): the bottom block's first line while it shows. */
  noticeLine?: FooterNoticeLine | null;
}) {
  const year = new Date().getFullYear();
  const social = settings
    ? SOCIAL.flatMap((s) => {
        const href = settings.social[s.key];
        return href ? [{ ...s, href }] : [];
      })
    : [];
  const link = (l: NavLink, className: string) =>
    l.external
      ? externalLink(l, className)
      : isFileHref(l.href)
        ? plainLink({ href: l.href, className, lang: l.lang, children: l.label })
        : renderLink({ href: l.href, className, lang: l.lang, children: l.label });

  return (
    <footer className="sv-footer">
      <div className="sv-container">
        <div className="sv-footer-top">
          <div className="sv-footer-brand">
            {renderLink({
              href: '/',
              className: 'sv-footer-logo',
              label: `${SITE.name} home`,
              children: (
                // The owner's logo with only "Stock" recoloured light for the
                // dark footer (spec §2.4): never redrawn or traced.
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/logo-on-dark.png" width={567} height={144} alt={SITE.name} />
              ),
            })}
            <p className="t-small sv-footer-blurb" data-verbatim="">
              {variant === 'news' ? texts.newsLine : texts.legalLine}
            </p>
            {social.length > 0 ? (
              <ul className="sv-footer-social">
                {social.map(({ key, name, Icon, href }) => (
                  <li key={key}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener me"
                      className="footer-link sv-footer-link"
                    >
                      {Icon ? <Icon size={18} /> : null}
                      <span>{name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {columns.map((column) => (
            <Fragment key={column.key}>
              {renderColumn({
                column,
                heading: <h2 className="t-label sv-footer-head">{column.title}</h2>,
                list: (
                  <ul className="sv-footer-list">
                    {column.links.map((l) => (
                      <li key={l.id ?? l.href}>{link(l, 'footer-link sv-footer-link')}</li>
                    ))}
                    {column.key === 'legal' && cookieSettings ? (
                      <li>
                        <div className="footer-cookie sv-footer-link">{cookieSettings}</div>
                      </li>
                    ) : null}
                  </ul>
                ),
              })}
            </Fragment>
          ))}
        </div>

        <div className="sv-footer-bottom">
          <div className="sv-footer-lines t-small">
            {noticeLine ? (
              <NoticeLine
                kind="footer"
                date={noticeLine.date}
                until={noticeLine.until}
                renderLink={renderLink}
                linkClassName="sv-quiet"
              />
            ) : null}
            {marketAttribution ? (
              <p data-verbatim="">
                {withFullStop(`Market data: ${marketAttribution}`)} Each price shows
                whether it is live, delayed or end-of-day.
              </p>
            ) : null}
            <p data-verbatim="">{texts.notBrokerLine}</p>
            {/* SITE.company already ends in a full stop: add nothing after it. */}
            <p>
              © {year} {SITE.company}
              {texts.companyTail ? ` · ${texts.companyTail}` : null}
            </p>
          </div>
          {paletteToggle ? <div className="sv-footer-palette">{paletteToggle}</div> : null}
        </div>
      </div>
    </footer>
  );
}
