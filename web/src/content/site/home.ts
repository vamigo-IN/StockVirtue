import type { HomeContent } from './types';

/**
 * The home page's built-in content (W7 addendum §3.2, §11.3): spec §9.5.1
 * word for word. It is what `/` shows until an editor publishes the `home`
 * item, and what the merge falls back to field by field (§3.11).
 *
 * - Every key of HomeContent is here, the optional ones too (`null` for an
 *   absent screen), so an editor can publish each of them.
 * - Fact fields carry their fact ids as data (F1–F42, src/content/app.ts);
 *   `fallback: null` drops the element while a fact isn't confirmed.
 * - Screens are `null`: the view falls back to SCREENS (src/content/screens.ts),
 *   and with neither it shows the text-only layouts (owner decision 6).
 * - Not here (code, addendum §3.2): the readout, figure, slider, IndexRail and
 *   poster strings; module titles and microcopy; the module list
 *   (ACADEMY_MODULES); the "How to read a price" rows and licence sentences;
 *   the badge, trademark line and QR caption; "Get the app"; the screen
 *   caption templates; and "What it won't do" (the shared `wont-do` item).
 *
 * Plain data (types only), so the portal and the preview route can import it.
 */
export const HOME_DEFAULT: HomeContent = {
  hero: {
    title: 'India’s stock market, without the risk.',
    lead: {
      value:
        'StockVirtue is a stock market simulator for India. You get ₹10 lakh of virtual money to trade at real NSE, BSE and MCX prices, with the order types and charges a broker uses.',
      facts: ['F1', 'F35', 'F2', 'F5'],
      fallback: null,
    },
    howLink: 'See how it works',
    smallPrint: {
      value: 'Free on Android. We never ask for your PAN, Aadhaar or bank details.',
      facts: ['F22', 'F17'],
      fallback: null,
    },
    eyebrow: 'Stock market simulator · India',
  },
  facts: {
    cards: [
      {
        id: 'money',
        figure: { value: '₹10 lakh', facts: ['F1'], fallback: null },
        title: 'Virtual money',
        body: { value: 'What you start with. Every rupee of it is virtual.', facts: ['F1'], fallback: null },
      },
      {
        id: 'stamped',
        figure: { value: 'NSE · BSE · MCX', facts: ['F35'], fallback: null },
        title: 'Real prices',
        body: {
          value: 'Every price on this site says how fresh it is: live, delayed or end of day.',
          facts: [],
          fallback: null,
        },
      },
      {
        id: 'lessons',
        figure: { value: '17 lessons', facts: ['F9'], fallback: null },
        title: 'In 7 modules',
        body: { value: 'Short lessons with quizzes, and 20 badges to earn.', facts: ['F9', 'F10'], fallback: null },
      },
      {
        id: 'no-risk',
        figure: { value: '₹0', facts: ['F42'], fallback: null },
        title: 'Real money',
        body: { value: 'Nothing you do reaches an exchange or a broker.', facts: ['F42'], fallback: null },
      },
    ],
  },
  market: {
    label: 'Market overview',
    title: 'Where the market stands',
    titleGateOff: 'What the newsroom is covering',
    newsTitle: 'From the newsroom',
    newsLabel: 'Newsroom',
    newsLink: 'Read the news',
    lead: 'Indices, commodities, the rupee and the sectors that moved, laid out the way a trading desk shows them.',
    allLink: 'All markets',
  },
  heatmap: {
    label: 'Heatmap',
    title: 'Nifty 50 heatmap',
    lead: 'Each tile is a stock in the index, coloured by how far it moved on the day. The brightest tiles moved the most.',
  },
  trade: {
    label: 'What you can trade',
    title: 'Three markets to practise in',
    lead: {
      value: 'Equity, futures and options, and MCX commodities, all with virtual money at real prices.',
      facts: ['F1', 'F4', 'F8', 'F35'],
      fallback: null,
    },
    cards: [
      {
        id: 'equity',
        title: 'Equity',
        body: {
          value: 'Shares on NSE and BSE. Trade for the day with intraday, or buy and hold with delivery.',
          facts: ['F3'],
          fallback: null,
        },
      },
      {
        id: 'derivatives',
        title: 'Futures and options',
        body: {
          value: 'Index and stock futures and options in the exchange’s lot sizes, with an option chain for each expiry.',
          facts: ['F4'],
          fallback: null,
        },
      },
      {
        id: 'commodities',
        title: 'MCX commodities',
        body: {
          value: 'Gold, silver, crude oil and more, bought by the unit at full value, without margin.',
          facts: ['F8', 'F7'],
          fallback: null,
        },
      },
    ],
  },
  features: {
    label: 'The app',
    title: 'The tools of a real trading app, with virtual money',
    items: [
      {
        id: 'live-data',
        title: 'Live market data',
        body: {
          value: 'In the app, prices are live from the exchanges’ feed while a market is open, and a shut market shows its last close.',
          facts: ['F35'],
          fallback: null,
        },
      },
      {
        id: 'order-types',
        title: 'Every order type',
        body: {
          value: 'Market, limit, stop-loss, stop-loss limit and trailing stop orders, for intraday or delivery.',
          facts: ['F2', 'F3'],
          fallback: null,
        },
      },
      {
        id: 'charges',
        title: 'P&L after charges',
        body: {
          value: 'STT, exchange and SEBI charges, stamp duty and GST come off, as a broker’s contract note lists them.',
          facts: ['F5'],
          fallback: null,
        },
      },
      {
        id: 'fno-mcx',
        title: 'F&O and commodities',
        body: {
          value: 'Futures and options in the exchange’s lot sizes, and MCX gold, silver and crude oil by the unit.',
          facts: ['F4', 'F8', 'F7'],
          fallback: null,
        },
      },
      {
        id: 'academy',
        title: 'Trading Academy',
        body: {
          value: 'Seventeen short lessons in seven modules, with quiz questions to answer as you go.',
          facts: ['F9'],
          fallback: null,
        },
      },
      {
        id: 'rooms',
        title: 'Rooms and leaderboards',
        body: {
          value: 'Private rooms for friends and public tournaments, ranked on trading alone.',
          facts: ['F11'],
          fallback: null,
        },
      },
    ],
  },
  stage: {
    label: 'How a trade works',
    title: 'One practice trade, from search to the P&L after charges.',
    steps: [
      {
        id: 'search',
        label: 'Search for HDFC Bank',
        body: {
          value:
            'Say you expect HDFC Bank to do well after its results. Type “HDFC” and pick it from the list. Search knows old names too, so Zomato still finds Eternal.',
          facts: ['F26', 'F18'],
          fallback: null,
        },
        screen: null,
        callouts: [],
      },
      {
        id: 'order',
        label: 'Place a limit order',
        body: {
          value:
            'Pick market, limit or stop-loss. A limit order for 20 shares, a little under the price, fills only if the price comes down to it. If it hasn’t by 3:20 pm, an intraday order is cancelled; a delivery order waits for the next session.',
          facts: ['F2', 'F29', 'F30'],
          fallback: null,
        },
        screen: null,
        callouts: [],
      },
      {
        id: 'pnl',
        label: 'Check the P&L after charges',
        body: {
          value:
            'The charges a contract note would list come off your balance: STT, exchange and SEBI charges, stamp duty and GST, plus brokerage on intraday trades. The profit or loss you see is after all of them.',
          facts: ['F5'],
          fallback: null,
        },
        screen: null,
        callouts: [],
      },
    ],
  },
  ipos: {
    label: 'IPO calendar',
    title: 'IPO watch',
    lead: 'Issues open now and the ones that open next, with their price bands and dates.',
  },
  learning: {
    label: 'Trading Academy',
    title: {
      value: 'Seventeen short lessons, and a market to try them on.',
      facts: ['F9'],
      fallback: null,
    },
    paragraphs: [
      {
        value:
          'The Trading Academy in the app has seven modules, from reading a candlestick chart to futures and options, with quiz questions to answer as you go.',
        facts: ['F9'],
        fallback: null,
      },
      {
        value:
          "Many lessons are built around real Indian companies. When you finish the one on order types, the next stop-loss you set is in the same app, on the same prices. Four of the app's 20 badges are for lessons and quizzes.",
        facts: ['F27', 'F9', 'F10'],
        fallback: null,
      },
    ],
    board: {
      label: 'Rooms and leaderboards',
      title: 'Leaderboards that only count trading.',
      body: {
        value:
          'Make a private room for friends or join a public tournament. Referral bonuses and other credits are taken out before anyone is ranked, so whoever is on top got there by trading.',
        facts: ['F11'],
        fallback: null,
      },
      phoneBody: {
        value:
          'Referral bonuses and other credits are taken out before anyone in a room or tournament is ranked.',
        facts: ['F11'],
        fallback: null,
      },
      linkLabel: 'How rooms work',
    },
    lessonScreen: null,
  },
  answers: {
    pricesTitle: 'How to read a price on this site',
    label: 'FAQ',
    title: 'Questions, answered',
    items: [
      {
        id: 'is-this-real-trading',
        question: 'Is this real trading?',
        answer: {
          value:
            'No. StockVirtue is a simulator. Every trade uses virtual money, and nothing you do in the app reaches an exchange or a broker. You never deposit, withdraw or lose real money.',
          facts: ['F42'],
          fallback: null,
        },
      },
      {
        id: 'is-it-free',
        question: 'Is it free?',
        answer: {
          value: 'Yes. The app is free to download and use, and there’s nothing to deposit.',
          facts: ['F22'],
          fallback: null,
        },
      },
      {
        id: 'are-the-prices-real',
        question: 'Are the prices real?',
        answer: {
          value:
            'Yes. The app uses real NSE, BSE and MCX prices. While a market is open you see its prices as it trades; when it’s shut, you see its last closing price.',
          facts: ['F35'],
          fallback: null,
        },
      },
      {
        id: 'what-can-i-trade',
        question: 'What can I trade?',
        answer: {
          value:
            'Shares on the NSE and BSE, index and stock futures and options, and MCX commodities such as gold, silver and crude oil. You sell only what you hold, so short selling and option writing aren’t available.',
          facts: ['F4', 'F8', 'F33'],
          fallback: null,
        },
      },
      {
        id: 'do-i-need-a-demat-account',
        question: 'Do I need a demat account or KYC?',
        answer: {
          value:
            'No. No real money or shares are involved, so you don’t need a demat account or KYC. We never ask for your PAN, Aadhaar or bank details.',
          facts: ['F17'],
          fallback: null,
        },
      },
    ],
  },
  finalCta: {
    title: {
      value: 'Start with ₹10 lakh on your Android phone.',
      facts: ['F1'],
      fallback: null,
    },
    line: {
      value: 'It’s free, and you sign in with Google or your email address.',
      facts: ['F22', 'F14'],
      fallback: null,
    },
  },
  gateOff: { homeScreen: null },
};
