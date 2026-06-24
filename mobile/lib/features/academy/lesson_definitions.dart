import 'package:flutter/material.dart';

/// A single page inside a lesson. Three shapes:
///   * [LessonNote]   — concept paragraph the user reads
///   * [LessonExample] — labelled visual / chart-style mock-up
///   * [LessonQuiz]   — multiple-choice question; must be answered to advance
sealed class LessonCard {
  const LessonCard();
}

class LessonNote extends LessonCard {
  final String heading;
  final String body;
  const LessonNote({required this.heading, required this.body});
}

class LessonExample extends LessonCard {
  final String heading;
  final String body;
  final IconData icon;
  final Color tint;
  const LessonExample({
    required this.heading,
    required this.body,
    required this.icon,
    required this.tint,
  });
}

class LessonQuiz extends LessonCard {
  final String question;
  final List<String> options;
  final int correctIndex;
  final String explanation;
  const LessonQuiz({
    required this.question,
    required this.options,
    required this.correctIndex,
    required this.explanation,
  });
}

class Lesson {
  final String id;
  final String title;
  final String blurb;
  final IconData icon;
  final Color tint;
  final List<LessonCard> cards;
  const Lesson({
    required this.id,
    required this.title,
    required this.blurb,
    required this.icon,
    required this.tint,
    required this.cards,
  });

  Duration get estimatedTime {
    // ~30 s per card is a comfortable read+answer cadence.
    return Duration(seconds: 30 * cards.length);
  }
}

class LessonModule {
  final String id;
  final String title;
  final String blurb;
  final List<Lesson> lessons;
  const LessonModule({
    required this.id,
    required this.title,
    required this.blurb,
    required this.lessons,
  });
}

