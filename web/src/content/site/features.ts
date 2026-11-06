import type { FeaturesContent } from './types';

/**
 * The /features page's built-in content (W7 addendum §3.3): spec §9.5.2 word
 * for word, each fact-bearing slot with its fact ids. getPageContent merges
 * the published content over it; the portal and the preview use it as the
 * page's default. Plain data.
 *
 * Code, not content: the fact file's rows (FACT_FILE_ROWS), the chapter ids
 * and order, the chart, the diagrams, "What it won't do" (its own item),
 * the badge and the trademark line.
 */
export const FEATURES_DEFAULT: FeaturesContent = {
  seo: {
    title: "What's in the app",
    description:
      'A tour of the StockVirtue app: prices and charts, order types and charges, F&O and commodities, your portfolio, lessons and leaderboards.',
  },
  head: {
    title: "What's in the app",
    summary: {
      value:
        'Everything on this page is in the Android app as of version 1.4. Where the app works differently from a real broker, we say so.',
      facts: ['F41'],
      fallback:
        'Everything on this page is in the current Android app. Where the app works differently from a real broker, we say so.',
    },
  },
  factFile: {
    caption: 'The account at a glance',
    phoneSummary: 'Show the account at a glance',
  },
  chapters: [
    {
      id: 'prices',
      title: 'Prices and charts',
      tailName: 'prices and charts',
      intro: {
        value:
          'In the app, prices come from NSE, BSE and MCX as they trade, so when HDFC Bank moves on results day, it moves in the app too. When a market is shut, you see its last close.',
        facts: ['F35'],
        fallback: null,
      },
      items: [
        {
          id: 'search',
          title: 'Search',
          body: {
            value: 'Find a company by its name or NSE ticker. Old names work too, so Zomato still finds Eternal.',
            facts: ['F26', 'F18'],
            fallback: null,
          },
        },
        {
          id: 'charts',
          title: 'Charts',
          body: {
            value: 'Line or candlestick charts for shares, indices and commodities, from one day to five years.',
            facts: ['F32'],
            fallback: null,
          },
        },
        {
          id: 'watchlists',
          title: 'Watchlists',
          body: {
            value: 'Keep the companies you follow in your own lists, on the home screen.',
            facts: ['F24'],
            fallback: null,
          },
        },
      ],
      screen: null,
      screenWhat: 'A stock page with its chart',
    },
    {
      id: 'orders',
      title: 'Orders and charges',
      tailName: 'orders and charges',
      intro: {
        value:
          "Every order shows where it stands: pending, filled, cancelled or rejected. Intraday orders that haven't filled are cancelled at 3:20 pm (on MCX, shortly before the evening close), and delivery orders stay open until they fill or you cancel them.",
        facts: ['F28', 'F29', 'F30'],
        fallback: null,
      },
      items: [
        {
          id: 'market-and-limit-orders',
          title: 'Market and limit orders',
          body: {
            value:
              'A market order fills straight away at the latest price. A limit order fills only at your price or better, and waits until then.',
            facts: ['F2'],
            fallback: null,
          },
        },
        {
          id: 'stop-loss-and-stop-loss-limit',
          title: 'Stop-loss and stop-loss limit',
          body: {
            value:
              'A stop-loss sends a market order once the price crosses your trigger. A stop-loss limit sends a limit order instead, which caps the price but may not fill.',
            facts: ['F2'],
            fallback: null,
          },
        },
        {
          id: 'trailing-stop',
          title: 'Trailing stop',
          body: {
            value:
              'A stop whose trigger follows the price by the gap you set, and fires when the price turns back by that gap.',
            facts: ['F2'],
            fallback: null,
          },
        },
        {
          id: 'orders-after-hours',
          title: 'Orders after hours',
          body: {
            value:
              'Place an order when the market is shut and it waits for the next session. The app knows weekends and NSE holidays.',
            facts: ['F13'],
            fallback: null,
          },
        },
        {
          id: 'charges',
          title: 'Charges',
          body: {
            value:
              "Each trade's charges come off your balance the way a contract note lists them, so the P&L you see is after costs.",
            facts: ['F5'],
            fallback: null,
          },
        },
      ],
      screen: null,
      screenWhat: 'The order ticket',
    },
    {
      id: 'fno',
      title: 'F&O and commodities',
      tailName: 'F&O and commodities',
      intro: {
        value:
          "Index and stock futures and options trade in the exchange's lot sizes. A futures buy blocks a fixed share of the contract's value as margin, as Diagram 3 shows; a broker's margin changes with each contract and with volatility.",
        facts: ['F4', 'F6'],
        fallback: null,
      },
      items: [
        {
          id: 'futures',
          title: 'Futures',
          body: {
            value:
              'Buy a contract for a later date and sell it to close. Contracts still open at expiry are settled for you.',
            facts: ['F33', 'F34'],
            // F34's fallback drops its sentence (spec §9.3).
            fallback: 'Buy a contract for a later date and sell it to close.',
          },
        },
        {
          id: 'options',
          title: 'Options',
          body: {
            value: 'Buy calls and puts on indices and stocks from the option chain for each expiry.',
            facts: ['F4'],
            fallback: null,
          },
        },
        {
          id: 'commodities',
          title: 'Commodities',
          body: {
            value: 'Gold, silver, crude oil and other MCX contracts, bought by the unit.',
            facts: ['F8', 'F7'],
            fallback: null,
          },
        },
        {
          id: 'selling-short',
          title: 'Selling short',
          body: {
            value: "Not available. You sell only what you hold, so there's no short selling and no option writing.",
            facts: ['F33'],
            fallback: null,
          },
        },
      ],
      screen: null,
      screenWhat: 'The option chain',
    },
    {
      id: 'portfolio',
      title: 'Portfolio and P&L',
      tailName: 'portfolio and P&L',
      intro: {
        value:
          "Your holdings and open positions sit on one screen, with what you paid, what they're worth now and your profit or loss after charges.",
        facts: ['F25', 'F5'],
        fallback: null,
      },
      items: [
        {
          id: 'holdings-and-positions',
          title: 'Holdings and positions',
          body: {
            value:
              'Delivery holdings and intraday positions, valued at the latest price. Intraday positions are squared off for you before the close.',
            facts: ['F29'],
            fallback: null,
          },
        },
        {
          id: 'square-off',
          title: 'Square off',
          body: {
            value: 'One button on a position opens its closing order with the quantity filled in.',
            facts: ['F25'],
            fallback: null,
          },
        },
        {
          id: 'order-history',
          title: 'Order history',
          body: {
            value: 'Every order with its status and time, so you can see where a trade went wrong.',
            facts: ['F25', 'F28'],
            fallback: null,
          },
        },
        {
          id: 'portfolio-history',
          title: 'Portfolio history',
          body: {
            value: "Your account's value over the last month, three months or year.",
            facts: ['F36'],
            // F36's fallback drops the item (spec §9.3): a dropped body drops its title too.
            fallback: null,
          },
        },
      ],
      screen: null,
      screenWhat: 'The portfolio',
    },
    {
      id: 'learning',
      title: 'Learning and rooms',
      tailName: 'learning and rooms',
      intro: {
        value:
          'The Trading Academy and the leaderboards are in the same app as your trades, so you can try a lesson on the market the same day.',
        facts: ['F9', 'F11'],
        fallback: null,
      },
      items: [
        {
          id: 'trading-academy',
          title: 'Trading Academy',
          body: {
            value:
              'Short lessons from market basics to F&O and trader psychology, with quiz questions to answer as you go.',
            facts: ['F9'],
            fallback: null,
          },
        },
        {
          id: 'rooms-and-tournaments',
          title: 'Rooms and tournaments',
          body: {
            value:
              'Make a private room for friends or join a public tournament. Referral bonuses and other credits are taken out before anyone is ranked.',
            facts: ['F11'],
            fallback: null,
          },
        },
        {
          id: 'glossary',
          title: 'Glossary',
          body: {
            value: "Plain meanings for the terms you'll meet, from stop-loss limit to theta.",
            facts: ['F31'],
            fallback: null,
          },
        },
        {
          id: 'badges',
          title: 'Badges',
          body: {
            value: 'For trading milestones, and for finishing lessons and quizzes.',
            facts: ['F10'],
            fallback: null,
          },
        },
      ],
      screen: null,
      screenWhat: 'A room leaderboard',
    },
    {
      id: 'account',
      title: 'Your account',
      tailName: 'your account',
      intro: {
        value: "You sign in with Google or your email address, and your balance is there as soon as you're in.",
        facts: ['F14', 'F1'],
        fallback: null,
      },
      items: [
        {
          id: 'who-its-for',
          title: "Who it's for",
          body: {
            value: 'Anyone who is 18 or older. You confirm your age when you sign up.',
            facts: ['F16'],
            fallback: null,
          },
        },
        {
          id: 'notifications',
          title: 'Notifications',
          body: {
            value:
              'Order updates and price alerts you set, plus a reminder at 3:10 pm when you hold intraday or F&O positions.',
            facts: ['F19', 'F37'],
            // F19's fallback (spec §9.3).
            fallback: 'Order and price notifications.',
          },
        },
        {
          id: 'your-data',
          title: 'Your data',
          body: {
            value:
              'We never ask for your PAN, Aadhaar or bank details. From the app or our privacy requests page, you can ask for a summary of your data, a correction or deletion.',
            facts: ['F17', 'F39'],
            fallback: null,
          },
        },
      ],
      screen: null,
      screenWhat: 'Sign-in',
    },
  ],
  close: { faqLinkLabel: 'Questions first? Read the FAQ' },
};
