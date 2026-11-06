import type { AboutContent, Inline, InlineText } from './types';

/**
 * The /about page's built-in content (W7 addendum §3.4): spec §9.5.3 word for
 * word, each fact-bearing slot with its fact ids. getPageContent merges the
 * published content over it. Plain data.
 *
 * Code, not content: the section ids (ABOUT_SECTION_IDS), the fact file's
 * Company, Email, Grievance officer and Postal address rows (from Settings).
 * The founder letter and the timeline are owner inputs: absent until
 * supplied, and never ghost-written.
 */

/**
 * SEBI's page for "Study - Analysis of Profit and Loss of Individual Traders
 * dealing in Equity F&O Segment" (25 January 2023): 89% of individual equity
 * F&O traders lost money in FY22, "9 out of 10" in the study's own words.
 * Checked on 5 Nov 2026: 200, title as above (linked from SEBI's Reports and
 * statistics, Research listing). The only external link on About.
 */
export const SEBI_STUDY_URL =
  'https://www.sebi.gov.in/reports-and-statistics/research/jan-2023/study-analysis-of-profit-and-loss-of-individual-traders-dealing-in-equity-fando-segment_67525.html';

/**
 * About's section ids, the index's anchors: code, not content (addendum
 * §1.2), so an edited title never breaks a link. Reserved site-wide for
 * content ids from M7.2b (addendum §3.1).
 */
export const ABOUT_SECTION_IDS = {
  why: 'why-it-exists',
  principles: 'how-we-work',
  notUs: 'what-were-not',
  company: 'the-company',
  writeToUs: 'write-to-us',
} as const;

const text = (t: string): InlineText => ({ type: 'text', text: t });
const link = (t: string, href: string): InlineText => ({
  type: 'text',
  text: t,
  marks: [{ type: 'link', attrs: { href } }],
});
const plain = (t: string): Inline => [text(t)];

export const ABOUT_DEFAULT: AboutContent = {
  seo: {
    title: 'About StockVirtue',
    description:
      'StockVirtue is a stock market simulator and a market newsroom, made in India by Vamigo Media (OPC) Pvt. Ltd.',
  },
  head: {
    title: 'About StockVirtue',
    summary: 'A stock market simulator and a market newsroom, made in India by Vamigo Media (OPC) Pvt. Ltd.',
  },
  why: {
    title: 'Why it exists',
    paragraphs: [
      {
        value: [
          text('In January 2023, SEBI published '),
          link('a study of individual traders in equity futures and options', SEBI_STUDY_URL),
          text('. Nine in ten of them lost money in the 2021–22 financial year.'),
        ],
        facts: [],
        fallback: null,
      },
      {
        value: plain(
          'We built StockVirtue so you can make those first mistakes with virtual money. The app gives you ₹10 lakh of it at real market prices, and charges the brokerage and taxes a real trade would. The newsroom on this site explains what moved the market, in plain English, for people who are new to it.',
        ),
        facts: ['F1', 'F35', 'F5'],
        fallback: null,
      },
    ],
  },
  founder: null,
  principles: {
    title: 'How we work',
    items: [
      {
        id: 'we-name-our-sources',
        title: { value: 'We name our sources.', facts: [], fallback: null },
        body: { value: plain('Every story lists where its facts came from, by name.'), facts: [], fallback: null },
      },
      {
        id: 'we-say-when-ai-helped',
        title: { value: 'We say when AI helped.', facts: [], fallback: null },
        body: {
          value: plain(
            'When AI tools helped prepare a story, the story says so, and an editor approved it before it went out.',
          ),
          facts: [],
          fallback: null,
        },
      },
      {
        id: 'we-give-exact-times',
        title: { value: 'We give exact times, in IST.', facts: [], fallback: null },
        body: {
          value: plain(
            'We write the date and the time, "4 Nov, 9:12 am IST", because a page can be read hours after it was made.',
          ),
          facts: [],
          fallback: null,
        },
      },
      {
        id: 'we-label-every-price',
        title: { value: 'We label every price.', facts: [], fallback: null },
        body: {
          value: plain(
            "Every price on this site says whether it's live, delayed or end of day, with the time it's from and where it came from.",
          ),
          facts: [],
          fallback: null,
        },
      },
      {
        // The fifth principle is "Corrections" (spec §5.3; B15). F40 is "B2":
        // until the public API returns correction notes, the fallback shows.
        id: 'we-date-our-corrections',
        title: { value: 'We date our corrections.', facts: ['F40'], fallback: 'We fix mistakes.' },
        body: {
          value: plain(
            'When a story gets something wrong, we fix it and add a dated note under the byline. To report a mistake, use the contact form.',
          ),
          facts: ['F40'],
          fallback: plain(
            "To report one in a story, use the contact form and paste the story's link, and an editor will look at it.",
          ),
        },
      },
    ],
  },
  notUs: {
    title: "What we're not",
    // Legal-locked and verbatim (the existing legal text, spec §9.8).
    body: [
      text('StockVirtue is an educational simulator. It is '),
      { type: 'text', text: 'not a broker', marks: [{ type: 'bold' }] },
      text(
        ', is not registered with SEBI, and does not facilitate real securities transactions or provide investment advice. See our ',
      ),
      link('Risk Disclaimer', '/disclaimer'),
      text(' for details.'),
    ],
  },
  company: {
    caption: 'The company',
    product: 'StockVirtue, an Android app and stockvirtue.com',
    basedIn: '',
  },
  timeline: [],
  writeToUs: {
    title: 'Write to us',
    text: [text('For questions about the app, a story or your data, '), link('write to us', '/contact'), text('.')],
  },
};
