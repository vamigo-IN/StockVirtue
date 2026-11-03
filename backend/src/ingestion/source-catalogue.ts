import { NewsSourceType, NewsSourceUsage } from '@prisma/client';

/** A ready-made source: official publishers whose terms we checked. */
export interface CatalogueSource {
  key: string;
  name: string;
  region: 'India' | 'Global';
  type: NewsSourceType;
  url: string;
  homepage: string;
  /** What we may show, from the publisher's terms (conservative). */
  usage: NewsSourceUsage;
  pollMinutes: number;
  attribution: string;
  /** The terms in a line, and where they say it. */
  terms: string;
  termsUrl: string;
  /** Something to know before switching it on. */
  caution?: string;
}

/** Government bodies and regulators: their stories go in Official updates. */
export const OFFICIAL_TYPES: ReadonlySet<NewsSourceType> = new Set([
  NewsSourceType.RBI,
  NewsSourceType.SEBI,
  NewsSourceType.GOVERNMENT,
]);

/**
 * The Official updates category (made by the official-updates migration,
 * kept apart from the main news). Sources added from the catalogue file
 * there while it exists and is switched on.
 */
export const OFFICIAL_CATEGORY_SLUG = 'official-updates';

const EXCHANGE_CAUTION =
  'The exchange reserves all rights, including links and redistribution: get legal sign-off before showing these on the site.';

/**
 * Official feeds checked on 2 Nov 2026: each one fetched (newest item read)
 * and its reuse terms read at the link given. Usage is set to what the terms
 * clearly allow: FULL_TEXT only for public-domain works or explicit reuse
 * grants, SUMMARY where rights are reserved or permission is needed first,
 * HEADLINE_ONLY where even that is unclear. Re-check the terms before
 * widening one.
 */