/// Curated curriculum. Lessons stay short (5–7 cards) so a session feels
/// like one Duolingo unit, not a textbook chapter. New material lands here
/// as a new Lesson — no need to touch the screens.
const academyModules = <LessonModule>[
  _foundationsModule,
  _sectorsModule,
  LessonModule(
    id: 'patterns',
    title: 'Reading the chart',
    blurb: 'What price action and patterns actually tell you.',
    lessons: [
      Lesson(
        id: 'candles',
        title: 'Candlestick basics',
        blurb: 'The four numbers behind every candle and what they signal.',
        icon: Icons.candlestick_chart,
        tint: Color(0xFF22C55E),
        cards: [
          LessonNote(
            heading: 'What is a candlestick?',
            body:
                'A candle compresses a time slice (1 min, 1 day, etc.) into '
                'four numbers — open, high, low, close. The body shows where '
                'the price opened and closed; the wicks show the range it '
                'travelled within that slice.',
          ),
          LessonExample(
            heading: 'Green vs red',
            body:
                'Green (bullish): close higher than open — buyers won the '
                'slice. Red (bearish): close lower than open — sellers won. '
                'Long body = strong conviction. Long wick = rejection of '
                'that extreme.',
            icon: Icons.swap_vert,
            tint: Color(0xFF22C55E),
          ),
          LessonNote(
            heading: 'Doji',
            body:
                'Open ≈ close, so the body is a thin line. Indicates '
                'indecision — buyers and sellers fought to a draw. Often '
                'precedes a trend change when it appears at a key level.',
          ),
          LessonExample(
            heading: 'Hammer / hanging man',
            body:
                'Tiny body at the top, long lower wick (twice the body or '
                'more). Buyers rejected a lower price. Bullish at the bottom '
                'of a downtrend (hammer); bearish at the top of an uptrend '
                '(hanging man) — same shape, opposite meaning depending on '
                'context.',
            icon: Icons.gavel,
            tint: Color(0xFFF59E0B),
          ),
          LessonQuiz(
            question:
                'A daily candle has open ₹100, high ₹105, low ₹92, close ₹103. '
                'What colour is it and what is the lower wick length?',
            options: [
              'Red, 8 rupees',
              'Green, 8 rupees',
              'Green, 2 rupees',
              'Red, 2 rupees',
            ],
            correctIndex: 1,
            explanation:
                'Close > open → green. Lower wick = open − low = 100 − 92 = 8.',
          ),
          LessonQuiz(
            question: 'A doji forming at the top of a long uptrend most often '
                'signals what?',
            options: [
              'Continuation of the uptrend',
              'A trend reversal or consolidation',
              'Higher volume tomorrow',
              'Nothing — dojis are noise',
            ],
            correctIndex: 1,
            explanation:
                'A doji is indecision. At an extreme, it warns the trend may '
                'be losing steam.',
          ),
        ],
      ),
      Lesson(
        id: 'sr',
        title: 'Support & resistance',
        blurb: 'The price levels the market keeps reacting to.',
        icon: Icons.horizontal_split,
        tint: Color(0xFF06B6D4),
        cards: [
          LessonNote(
            heading: 'Support',
            body:
                'A price level the market struggles to break below. Buyers '
                'show up there. The more times price has bounced off it, '
                'the stronger the level — until it breaks.',
          ),
          LessonNote(
            heading: 'Resistance',
            body:
                'The mirror image. A price level the market struggles to '
                'break above. Sellers show up there. Watch volume on the '
                'break — high volume = real breakout, low volume = fake-out.',
          ),
          LessonExample(
            heading: 'Role reversal',
            body:
                'When support breaks, it often becomes resistance on retest '
                '(and vice versa). The level itself matters — its role '
                'flips depending on which side price is on.',
            icon: Icons.compare_arrows,
            tint: Color(0xFF8B5CF6),
          ),
          LessonNote(
            heading: 'How to draw them',
            body:
                'Look at higher time frames first (daily, weekly). Mark '
                'horizontal levels where price has reversed multiple times. '
                'Round numbers (₹100, ₹500, ₹1000) tend to act as '
                'psychological levels even without a prior reaction.',
          ),
          LessonQuiz(
            question:
                'Spot showed strong support at ₹450 four times. Today it '
                'closes at ₹442 on heavy volume. The most likely next move is:',
            options: [
              'Bounce immediately back above ₹450',
              'Test ₹450 from below as new resistance',
              'Resume the uptrend with no change in behaviour',
              'Climb above ₹500 by tomorrow',
            ],
            correctIndex: 1,
            explanation:
                'Broken support becomes resistance. Price often retests it '
                'before committing to the new direction.',
          ),
        ],
      ),
    ],
  ),
  LessonModule(
    id: 'indicators',
    title: 'Indicators',
    blurb: 'Math on top of price — when and how to use it.',
    lessons: [
      Lesson(
        id: 'rsi',
        title: 'RSI',
        blurb: 'The relative-strength index, used right.',
        icon: Icons.speed,
        tint: Color(0xFFEC4899),
        cards: [
          LessonNote(
            heading: 'What is RSI?',
            body:
                'Relative Strength Index. Plots a value between 0 and 100 '
                'measuring momentum — specifically, the ratio of average '
                'gains to average losses over a window (default 14 periods).',
          ),
          LessonNote(
            heading: 'Overbought & oversold',
            body:
                'Convention: RSI > 70 = overbought, RSI < 30 = oversold. '
                'These are NOT sell / buy signals on their own — strong '
                'trends can stay overbought / oversold for weeks.',
          ),
          LessonExample(
            heading: 'Divergence',
            body:
                'When price makes a higher high but RSI makes a lower high '
                '(bearish divergence), momentum is fading even though the '
                'trend is still up. The opposite for bullish divergence. '
                'Divergences usually precede reversals.',
            icon: Icons.call_split,
            tint: Color(0xFFEC4899),
          ),
          LessonQuiz(
            question:
                'A stock has been in a strong uptrend for two months. Today '
                'RSI = 78. What is the best read?',
            options: [
              'Short immediately — overbought',
              'Momentum is strong; the trend may continue, but watch for '
                  'divergence before fading',
              'RSI is irrelevant in trends',
              'Buy more — overbought always means another leg up',
            ],
            correctIndex: 1,
            explanation:
                'Overbought ≠ sell. In a strong trend RSI can stay > 70 for '
                'a long time; combine with divergence or price structure.',
          ),
        ],
      ),
      Lesson(
        id: 'macd',
        title: 'MACD',
        blurb: 'Moving-average convergence/divergence — momentum + trend.',
        icon: Icons.show_chart,
        tint: Color(0xFFF59E0B),
        cards: [
          LessonNote(
            heading: 'The three numbers',
            body:
                'MACD = 12-EMA − 26-EMA (the line). Signal = 9-EMA of MACD. '
                'Histogram = MACD − Signal. The histogram shows momentum '
                'visually as bars; positive = uptrend momentum.',
          ),
          LessonExample(
            heading: 'Crossover signals',
            body:
                'Bullish crossover: MACD crosses above Signal → momentum is '
                'shifting up. Bearish crossover: MACD crosses below Signal. '
                'Most useful on higher time frames; intraday produces lots '
                'of noisy crossovers.',
            icon: Icons.timeline,
            tint: Color(0xFFF59E0B),
          ),
          LessonNote(
            heading: 'Zero-line context',
            body:
                'Above zero = the two EMAs say uptrend. Below zero = downtrend. '
                'A bullish crossover above zero is a higher-quality signal '
                'than the same crossover deep below zero.',
          ),
          LessonQuiz(
            question:
                'MACD line crosses above the Signal line, and both are '
                'comfortably above the zero line. This typically suggests:',
            options: [
              'Confirmed downtrend',
              'Reversal of an existing downtrend',
              'Strengthening of an existing uptrend',
              'Nothing — MACD is unreliable',
            ],
            correctIndex: 2,
            explanation:
                'Bullish crossover above zero = the trend is up AND momentum '
                'is accelerating. High-quality continuation signal.',
          ),
        ],
      ),
    ],
  ),
  _ordersModule,
  _derivativesModule,
  LessonModule(
    id: 'psychology',
    title: 'Trader psychology',
    blurb: 'The part nobody teaches that decides who survives.',
    lessons: [
      Lesson(
        id: 'mindset',
        title: 'Mind games',
        blurb: 'Recognize the four biases that bleed paper-traders dry.',
        icon: Icons.psychology_outlined,
        tint: Color(0xFF8B5CF6),
        cards: [
          LessonNote(
            heading: 'Loss aversion',
            body:
                'Losses feel ~2× as bad as equivalent gains feel good. So '
                'traders hold losers ("it\'ll come back") and snap profits '
                'too early. Net effect: small wins, big losses. Counter it '
                'by pre-defining your stop *before* entering.',
          ),
          LessonNote(
            heading: 'Confirmation bias',
            body:
                'After you take a position you start reading every chart, '
                'tweet, and headline as confirming your view. The fix is '
                'to write down what would prove you wrong before you enter '
                '— and respect it when it happens.',
          ),
          LessonNote(
            heading: 'Recency bias',
            body:
                'You overweight what just happened. Three wins in a row '
                'and you size up. Three losses and you freeze. Position '
                'sizing should depend on your *system\'s* historical '
                'performance, not last week\'s outcomes.',
          ),
          LessonNote(
            heading: 'Revenge trading',
            body:
                'After a loss the impulse is to immediately "make it back". '
                'This is when the worst trades get placed — off-system, '
                'oversized, no stop. Walk away from the screen for an hour '
                'after a losing day.',
          ),
          LessonQuiz(
            question:
                'You took a loss this morning and immediately doubled your '
                'next position size to "win it back". Which bias is this?',
            options: [
              'Confirmation bias',
              'Revenge trading driven by loss aversion',
              'Recency bias',
              'Survivorship bias',
            ],
            correctIndex: 1,
            explanation:
                'Classic revenge trading. The emotional pain of the loss '
                'overrides your system\'s position sizing — the most '
                'reliable way amateurs blow up.',
          ),
        ],
      ),
    ],
  ),
];

// GENERATED from the academy-content-authoring workflow. Lessons are
// anchored on real Indian companies; numbers are illustrative, not advice.
// Edit the workflow + re-run scripts/gen-lessons.js to regenerate.

