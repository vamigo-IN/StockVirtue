import type { Metadata } from 'next';
import Link from 'next/link';
import { FEATURES, SITE } from '@/lib/site';
import { Icon } from '@/components/Icon';

export const metadata: Metadata = {
  title: 'Features',
  description: `Explore everything ${SITE.name} offers: live NSE & BSE data, real order types, F&O, portfolios, competitions and a trading academy — all with virtual money.`,
  alternates: { canonical: '/features' },
};

const GROUPS = [
  {
    title: 'Real-market trading',
    items: [
      ['Live prices & depth', 'Real-time NSE & BSE quotes, charts, and full market depth.'],
      ['All order types', 'Market, Limit, Stop-Loss, SL-Limit and Trailing-Stop.'],
      ['Intraday & Delivery', 'Trade MIS or CNC with realistic brokerage, STT and taxes.'],
      ['After-market orders', 'Queue orders when closed; they fill at the next open. Holiday-aware.'],
      ['Cancel anytime', 'Pending orders are fully cancellable — it’s a learning platform.'],
    ],
  },
  {
    title: 'Derivatives & indices',
    items: [
      ['Futures & Options', 'Trade index & stock F&O in correct lot sizes.'],
      ['Option chains', 'Browse live option chains for every supported underlying.'],
      ['Indices', 'Nifty 50, Sensex, Bank Nifty and many more, with constituents.'],
    ],
  },
  {
    title: 'Portfolio & insights',
    items: [
      ['Live portfolio', 'Holdings, invested value and current value in real time.'],
      ['Realised & unrealised P&L', 'See exactly how every position is performing.'],
      ['One-tap square-off', 'Close positions instantly from your holdings.'],
      ['Trade history & export', 'Review and export your full trade log.'],
    ],
  },
  {
    title: 'Learn & compete',
    items: [
      ['Trading Academy', 'Structured lessons and quizzes from basics to advanced.'],
      ['Glossary', 'Plain-English explanations of every market term.'],
      ['Achievements', 'Earn badges as you build good trading habits.'],
      ['Rooms & tournaments', 'Compete on live leaderboards with friends.'],
    ],
  },
  {
    title: 'Accounts & experience',
    items: [
      ['Flexible sign-in', 'Email, Google, or phone number.'],
      ['Referrals', 'Invite friends and both earn a virtual bonus.'],
      ['Notifications', 'Push & email alerts for fills and key events.'],
      ['Modern UI', 'Clean light/dark themes with large-text accessibility.'],
    ],
  },
];

export default function FeaturesPage() {
  return (
    <>
      <div className="page-head">
        <div className="container">
          <h1>Features</h1>
          <p className="lead">
            A complete, realistic trading experience built for learning — every
            feature, zero financial risk.
          </p>
        </div>
      </div>

      <section className="section">
        <div className="container">
          <div className="grid grid-4" style={{ marginBottom: 56 }}>
            {FEATURES.map((f) => (
              <div className="card" key={f.title}>
                <div className="icon">
                  <Icon name={f.icon} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>

          {GROUPS.map((g) => (
            <div key={g.title} style={{ marginBottom: 40 }}>
              <h2 style={{ fontSize: '1.5rem' }}>{g.title}</h2>
              <div className="grid grid-2" style={{ marginTop: 16 }}>
                {g.items.map(([t, d]) => (
                  <div
                    key={t}
                    style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}
                  >
                    <span style={{ color: 'var(--green)', marginTop: 2 }}>
                      <Icon name="check" size={20} />
                    </span>
                    <div>
                      <strong>{t}</strong>
                      <p className="muted" style={{ margin: '2px 0 0' }}>
                        {d}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="cta-band" style={{ marginTop: 24 }}>
            <h2>See it for yourself</h2>
            <p>Download {SITE.name} and put every feature to work — for free.</p>
            <a
              className="btn btn-ghost btn-lg"
              href={SITE.playUrl}
              target="_blank"
              rel="noopener"
            >
              <Icon name="play" size={18} /> Get it on Google Play
            </a>
            <div style={{ marginTop: 14 }}>
              <Link href="/faq" style={{ color: '#fff', textDecoration: 'underline' }}>
                Have questions? Read the FAQ →
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