export const SOURCE_CATALOGUE: readonly CatalogueSource[] = [
  // ── India ───────────────────────────────────────────────────────────────
  {
    key: 'pib-all',
    name: 'PIB – all releases',
    region: 'India',
    type: NewsSourceType.GOVERNMENT,
    url: 'https://www.pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3&reg=3',
    homepage: 'https://pib.gov.in',
    usage: NewsSourceUsage.FULL_TEXT,
    pollMinutes: 15,
    attribution: 'Press Information Bureau, Government of India',
    terms:
      'Free to reproduce without prior approval if reproduced accurately with the source prominently acknowledged; third-party material excluded.',
    termsUrl: 'https://www.pib.gov.in/ContentPage.aspx?menuid=102&reg=3&lang=1',
    caution:
      'The feed carries headlines and links only (no text or dates), so its items can become drafts but not automatic stories. Ministry releases (Finance, Corporate Affairs, MoSPI) arrive here too.',
  },
  {
    key: 'rbi-press',
    name: 'RBI – press releases',
    region: 'India',
    type: NewsSourceType.RBI,
    url: 'https://www.rbi.org.in/pressreleases_rss.xml',
    homepage: 'https://www.rbi.org.in',
    usage: NewsSourceUsage.SUMMARY,
    pollMinutes: 30,
    attribution: 'Reserve Bank of India',
    terms:
      'All rights reserved; no reuse grant. Summaries with a link only, unless RBI agrees in writing to more.',
    termsUrl: 'https://www.rbi.org.in/Scripts/Disclaimer.aspx',
  },
  {
    key: 'rbi-notifications',
    name: 'RBI – notifications',
    region: 'India',
    type: NewsSourceType.RBI,
    url: 'https://www.rbi.org.in/notifications_rss.xml',
    homepage: 'https://www.rbi.org.in',
    usage: NewsSourceUsage.SUMMARY,
    pollMinutes: 60,
    attribution: 'Reserve Bank of India',
    terms:
      'All rights reserved; no reuse grant. Summaries with a link only, unless RBI agrees in writing to more.',
    termsUrl: 'https://www.rbi.org.in/Scripts/Disclaimer.aspx',
  },
  {
    key: 'sebi-all',
    name: 'SEBI – all updates',
    region: 'India',
    type: NewsSourceType.SEBI,
    url: 'https://www.sebi.gov.in/sebirss.xml',
    homepage: 'https://www.sebi.gov.in',
    usage: NewsSourceUsage.SUMMARY,
    pollMinutes: 30,
    attribution: 'Securities and Exchange Board of India',
    terms:
      'Free to reproduce after asking SEBI by email, with the source acknowledged. Full text once SEBI agrees.',
    termsUrl: 'https://www.sebi.gov.in/website-policy.html',
    caution:
      'Most items are enforcement and recovery orders; circulars and press releases are the rest.',
  },
  {
    key: 'niti',
    name: 'NITI Aayog',
    region: 'India',
    type: NewsSourceType.GOVERNMENT,
    url: 'https://www.niti.gov.in/rss.xml',
    homepage: 'https://www.niti.gov.in',
    usage: NewsSourceUsage.SUMMARY,
    pollMinutes: 720,
    attribution: 'NITI Aayog',
    terms: 'Free to reproduce after asking NITI Aayog by email.',
    termsUrl: 'https://www.niti.gov.in/copyright-policy',
  },
  {
    key: 'nse-circulars',
    name: 'NSE – circulars',
    region: 'India',
    type: NewsSourceType.EXCHANGE,
    url: 'https://nsearchives.nseindia.com/content/RSS/Circulars.xml',
    homepage: 'https://www.nseindia.com/rss-feed',
    usage: NewsSourceUsage.HEADLINE_ONLY,
    pollMinutes: 30,
    attribution: 'National Stock Exchange of India',
    terms:
      'NSE owns the copyright; personal, non-commercial use only; no reproduction without consent.',
    termsUrl: 'https://www.nseindia.com/static/nse-copyright',
    caution: EXCHANGE_CAUTION,
  },
  {
    key: 'nse-announcements',
    name: 'NSE – corporate announcements',
    region: 'India',
    type: NewsSourceType.EXCHANGE,
    url: 'https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml',
    homepage: 'https://www.nseindia.com/rss-feed',
    usage: NewsSourceUsage.HEADLINE_ONLY,
    pollMinutes: 15,
    attribution: 'National Stock Exchange of India',
    terms:
      'NSE owns the copyright; personal, non-commercial use only; no reproduction without consent.',
    termsUrl: 'https://www.nseindia.com/static/nse-copyright',
    caution: `${EXCHANGE_CAUTION} A busy feed (about 1,600 items).`,
  },
  {
    key: 'bse-notices',
    name: 'BSE – notices',
    region: 'India',
    type: NewsSourceType.EXCHANGE,
    url: 'https://www.bseindia.com/data/xml/notices.xml',
    homepage: 'https://www.bseindia.com',
    usage: NewsSourceUsage.HEADLINE_ONLY,
    pollMinutes: 60,
    attribution: 'BSE Ltd',
    terms: 'No reuse grant found; BSE states "All rights reserved".',
    termsUrl: 'https://www.bseindia.com',
    caution: EXCHANGE_CAUTION,
  },

  // ── Global (macro context for Indian markets) ───────────────────────────
  {
    key: 'fed-monetary',
    name: 'US Federal Reserve – monetary policy',
    region: 'Global',
    type: NewsSourceType.GOVERNMENT,
    url: 'https://www.federalreserve.gov/feeds/press_monetary.xml',
    homepage: 'https://www.federalreserve.gov/feeds/feeds.htm',
    usage: NewsSourceUsage.FULL_TEXT,
    pollMinutes: 15,
    attribution: 'Board of Governors of the Federal Reserve System',
    terms:
      'Public domain: may be copied and distributed without permission; cite the Board.',
    termsUrl: 'https://www.federalreserve.gov/disclaimer.htm',
  },
  {
    key: 'fed-all',
    name: 'US Federal Reserve – all press releases',
    region: 'Global',
    type: NewsSourceType.GOVERNMENT,
    url: 'https://www.federalreserve.gov/feeds/press_all.xml',
    homepage: 'https://www.federalreserve.gov/feeds/feeds.htm',
    usage: NewsSourceUsage.FULL_TEXT,
    pollMinutes: 60,
    attribution: 'Board of Governors of the Federal Reserve System',
    terms:
      'Public domain: may be copied and distributed without permission; cite the Board.',
    termsUrl: 'https://www.federalreserve.gov/disclaimer.htm',
  },
  {
    key: 'sec-press',
    name: 'US SEC – press releases',
    region: 'Global',
    type: NewsSourceType.GOVERNMENT,
    url: 'https://www.sec.gov/news/pressreleases.rss',
    homepage: 'https://www.sec.gov',
    usage: NewsSourceUsage.FULL_TEXT,
    pollMinutes: 60,
    attribution: 'U.S. Securities and Exchange Commission',
    terms:
      'Public information that may be copied or distributed without permission; do not use the SEC seal or logos.',
    termsUrl: 'https://www.sec.gov/about/privacy-information',
  },
  {
    key: 'bls-employment',
    name: 'US BLS – Employment Situation',
    region: 'Global',
    type: NewsSourceType.GOVERNMENT,
    url: 'https://www.bls.gov/feed/empsit.rss',
    homepage: 'https://www.bls.gov/feed',
    usage: NewsSourceUsage.FULL_TEXT,
    pollMinutes: 60,
    attribution: 'U.S. Bureau of Labor Statistics',
    terms: 'Public domain (except credited photos); cite BLS.',
    termsUrl: 'https://www.bls.gov/opub/copyright-information.htm',
    caution: 'BLS sometimes refuses automated requests from some networks.',
  },
  {
    key: 'bls-cpi',
    name: 'US BLS – Consumer Price Index',
    region: 'Global',
    type: NewsSourceType.GOVERNMENT,
    url: 'https://www.bls.gov/feed/cpi.rss',
    homepage: 'https://www.bls.gov/feed',
    usage: NewsSourceUsage.FULL_TEXT,
    pollMinutes: 60,
    attribution: 'U.S. Bureau of Labor Statistics',
    terms: 'Public domain (except credited photos); cite BLS.',
    termsUrl: 'https://www.bls.gov/opub/copyright-information.htm',
    caution: 'BLS sometimes refuses automated requests from some networks.',
  },
  {
    key: 'bea-all',
    name: 'US BEA – economic releases',
    region: 'Global',
    type: NewsSourceType.GOVERNMENT,
    url: 'https://apps.bea.gov/rss/rss.xml',
    homepage: 'https://www.bea.gov',
    usage: NewsSourceUsage.FULL_TEXT,
    pollMinutes: 60,
    attribution: 'U.S. Bureau of Economic Analysis',
    terms:
      'Public domain: may be used or reproduced without specific permission; cite BEA.',
    termsUrl: 'https://www.bea.gov/help/faq/145',
  },
  {
    key: 'eia-today',
    name: 'US EIA – Today in Energy',
    region: 'Global',
    type: NewsSourceType.GOVERNMENT,
    url: 'https://www.eia.gov/rss/todayinenergy.xml',
    homepage: 'https://www.eia.gov',
    usage: NewsSourceUsage.FULL_TEXT,
    pollMinutes: 720,
    attribution: 'U.S. Energy Information Administration',
    terms:
      'Public domain (photos excluded); credit "Source: U.S. Energy Information Administration".',
    termsUrl: 'https://www.eia.gov/about/copyrights_reuse.php',
  },
  {
    key: 'ecb-press',
    name: 'European Central Bank – press',
    region: 'Global',
    type: NewsSourceType.GOVERNMENT,
    url: 'https://www.ecb.europa.eu/rss/press.html',
    homepage: 'https://www.ecb.europa.eu/home/html/rss.en.html',
    usage: NewsSourceUsage.SUMMARY,
    pollMinutes: 60,
    attribution: 'European Central Bank',
    terms:
      'Free to use if reproduced accurately with the ECB cited; signed speeches and interviews need written consent.',
    termsUrl:
      'https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html',
    caution:
      'Mixes press releases with signed speeches, so it is set to summaries.',
  },
  {
    key: 'boe-news',
    name: 'Bank of England – news',
    region: 'Global',
    type: NewsSourceType.GOVERNMENT,
    url: 'https://www.bankofengland.co.uk/rss/news',
    homepage: 'https://www.bankofengland.co.uk',
    usage: NewsSourceUsage.HEADLINE_ONLY,
    pollMinutes: 60,
    attribution: 'Bank of England',
    terms:
      'Personal or internal non-commercial use only; re-use needs permission.',
    termsUrl: 'https://www.bankofengland.co.uk/legal',
  },
];