const _foundationsModule = LessonModule(
  id: 'foundations',
  title: 'Market foundations',
  blurb: 'How the market actually works — start here.',
  lessons: [
      Lesson(
        id: 'what_is_stock',
        title: 'What is a stock?',
        blurb: 'Ownership, listing, and what moves a price.',
        icon: Icons.account_balance_outlined,
        tint: Color(0xFF22C55E),
        cards: [
        LessonNote(
          heading: 'A share = ownership',
          body: 'A stock (or share) is a small piece of ownership in a company. If a company has issued 100 crore shares and you own 100 of them, you own a tiny slice of the whole business. As an owner, you benefit when the company grows in value and may receive dividends if it shares profits.',
        ),
        LessonNote(
          heading: 'Why companies list',
          body: 'Companies sell shares to the public to raise money for growth — building factories, hiring, or paying off debt. Once listed on an exchange, those shares can be freely bought and sold by investors. In return, the company gives up part-ownership and must report results publicly.',
        ),
        LessonNote(
          heading: 'What moves a price',
          body: 'A share price moves with demand and supply: more buyers than sellers pushes it up, and the reverse pulls it down. Over time, earnings (profits), business news, and the broader economy shape what buyers are willing to pay. There is no single \'correct\' price — it is whatever buyers and sellers agree on right now.',
        ),
        LessonExample(
          heading: 'RELIANCE: one company, many businesses',
          body: 'Reliance Industries is India\'s largest company by market value. It spans energy (oil and petrochemicals), the Jio telecom network, and a large retail arm. Owning even one RELIANCE share makes you a part-owner of all of those businesses at once.',
          icon: Icons.insights,
          tint: Color(0xFF22C55E),
        ),
        LessonExample(
          heading: 'TCS: shareholders vs traders',
          body: 'Tata Consultancy Services is India\'s largest IT-services exporter. A long-term shareholder might hold TCS for years, collecting dividends and betting on steady growth. A trader might buy and sell the same stock within days, trying to profit from short-term price swings — same share, very different time horizons.',
          icon: Icons.insights,
          tint: Color(0xFF22C55E),
        ),
        LessonQuiz(
          question: 'When you buy a share of a company, what do you actually own?',
          options: [
            'A loan the company must repay you with interest',
            'A small piece of ownership in the company',
            'A guarantee that the price will rise',
            'A fixed monthly income from the company',
          ],
          correctIndex: 1,
          explanation: 'A share represents part-ownership of the business — not a loan, not a price guarantee, and not a fixed income.',
        ),
        LessonQuiz(
          question: 'In the short term, what most directly sets a stock\'s price on the exchange?',
          options: [
            'The company\'s CEO announcing a target price',
            'A government-fixed rate for each stock',
            'The balance of buyers and sellers (demand and supply)',
            'The number of employees the company has',
          ],
          correctIndex: 2,
          explanation: 'Prices are set by what buyers and sellers agree to trade at — i.e. demand and supply. Earnings and news matter because they change that demand and supply.',
        ),
        ],
      ),
      Lesson(
        id: 'exchanges_indices',
        title: 'Exchanges & indices',
        blurb: 'NSE, BSE, NIFTY, SENSEX & Bank Nifty.',
        icon: Icons.account_tree_outlined,
        tint: Color(0xFF06B6D4),
        cards: [
        LessonNote(
          heading: 'Two main exchanges',
          body: 'In India, most shares trade on two exchanges: the National Stock Exchange (NSE) and the Bombay Stock Exchange (BSE). An exchange is simply the regulated marketplace that matches buyers and sellers. Many companies are listed on both, so you can often buy the same stock on either one.',
        ),
        LessonNote(
          heading: 'What an index is',
          body: 'An index is a single number that tracks a basket of stocks, not one company. It is a quick gauge of how a chunk of the market is doing overall. When people say \'the market was up today,\' they usually mean an index like NIFTY or SENSEX moved up.',
        ),
        LessonNote(
          heading: 'The headline indices',
          body: 'NIFTY 50 tracks 50 large companies on the NSE, while the SENSEX tracks 30 large companies on the BSE. BANK NIFTY is a narrower index that tracks only major banking stocks. Each one summarises its basket — if the basket rises on average, the index rises.',
        ),
        LessonExample(
          heading: 'Inside the NIFTY 50',
          body: 'The NIFTY 50 includes heavyweights such as RELIANCE, HDFC Bank, Infosys (INFY), and TCS, among others. If most of these large companies have a good day, the NIFTY tends to go up — even if a few smaller members fall. One company alone rarely decides the whole index.',
          icon: Icons.insights,
          tint: Color(0xFF06B6D4),
        ),
        LessonExample(
          heading: 'Inside BANK NIFTY',
          body: 'BANK NIFTY focuses purely on banking, including names like HDFC Bank, ICICI Bank, State Bank of India (SBIN), and Axis Bank. So BANK NIFTY can rise on a strong day for banks even if, say, IT or energy stocks are weak. It tells you how the banking sector is doing, not the whole market.',
          icon: Icons.insights,
          tint: Color(0xFF06B6D4),
        ),
        LessonQuiz(
          question: 'What does an index like the NIFTY 50 actually measure?',
          options: [
            'The price of a single chosen stock',
            'The combined movement of a basket of stocks',
            'The total money held by the NSE',
            'The interest rate set by the RBI',
          ],
          correctIndex: 1,
          explanation: 'An index tracks a basket of stocks and summarises their combined movement — it is not the price of any one company.',
        ),
        LessonQuiz(
          question: 'Which statement is correct about the SENSEX and NIFTY 50?',
          options: [
            'SENSEX tracks 30 BSE companies; NIFTY 50 tracks 50 NSE companies',
            'Both track exactly the same 50 companies',
            'SENSEX is a single stock; NIFTY 50 is an exchange',
            'NIFTY 50 tracks only banking stocks',
          ],
          correctIndex: 0,
          explanation: 'The SENSEX is the 30-stock BSE index and the NIFTY 50 is the 50-stock NSE index. BANK NIFTY is the banking-only index.',
        ),
        ],
      ),
      Lesson(
        id: 'market_cap',
        title: 'Market cap tiers',
        blurb: 'Large, mid & small-cap — and why size means risk.',
        icon: Icons.straighten,
        tint: Color(0xFF6366F1),
        cards: [
        LessonNote(
          heading: 'What market cap means',
          body: 'Market capitalisation (\'market cap\') is the total value the market places on a company. The formula is simple: share price × total number of shares. A ₹2,500 share with 100 crore shares gives a market cap of ₹2,50,000 crore — it measures the whole company\'s size, not just one share\'s price.',
        ),
        LessonNote(
          heading: 'The three tiers',
          body: 'Companies are grouped by size into large-cap, mid-cap, and small-cap. Large-caps are the biggest, most established firms; mid-caps are medium-sized and often still growing; small-caps are the smallest and least proven. The tier is about company size, not whether the stock is \'good\' or \'bad\'.',
        ),
        LessonNote(
          heading: 'Why cap matters for risk',
          body: 'Large-caps tend to be more stable and easier to buy and sell, but may grow more slowly. Small-caps can grow fast but are more volatile and riskier — prices can swing sharply. Mid-caps sit in between. Knowing the tier helps you set expectations for both reward and risk.',
        ),
        LessonExample(
          heading: 'Large-cap heavyweights',
          body: 'Large-caps include India\'s biggest names such as RELIANCE, TCS, HDFC Bank, Infosys (INFY), and ICICI Bank. These are widely held, heavily traded companies that also feature in major indices like the NIFTY 50. Their size usually means steadier (though never guaranteed) price behaviour than tiny companies.',
          icon: Icons.insights,
          tint: Color(0xFF6366F1),
        ),
        LessonExample(
          heading: 'Illustrating the formula',
          body: 'Suppose a company\'s shares trade at ₹500 and it has 20 crore shares outstanding. Its market cap is ₹500 × 20 crore = ₹10,000 crore. If the price doubles to ₹1,000 with the same share count, the market cap doubles to ₹20,000 crore — note these are illustrative numbers, not real quotes.',
          icon: Icons.insights,
          tint: Color(0xFF6366F1),
        ),
        LessonQuiz(
          question: 'How is a company\'s market cap calculated?',
          options: [
            'Share price minus its debt',
            'Share price × total number of shares',
            'Yearly profit × 10',
            'Number of shares ÷ share price',
          ],
          correctIndex: 1,
          explanation: 'Market cap = share price × total shares outstanding, which reflects the market\'s valuation of the entire company.',
        ),
        LessonQuiz(
          question: 'Compared with large-caps, small-cap stocks generally are:',
          options: [
            'Safer and less volatile',
            'Guaranteed to grow faster',
            'More volatile and higher risk',
            'Always part of the NIFTY 50',
          ],
          correctIndex: 2,
          explanation: 'Small-caps tend to be more volatile and carry higher risk (with potentially higher reward), whereas large-caps are typically more stable.',
        ),
        ],
      ),
  ],
);

