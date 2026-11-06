import type { FactInline, FaqContent, Inline, InlineText, InlineToken } from './types';

/**
 * The /faq page's built-in content (W7 addendum §3.5): spec §9.5.4 word for
 * word, in its order, each answer with its fact ids. The ids are slugs of
 * the questions (and of the group titles), unique page-wide: the
 * <details id>, shared /faq#… links and the FAQPage JSON-LD, which is built
 * from the same content. /download's "Before you install" answers come from
 * here too (by id, without the ids). Plain data.
 */

const text = (t: string): InlineText => ({ type: 'text', text: t });
const link = (t: string, href: string): InlineText => ({
  type: 'text',
  text: t,
  marks: [{ type: 'link', attrs: { href } }],
});
const email: InlineToken = {
  type: 'token',
  attrs: { name: 'contact.email', before: null, after: null, else: null, as: 'mailto' },
};
const answer = (value: Inline, facts: FactInline['facts'] = [], fallback: Inline | null = null): FactInline => ({
  value,
  facts,
  fallback,
});
const plain = (t: string): Inline => [text(t)];

export const FAQ_DEFAULT: FaqContent = {
  seo: {
    title: 'FAQ',
    description:
      "Answers about StockVirtue: whether it's real trading, the prices on this site, what you can trade and what happens to your data.",
  },
  head: {
    title: 'Questions about StockVirtue',
    summary: 'About the app, the prices on this site and your data.',
  },
  groups: [
    {
      id: 'using-stockvirtue',
      title: 'Using StockVirtue',
      items: [
        {
          id: 'is-this-real-trading',
          question: 'Is this real trading?',
          answer: [
            answer(
              plain(
                'No. StockVirtue is a simulator. Every trade uses virtual money, and nothing you do in the app reaches an exchange or a broker. You never deposit, withdraw or lose real money.',
              ),
              ['F42'],
            ),
          ],
        },
        {
          id: 'is-it-free',
          question: 'Is it free?',
          answer: [answer(plain("Yes. The app is free to download and use, and there's nothing to deposit."), ['F22'])],
        },
        {
          id: 'do-i-need-a-demat-account-or-kyc',
          question: 'Do I need a demat account or KYC?',
          answer: [
            answer(
              plain(
                "No. No real money or shares are involved, so you don't need a demat account or KYC. We never ask for your PAN, Aadhaar or bank details.",
              ),
              ['F17'],
            ),
          ],
        },
        {
          id: 'who-can-use-it',
          question: 'Who can use it?',
          answer: [answer(plain('Anyone who is 18 or older. You confirm your age when you sign up.'), ['F16'])],
        },
        {
          id: 'where-can-i-get-it',
          question: 'Where can I get it?',
          answer: [
            answer(
              plain("On Android, from the Google Play Store. There's no iPhone version yet."),
              ['F15'],
              plain('On Android, from the Google Play Store.'),
            ),
          ],
        },
        {
          id: 'is-any-of-this-investment-advice',
          question: 'Is any of this investment advice?',
          answer: [
            answer(
              plain(
                "No. Nothing in the app or on this site is advice or a recommendation to buy or sell anything. It's a learning tool. For real investing, speak to a SEBI-registered investment adviser.",
              ),
            ),
          ],
        },
      ],
    },
    {
      id: 'prices-and-trading',
      title: 'Prices and trading',
      items: [
        {
          id: 'are-the-prices-real',
          question: 'Are the prices real?',
          answer: [
            answer(
              plain(
                "Yes. The app uses real NSE, BSE and MCX prices. While a market is open you see its prices as it trades; when it's shut, you see its last closing price.",
              ),
              ['F35'],
            ),
          ],
        },
        {
          id: 'what-can-i-trade',
          question: 'What can I trade?',
          answer: [
            answer(
              plain(
                "Shares on the NSE and BSE, index and stock futures and options, and MCX commodities such as gold, silver and crude oil. You sell only what you hold, so short selling and option writing aren't available.",
              ),
              ['F4', 'F8', 'F33'],
            ),
          ],
        },
        {
          id: 'why-cant-i-buy-a-full-mcx-lot',
          question: "Why can't I buy a full MCX lot?",
          answer: [
            answer(
              plain(
                'Many MCX lots, such as a kilo of gold, cost more than the ₹10 lakh you start with. So in the app you buy commodities by the unit, at full price and without margin, which keeps the numbers sensible for a practice account.',
              ),
              ['F7', 'F1'],
            ),
          ],
        },
        {
          id: 'does-the-app-charge-brokerage-and-taxes',
          question: 'Does the app charge brokerage and taxes?',
          answer: [
            answer(
              plain(
                "Yes. Trades are charged the way a discount broker's contract note shows them: STT, exchange and SEBI charges, stamp duty and GST, and brokerage on everything except delivery share trades. Your profit or loss is always after these costs.",
              ),
              ['F5'],
            ),
          ],
        },
        {
          id: 'can-i-place-an-order-when-the-market-is-closed',
          question: 'Can I place an order when the market is closed?',
          answer: [
            answer(
              plain(
                'Yes. It waits for the next session: a market order fills at the opening price, and a limit order fills once the price reaches it. The app knows weekends and NSE holidays.',
              ),
              ['F13'],
            ),
          ],
        },
        {
          id: 'why-does-a-price-on-this-site-say-end-of-day',
          question: 'Why does a price on this site say End of day?',
          answer: [
            answer(
              plain(
                'Either that market is closed, or our data licence lets the website show only closing prices. The time beside the price tells you which close it is.',
              ),
            ),
          ],
        },
        {
          id: 'why-do-some-prices-say-delayed',
          question: 'Why do some prices say Delayed?',
          answer: [
            answer(
              plain(
                "Under its data licence, the website may show prices a few minutes late, and the label says how late. A price also says Delayed when it hasn't updated for more than five minutes.",
              ),
            ),
          ],
        },
      ],
    },
    {
      id: 'learning-and-competing',
      title: 'Learning and competing',
      items: [
        {
          id: 'how-does-the-trading-academy-work',
          question: 'How does the Trading Academy work?',
          answer: [
            answer(
              plain(
                "There are 17 short lessons in seven modules, from market basics to F&O and trader psychology. Each lesson has quiz questions to answer as you go, and you can try what you've learnt on the market straight away.",
              ),
              ['F9'],
            ),
          ],
        },
        {
          id: 'how-are-leaderboards-ranked',
          question: 'How are leaderboards ranked?',
          answer: [
            answer(
              plain(
                'Everyone in a room or tournament is ranked by their trading returns. Referral bonuses and other credits are taken out first, so whoever is on top got there by trading.',
              ),
              ['F11'],
            ),
          ],
        },
      ],
    },
    {
      id: 'your-account-and-data',
      title: 'Your account and data',
      items: [
        {
          id: 'how-do-i-sign-in',
          question: 'How do I sign in?',
          answer: [answer(plain('With Google or your email address.'), ['F14'])],
        },
        {
          id: 'what-data-do-you-keep-and-can-i-delete-it',
          question: 'What data do you keep, and can I delete it?',
          answer: [
            answer(
              [
                text('Our '),
                link('privacy notice', '/privacy'),
                text(
                  ' lists what we collect, why and for how long. You can ask for a summary of your data, a correction or deletion from the app, or through our ',
                ),
                link('privacy requests page', '/privacy/requests'),
                text('.'),
              ],
              ['F39'],
            ),
          ],
        },
        {
          id: 'how-do-i-reach-you',
          question: 'How do I reach you?',
          answer: [
            answer([text('Use the '), link('contact form', '/contact'), text(' or email '), email, text('. We reply by email.')]),
          ],
        },
      ],
    },
  ],
  notFound: [text("Didn't find it? "), link('Write to us', '/contact')],
};
