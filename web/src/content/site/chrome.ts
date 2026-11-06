/**
 * The built-in chrome (W7 addendum §6.1): the menus, the footer's texts and
 * the root 404's heading and line. Until someone publishes the `chrome`
 * item, every page renders this, so it equals today's chrome exactly:
 * - the menus are built from today's constants in src/lib/nav.ts (NAV,
 *   DRAWER_MORE, DRAWER_LEGAL, FOOTER_LINKS), in their order, with their
 *   labels, paths and `lang`;
 * - the three footer lines are footer-body.tsx's FOOTER_LEGAL_LINE,
 *   FOOTER_NEWS_LINE and NOT_A_BROKER_LINE, word for word (spec §9.8: never
 *   rewritten), and "Made in India" is the company line's tail;
 * - the 404 texts are src/app/not-found.tsx's H1 and line.
 * The texts are copies (this plain-data module imports no component); the
 * M7.0 check script compares them with those sources.
 *
 * Added here, as §6.5 and §6.3 seed them: a stable id per link (from its
 * path), "The app" also current on /download, and the footer columns' keys
 * (news, app, company, legal, the order the validator requires).
 *
 * Never import this file from src/lib/nav.ts or footer-body.tsx (a cycle).
 */

import { DRAWER_LEGAL, DRAWER_MORE, FOOTER_LINKS, NAV, type NavLink } from '@/lib/nav';
import type { ChromeContent, FooterColumnKey, MenuLink } from './types';

/** A link's id from its path: "/news/feed.xml" → "news-feed-xml", "/privacy/hi" → "privacy-hi". */
function idFor(path: string): string {
  return path.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'home';
}

/** Primary items that are current on other paths too (§6.5 seeds). */
const ALSO_CURRENT_ON: Readonly<Record<string, readonly string[]>> = {
  '/features': ['/download'],
};

function menuLink(l: NavLink, primary = false): MenuLink {
  const link: MenuLink = { id: idFor(l.href), label: l.label, target: { type: 'path', path: l.href } };
  if (l.lang === 'hi' || l.lang === 'en') link.lang = l.lang;
  const also = primary ? ALSO_CURRENT_ON[l.href] : undefined;
  if (also) link.alsoCurrentOn = [...also];
  return link;
}

/** FOOTER_LINKS' four columns, in order. */
const COLUMN_KEYS: readonly FooterColumnKey[] = ['news', 'app', 'company', 'legal'];

export const CHROME_DEFAULT: ChromeContent = {
  primary: NAV.map((l) => menuLink(l, true)),
  drawerMore: DRAWER_MORE.map((l) => menuLink(l)),
  drawerLegal: DRAWER_LEGAL.map((l) => menuLink(l)),
  footer: {
    columns: FOOTER_LINKS.map((column, i) => ({
      key: COLUMN_KEYS[i],
      title: column.title,
      links: column.links.map((l) => menuLink(l)),
    })),
    legalLine:
      'StockVirtue is an educational stock-market simulator. Every trade uses virtual money — not real funds. Nothing here is investment advice.',
    newsLine:
      'News and explainers on Indian and global markets, from the StockVirtue newsroom. For information and learning only: nothing here is investment advice.',
    notBrokerLine: 'StockVirtue is an educational trading simulator, not a broker.',
    companyTail: 'Made in India',
  },
  notFound: {
    title: 'We can’t find that page',
    line: 'The address may be mistyped, or the page may have moved.',
  },
};