const _sectorsModule = LessonModule(
  id: 'sectors',
  title: 'Know your sectors',
  blurb: 'Why IT, banks, FMCG & autos move differently.',
  lessons: [
      Lesson(
        id: 'sector_it',
        title: 'IT & tech',
        blurb: 'The export engine and the rupee.',
        icon: Icons.memory,
        tint: Color(0xFF6366F1),
        cards: [
        LessonNote(
          heading: 'What IT does',
          body: 'India\'s IT sector mostly sells software services to foreign companies: building apps, managing data centres, running back-office tech, and now AI projects. It is an export engine — most revenue comes from clients in the US and Europe, not from India. These firms employ lakhs of engineers and are among the country\'s largest private employers.',
        ),
        LessonNote(
          heading: 'Why the rupee matters',
          body: 'IT firms earn in US dollars but report profits in rupees. When the rupee weakens (say ₹83 to ₹85 per dollar), the same \$1 of revenue converts to more rupees, lifting profits. A stronger rupee does the opposite. That is why IT is called \'rupee-sensitive\' or a \'currency play\'.',
        ),
        LessonNote(
          heading: 'What drives the sector',
          body: 'Demand depends on how freely US and European clients are spending on technology. In a strong global economy, clients sign big multi-year deals; in a slowdown, they cut tech budgets and growth stalls. So IT stocks watch the US economy and the rupee-dollar rate closely.',
        ),
        LessonExample(
          heading: 'The big names',
          body: 'TCS is India\'s largest IT company and part of the Tata group. Infosys (INFY) and Wipro are long-standing rivals, while HCL Technologies (HCLTECH) is strong in infrastructure and products. Tech Mahindra (TECHM) leans toward telecom clients, so its fortunes track global telecom spending.',
          icon: Icons.insights,
          tint: Color(0xFF6366F1),
        ),
        LessonExample(
          heading: 'Rupee swing, illustrated',
          body: 'Suppose Infosys bills a US client \$10 million for a project. At ₹83/\$ that is ₹83 crore of revenue; if the rupee slips to ₹85/\$, the same contract becomes ₹85 crore — an extra ₹2 crore purely from currency, with no new work done. This is illustrative, not a forecast.',
          icon: Icons.insights,
          tint: Color(0xFF6366F1),
        ),
        LessonQuiz(
          question: 'An Indian IT firm earns mostly in US dollars. All else equal, what usually happens to its rupee profits when the rupee weakens against the dollar?',
          options: [
            'Profits fall, because exports become less competitive',
            'Profits rise, because each dollar converts into more rupees',
            'Profits are unaffected by the currency rate',
          ],
          correctIndex: 1,
          explanation: 'Revenue is in dollars but reported in rupees, so a weaker rupee means each dollar is worth more rupees — boosting reported profit.',
        ),
        LessonQuiz(
          question: 'Which of these is the largest Indian IT-services company by revenue?',
          options: [
            'Wipro',
            'Tech Mahindra',
            'TCS',
            'HCL Technologies',
          ],
          correctIndex: 2,
          explanation: 'TCS (Tata Consultancy Services) is India\'s largest IT-services firm; the others are major peers but smaller.',
        ),
        ],
      ),
      Lesson(
        id: 'sector_banking',
        title: 'Banks & financials',
        blurb: 'How banks earn; private vs public.',
        icon: Icons.account_balance,
        tint: Color(0xFF22C55E),
        cards: [
        LessonNote(
          heading: 'How banks make money',
          body: 'A bank\'s core business is simple: it borrows money cheaply (your deposits) and lends it out at a higher rate (loans). The gap between the two is its main profit, called the Net Interest Margin, or NIM. A wider NIM generally means a more profitable bank.',
        ),
        LessonNote(
          heading: 'Private vs public banks',
          body: 'Private banks are owned by public shareholders and are usually seen as faster-growing and more efficient. Public sector banks (PSBs) are majority-owned by the government; the State Bank of India is the largest. PSBs are huge in reach but have historically grown more slowly.',
        ),
        LessonNote(
          heading: 'What about NBFCs?',
          body: 'NBFCs (Non-Banking Financial Companies) lend money like banks but cannot accept regular savings deposits. They borrow from markets and banks, then lend for things like consumer purchases, vehicles, or business loans. They often reach customers and segments that big banks skip.',
        ),
        LessonNote(
          heading: 'What drives the sector',
          body: 'Banks thrive when loan demand is strong and borrowers repay on time. Two big risks are rising bad loans (NPAs — loans that aren\'t being repaid) and interest-rate changes by the RBI, which affect both lending rates and deposit costs.',
        ),
        LessonExample(
          heading: 'The key names',
          body: 'Among private banks, HDFC Bank, ICICI Bank, Kotak Mahindra Bank and Axis Bank are the heavyweights. SBI (SBIN) is India\'s largest public sector bank. Bajaj Finance (BAJFINANCE) is a leading NBFC focused on consumer finance — think loans for phones, appliances and two-wheelers.',
          icon: Icons.insights,
          tint: Color(0xFF22C55E),
        ),
        LessonExample(
          heading: 'NIM in action',
          body: 'Imagine a bank pays depositors 4% on a ₹100 deposit and lends that ₹100 to a borrower at 9%. The 5-percentage-point gap is roughly its interest margin before costs. Illustratively, on ₹1,000 crore of such loans that spread is around ₹50 crore a year — the engine of bank profit.',
          icon: Icons.insights,
          tint: Color(0xFF22C55E),
        ),
        LessonQuiz(
          question: 'A bank\'s \'Net Interest Margin\' mainly comes from which gap?',
          options: [
            'Between the price it buys and sells shares at',
            'Between the rate it earns on loans and the rate it pays on deposits',
            'Between its income and its staff salaries',
          ],
          correctIndex: 1,
          explanation: 'Banks borrow cheap (deposits) and lend dearer (loans); that interest-rate spread is the Net Interest Margin.',
        ),
        LessonQuiz(
          question: 'Bajaj Finance is best described as which type of lender?',
          options: [
            'A public sector bank',
            'A central bank',
            'An NBFC focused on consumer finance',
          ],
          correctIndex: 2,
          explanation: 'Bajaj Finance is a Non-Banking Financial Company; it lends (e.g. consumer finance) but does not take ordinary savings deposits like a bank.',
        ),
        ],
      ),
      Lesson(
        id: 'sector_fmcg',
        title: 'FMCG & consumer',
        blurb: 'Defensive demand and everyday brands.',
        icon: Icons.shopping_basket_outlined,
        tint: Color(0xFFEC4899),
        cards: [
        LessonNote(
          heading: 'What FMCG means',
          body: 'FMCG stands for Fast-Moving Consumer Goods — everyday products people buy again and again: soap, shampoo, biscuits, tea, packaged food. They are low-priced, used up quickly, and bought regardless of how the economy is doing. That steady, repeat demand defines the sector.',
        ),
        LessonNote(
          heading: 'Why it\'s called \'defensive\'',
          body: 'People keep buying toothpaste and biscuits even in a slowdown, so FMCG sales stay relatively stable. Investors call such steady sectors \'defensive\' because they tend to hold up better when the economy weakens, though they also rarely shoot up fast in a boom.',
        ),
        LessonNote(
          heading: 'Rural plus urban demand',
          body: 'FMCG companies sell across both cities and villages, so a good monsoon and strong rural incomes can lift demand meaningfully. Their other big swing factor is the cost of raw materials — palm oil, wheat, milk, packaging — which affects how much profit they keep.',
        ),
        LessonExample(
          heading: 'The household names',
          body: 'Hindustan Unilever (HINDUNILVR) owns brands like Surf, Dove and Lipton. ITC spans cigarettes, packaged foods and hotels. Nestlé India (NESTLEIND) makes Maggi and Nescafé, while Britannia is best known for its biscuits. You likely have several of these products at home right now.',
          icon: Icons.insights,
          tint: Color(0xFFEC4899),
        ),
        LessonExample(
          heading: 'Input costs bite',
          body: 'Say Britannia\'s biscuit costs rise because wheat and palm oil get pricier. If it can\'t fully pass that on to customers, margins shrink even if sales volumes hold steady. This is why FMCG investors watch commodity prices as closely as sales — figures here are illustrative.',
          icon: Icons.insights,
          tint: Color(0xFFEC4899),
        ),
        LessonQuiz(
          question: 'Why are FMCG stocks often called \'defensive\'?',
          options: [
            'Because their products are expensive luxury items',
            'Because demand for everyday essentials stays relatively steady even in a slowdown',
            'Because they are owned mainly by the government',
          ],
          correctIndex: 1,
          explanation: 'People keep buying daily essentials like soap and biscuits regardless of the economic cycle, giving FMCG firms steadier demand.',
        ),
        LessonQuiz(
          question: 'Which company\'s business spans cigarettes, packaged foods AND hotels?',
          options: [
            'Nestlé India',
            'Britannia',
            'ITC',
            'Hindustan Unilever',
          ],
          correctIndex: 2,
          explanation: 'ITC is a diversified conglomerate with cigarettes, an FMCG foods business, and a hotels division.',
        ),
        ],
      ),
      Lesson(
        id: 'sector_auto',
        title: 'Autos',
        blurb: 'Cyclical demand and the EV shift.',
        icon: Icons.directions_car_outlined,
        tint: Color(0xFFF59E0B),
        cards: [
        LessonNote(
          heading: 'Autos are cyclical',
          body: 'A vehicle is a big, postponable purchase, so auto demand rises in good times and falls when money is tight. The sector is \'cyclical\' — closely tied to the broader economy, interest rates (most vehicles are bought on loans) and fuel prices. Strong income growth tends to drive a buying wave.',
        ),
        LessonNote(
          heading: 'Different segments, different drivers',
          body: 'The sector splits into segments that don\'t always move together: two-wheelers (scooters and bikes, mass-market), passenger cars and SUVs, and commercial vehicles (CVs) like trucks and buses. CV demand in particular tracks freight and construction activity, a barometer of the wider economy.',
        ),
        LessonNote(
          heading: 'The EV shift',
          body: 'Electric vehicles are a major structural change reshaping the industry. Traditional makers are investing heavily in EVs while new competitors emerge. This shift affects who wins future market share, so investors watch each company\'s EV strategy alongside its current petrol and diesel sales.',
        ),
        LessonExample(
          heading: 'Who makes what',
          body: 'Maruti Suzuki (MARUTI) is India\'s largest carmaker with roughly 40% of passenger-vehicle sales. Tata Motors (TATAMOTORS) makes CVs, owns Jaguar Land Rover, and leads in EVs. Mahindra & Mahindra (M&M) is strong in SUVs and tractors. Bajaj Auto and Hero MotoCorp dominate two-wheelers, and Eicher Motors owns Royal Enfield.',
          icon: Icons.insights,
          tint: Color(0xFFF59E0B),
        ),
        LessonExample(
          heading: 'Rates and demand',
          body: 'Suppose loan interest rates jump and a car EMI rises from around ₹15,000 to ₹17,000 a month. Some buyers delay the purchase, softening car sales — a typical cyclical reaction. The exact figures are illustrative, but the pattern is why autos watch RBI rate moves.',
          icon: Icons.insights,
          tint: Color(0xFFF59E0B),
        ),
        LessonQuiz(
          question: 'Why is the auto sector described as \'cyclical\'?',
          options: [
            'Because vehicles run in cycles of two and four wheels',
            'Because demand rises and falls with the economy, interest rates and incomes',
            'Because demand is steady regardless of economic conditions',
          ],
          correctIndex: 1,
          explanation: 'Vehicles are big, deferrable purchases often bought on loans, so demand swings with the economic cycle and interest rates.',
        ),
        LessonQuiz(
          question: 'Which company owns the Royal Enfield motorcycle brand?',
          options: [
            'Hero MotoCorp',
            'Bajaj Auto',
            'Eicher Motors',
            'Mahindra & Mahindra',
          ],
          correctIndex: 2,
          explanation: 'Eicher Motors owns Royal Enfield; Bajaj Auto and Hero MotoCorp are the other major two-wheeler players.',
        ),
        ],
      ),
      Lesson(
        id: 'sector_energy',
        title: 'Energy, metals & pharma',
        blurb: 'Commodity cycles and defensive pharma.',
        icon: Icons.bolt,
        tint: Color(0xFF06B6D4),
        cards: [
        LessonNote(
          heading: 'Three commodity-driven sectors',
          body: 'This group covers energy (oil and power), metals (steel and aluminium) and pharma (medicines). Energy and metals are commodity sectors — their fortunes ride on prices set largely in global markets, making them cyclical. Pharma is different and more defensive, which we\'ll see below.',
        ),
        LessonNote(
          heading: 'Energy and power',
          body: 'Energy firms produce or refine oil and gas, or generate electricity. Their profits are sensitive to crude oil prices, fuel demand and government policy. Power generators are steadier, since electricity demand grows with the economy and is less tied to volatile commodity prices than oil.',
        ),
        LessonNote(
          heading: 'Metals follow global prices',
          body: 'Steel and aluminium are global commodities priced on world markets, so a metals company in India profits when global metal prices are high and suffers when they fall. Chinese demand and global construction activity are big swing factors — these are classic cyclical, boom-and-bust stocks.',
        ),
        LessonNote(
          heading: 'Pharma is defensive',
          body: 'People need medicines in good times and bad, so pharma demand is steady and defensive. Many Indian firms also export generic drugs (off-patent medicines) to the US, a large and profitable market. US regulatory approvals and pricing therefore matter a lot to these companies.',
        ),
        LessonExample(
          heading: 'The names by group',
          body: 'Energy/power: Reliance Industries (RELIANCE, oil-to-retail giant), ONGC (oil and gas exploration) and NTPC (India\'s largest power generator). Metals: Tata Steel (TATASTEEL), JSW Steel (JSWSTEEL) and Hindalco (HINDALCO, aluminium). Pharma: Sun Pharma (SUNPHARMA), Cipla and Dr Reddy\'s (DRREDDY).',
          icon: Icons.insights,
          tint: Color(0xFF06B6D4),
        ),
        LessonQuiz(
          question: 'Why are steel companies like Tata Steel considered cyclical?',
          options: [
            'Because steel demand never changes year to year',
            'Because their profits swing with globally-set metal prices and demand',
            'Because steel is mainly an export-only business with fixed prices',
          ],
          correctIndex: 1,
          explanation: 'Steel is a global commodity; producers earn more when world prices are high and less when they fall, creating boom-and-bust cycles.',
        ),
        LessonQuiz(
          question: 'Which of these sectors is generally the most \'defensive\'?',
          options: [
            'Steel and aluminium (metals)',
            'Pharmaceuticals',
            'Crude oil exploration',
          ],
          correctIndex: 1,
          explanation: 'Medicine demand stays steady through economic ups and downs, making pharma defensive, unlike commodity-price-driven metals and oil.',
        ),
        ],
      ),
  ],
);

const _ordersModule = LessonModule(
  id: 'orders',
  title: 'Orders & execution',
  blurb: 'Place trades the right way.',
  lessons: [
      Lesson(
        id: 'order_types',
        title: 'Market, limit & stop',
        blurb: 'Pick the right order for the job.',
        icon: Icons.tune,
        tint: Color(0xFF8B5CF6),
        cards: [
        LessonNote(
          heading: 'A market order',
          body: 'A market order fills immediately at the best price available right now. It\'s the fastest way to get in or out, so use it when you care more about being filled than about the exact price. The trade-off: in a fast-moving or thinly traded stock, the price you actually get can differ a little from the last quote you saw.',
        ),
        LessonNote(
          heading: 'A limit order',
          body: 'A limit order fills only at your chosen price or better. A buy limit fills at your price or lower; a sell limit fills at your price or higher. You get price control, but there\'s no guarantee of a fill — if the market never reaches your price, the order just waits or expires.',
        ),
        LessonNote(
          heading: 'A stop-loss (SL)',
          body: 'A stop-loss sits dormant until the price crosses a trigger level you set, then it sends an order to the market. Its main job is to cap your loss (or protect a profit) without you watching the screen. Think of it as an automatic \'get me out if it goes against me\' instruction.',
        ),
        LessonExample(
          heading: 'Three ways to buy INFY',
          body: 'Say Infosys (an IT services company on NSE/BSE) is trading near ₹1,500. A MARKET buy grabs shares right away around ₹1,500. A LIMIT buy at ₹1,480 fills only if the price dips to ₹1,480 or lower — patient, but it may never trigger. These figures are illustrative, not live prices.',
          icon: Icons.insights,
          tint: Color(0xFF8B5CF6),
        ),
        LessonExample(
          heading: 'Protecting an INFY position',
          body: 'You bought Infosys at ₹1,500 and don\'t want to lose more than about 3%. You place a STOP-LOSS with a trigger around ₹1,455. If INFY falls to ₹1,455 the stop fires and sends a sell order, so the loss is capped automatically instead of running deeper while you\'re away.',
          icon: Icons.insights,
          tint: Color(0xFF8B5CF6),
        ),
        LessonQuiz(
          question: 'You want to buy a stock but only if you can get it at ₹980 or cheaper, and you\'re fine waiting. Which order fits?',
          options: [
            'Market order',
            'Limit order at ₹980',
            'Stop-loss at ₹980',
          ],
          correctIndex: 1,
          explanation: 'A limit buy at ₹980 fills only at ₹980 or lower, giving you price control while you wait — exactly what you asked for. A market order ignores price, and a stop-loss is for triggering an exit, not setting a buy price.',
        ),
        LessonQuiz(
          question: 'What is the main purpose of a stop-loss order?',
          options: [
            'To guarantee you buy at the lowest price of the day',
            'To fill instantly no matter the price',
            'To automatically trigger an exit once price crosses a set level, capping losses',
          ],
          correctIndex: 2,
          explanation: 'A stop-loss stays inactive until the price hits your trigger, then it sends an order — its job is to limit a loss (or lock a gain) without you watching, not to chase the lowest price or fill instantly.',
        ),
        ],
      ),
      Lesson(
        id: 'product_types',
        title: 'Intraday vs delivery',
        blurb: 'CNC vs MIS — holding vs same-day.',
        icon: Icons.event_repeat,
        tint: Color(0xFF22C55E),
        cards: [
        LessonNote(
          heading: 'Delivery (CNC)',
          body: 'Delivery, often labelled CNC, means you actually take ownership of the shares and they sit in your holdings. There\'s no forced exit at the end of the day, so you can hold for days, months or years. Settlement is on a T+1 basis — the shares are credited the trading day after you buy.',
        ),
        LessonNote(
          heading: 'Intraday (MIS)',
          body: 'Intraday, often labelled MIS, means you open and close the position on the same trading day. If you don\'t close it yourself, the broker auto-squares it off before the market closes. You typically get extra leverage (lower margin) for intraday, but you must be out by end of day.',
        ),
        LessonNote(
          heading: 'The risk difference',
          body: 'Delivery risk is straightforward: you own the shares and can wait out a dip. Intraday adds two pressures — the position is forced shut the same day even if the price is bad, and the leverage that magnifies gains magnifies losses just as fast. Beginners usually find delivery far more forgiving.',
        ),
        LessonExample(
          heading: 'Holding TATAMOTORS as delivery',
          body: 'You buy 100 shares of Tata Motors (the automaker, part of the Tata Group) at ₹900 using CNC/delivery. They\'re credited to your holdings on T+1 and stay there — if the stock dips to ₹870 next week, nobody forces you to sell. You can wait, since you own the shares outright.',
          icon: Icons.insights,
          tint: Color(0xFF22C55E),
        ),
        LessonExample(
          heading: 'Trading TATAMOTORS intraday',
          body: 'Same Tata Motors at ₹900, but you buy 100 shares as MIS/intraday for a quick move. You must sell before close; if you forget, the broker auto-squares the position near end of day at whatever price the market offers. The lower margin let you take the trade, but the same-day deadline is non-negotiable.',
          icon: Icons.insights,
          tint: Color(0xFF22C55E),
        ),
        LessonQuiz(
          question: 'You buy a stock as INTRADAY (MIS) in the morning but get busy and never close it. What typically happens?',
          options: [
            'It rolls over and becomes a long-term delivery holding',
            'The broker auto-squares off the position before the market closes',
            'Nothing — it stays open until you sell it tomorrow',
          ],
          correctIndex: 1,
          explanation: 'An intraday (MIS) position must be closed the same day, so if you don\'t act, the broker automatically squares it off before close — you can\'t carry it forward like a delivery holding.',
        ),
        LessonQuiz(
          question: 'Which is generally true about delivery (CNC) versus intraday (MIS)?',
          options: [
            'Delivery forces you to sell the same day; intraday lets you hold for years',
            'Delivery means you own the shares with no auto-square-off; intraday is same-day with extra leverage',
            'Both settle T+1 and both auto-square-off at end of day',
          ],
          correctIndex: 1,
          explanation: 'With delivery (CNC) you own the shares, settle T+1, and face no forced exit, so you can hold long term. Intraday (MIS) is same-day only with auto-square-off and usually lower margin (more leverage).',
        ),
        ],
      ),
  ],
);

const _derivativesModule = LessonModule(
  id: 'derivatives',
  title: 'Futures & options',
  blurb: 'Leverage, calls & puts — handle with care.',
  lessons: [
      Lesson(
        id: 'futures_basics',
        title: 'Futures basics',
        blurb: 'Lots, margin and leverage.',
        icon: Icons.trending_up,
        tint: Color(0xFFF59E0B),
        cards: [
        LessonNote(
          heading: 'What is a futures contract?',
          body: 'A futures contract is an agreement to buy or sell an underlying asset at a price you fix today, settled on a future date. You are locking in the price now; the actual buying or selling happens at expiry. The underlying can be an index like NIFTY or a single stock like RELIANCE.',
        ),
        LessonNote(
          heading: 'Lot sizes, not single shares',
          body: 'Futures trade in fixed bundles called lots, set by the exchange — you cannot buy just one share. For example, one NIFTY futures lot might be 50 units, or one RELIANCE lot might be 250 shares. You always trade in whole multiples of the lot.',
        ),
        LessonNote(
          heading: 'Leverage via margin',
          body: 'You do not pay the full contract value upfront — only a fraction called margin. That small deposit controls a much larger position, which is leverage. Leverage amplifies BOTH gains and losses, so a small adverse move can wipe out far more than you expected.',
        ),
        LessonExample(
          heading: 'RELIANCE futures, illustratively',
          body: 'Say RELIANCE trades near ₹2,800 and one lot is 250 shares — that is a position worth ₹7,00,000. With roughly 20% margin you might control it for about ₹1,40,000. A 5% move in the stock (₹140) is ₹35,000 on the lot — a gain or loss of about 25% on your margin, from a 5% stock move.',
          icon: Icons.insights,
          tint: Color(0xFFF59E0B),
        ),
        LessonExample(
          heading: 'Index vs stock futures',
          body: 'Index futures track a whole index — NIFTY (the broad market) or BANKNIFTY (banking stocks) — and are popular for trading the overall market or sector. Stock futures track one company, like TCS or RELIANCE. Each contract has its own expiry, after which it is settled and stops trading.',
          icon: Icons.insights,
          tint: Color(0xFFF59E0B),
        ),
        LessonNote(
          heading: 'Expiry',
          body: 'Every futures contract has an expiry date when it is settled. Indian index and stock futures expire on fixed cycles, and you can hold across the current month or roll to the next. Because futures are leveraged, they are higher-risk than buying the stock outright — only the most prepared traders use them.',
        ),
        LessonQuiz(
          question: 'One NIFTY futures lot is 50 units and the index is at 22,000. The full contract value is ₹11,00,000, but your broker only blocks ₹1,65,000 as margin to take the position. What does this illustrate?',
          options: [
            'There are no fees on futures',
            'Leverage — a small margin controls a much larger position, amplifying gains and losses',
            'You only ever risk the ₹1,65,000 and nothing more',
            'Futures are safer than buying the index ETF',
          ],
          correctIndex: 1,
          explanation: 'Paying ₹1,65,000 to control ₹11,00,000 is leverage of about 6.7x. The same percentage move is magnified on your margin — that cuts both ways, which is why futures carry higher risk.',
        ),
        ],
      ),
      Lesson(
        id: 'options_basics',
        title: 'Calls & puts',
        blurb: 'Rights, premium, CE vs PE.',
        icon: Icons.call_split,
        tint: Color(0xFF8B5CF6),
        cards: [
        LessonNote(
          heading: 'An option is a right, not an obligation',
          body: 'An option gives the buyer the RIGHT — but not the obligation — to trade an underlying at a fixed price. Unlike a futures contract, the buyer can simply let it lapse if it is not worth exercising. That right is bought by paying a fee called the premium.',
        ),
        LessonNote(
          heading: 'Calls (CE) and Puts (PE)',
          body: 'A CALL option, written as CE, is the right to BUY at the strike price. A PUT option, written as PE, is the right to SELL at the strike price. The strike is the fixed price set in the contract. A handy memory: Call to buy, Put to sell.',
        ),
        LessonNote(
          heading: 'The premium is the buyer\'s max risk',
          body: 'When you BUY an option, the most you can lose is the premium you paid — no matter how far the market moves against you. That capped downside is the key appeal for option buyers. Options still trade in lots, so total premium = premium per unit × lot size.',
        ),
        LessonExample(
          heading: 'A NIFTY call (CE), illustratively',
          body: 'Suppose NIFTY is at 22,000 and you buy a 22,200 CE for a premium of ₹80 per unit. You now have the right to buy NIFTY at 22,200. If NIFTY rises well above 22,200 the call gains value; if it stays below 22,200 by expiry, your loss is capped at the ₹80 premium you paid.',
          icon: Icons.insights,
          tint: Color(0xFF8B5CF6),
        ),
        LessonExample(
          heading: 'A RELIANCE put (PE), illustratively',
          body: 'With RELIANCE near ₹2,800, you buy a 2,750 PE for a premium of ₹40. This is the right to SELL at ₹2,750, so it gains value if the stock falls. If RELIANCE instead rises or stays flat, you simply let the put lapse and lose only the ₹40 premium.',
          icon: Icons.insights,
          tint: Color(0xFF8B5CF6),
        ),
        LessonNote(
          heading: 'In-the-money, at a glance',
          body: 'A CALL is in-the-money (ITM) when the spot price is above the strike — exercising the right to buy cheaply has value. A PUT is in-the-money when the spot is below the strike — the right to sell high has value. Otherwise the option is out-of-the-money. Options are leveraged and can expire worthless, so they are higher-risk instruments.',
        ),
        LessonQuiz(
          question: 'You expect RELIANCE to FALL over the next week and want a position where your maximum loss is just the premium paid. Which option do you buy?',
          options: [
            'A RELIANCE CALL (CE), because calls profit when price falls',
            'A RELIANCE PUT (PE), because puts give the right to sell and gain value as the stock falls',
            'Either one — calls and puts behave the same',
            'Neither; you must sell a futures lot instead',
          ],
          correctIndex: 1,
          explanation: 'A PUT (PE) is the right to SELL at the strike, so it gains value when the underlying falls. Buying it caps your loss at the premium, while a CALL (CE) is the right to buy and would profit on a rise.',
        ),
        ],
      ),
  ],
);


List<Lesson> get allLessons => [
      for (final m in academyModules) ...m.lessons,
    ];

int get totalLessonCount => allLessons.length;
