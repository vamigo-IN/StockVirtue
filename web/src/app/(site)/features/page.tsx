import type { Metadata } from 'next';
import Link from 'next/link';
import { FEATURES, SITE } from '@/lib/site';
import { Icon } from '@/components/Icon';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/Reveal';
import { TiltCard } from '@/components/motion/TiltCard';
import { MagneticButton } from '@/components/motion/MagneticButton';

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
    title: 'Derivatives, indices & commodities',
    items: [
      ['Futures & Options', 'Trade index & stock F&O in correct lot sizes.'],
      ['Option chains & greeks', 'Live option chains with official delta, gamma, theta, vega & IV.'],
      ['Indices', 'Nifty 50, Sensex, Bank Nifty and many more, with constituents.'],
      ['MCX commodities', 'Gold, silver, crude and base metals — front-month futures, live.'],
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
          <Reveal>
            <span className="eyebrow">
              <span className="dot" /> Everything inside
            </span>
          </Reveal>
          <Reveal delay={0.06}>
            <h1>Features</h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="lead">
              A complete, realistic trading desk built for learning — every
              feature, zero financial risk.
            </p>
          </Reveal>
        </div>
      </div>

      <section className="section">
        <div className="container">
          <Reveal>
            <h2 style={{ marginBottom: 28 }}>Everything, at a glance</h2>
          </Reveal>
          <RevealGroup
            className="grid grid-4"
            stagger={0.06}
            style={{ marginBottom: 64 }}
          >
            {FEATURES.map((f) => (
              <RevealItem key={f.title}>
                <TiltCard>
                  <div className="icon">
                    <Icon name={f.icon} />
                  </div>
                  <h3>{f.title}</h3>
                  <p>{f.body}</p>
                </TiltCard>
              </RevealItem>
            ))}
          </RevealGroup>

          {GROUPS.map((g) => (
            <Reveal key={g.title} className="fgroup" as="section">
              <div style={{ marginBottom: 44 }}>
                <h2 style={{ fontSize: '1.6rem' }}>{g.title}</h2>
                <div className="grid grid-2" style={{ marginTop: 18 }}>
                  {g.items.map(([t, d]) => (
                    <div
                      key={t}
                      style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}
                    >
                      <span style={{ color: 'var(--green-600)', marginTop: 2, flex: 'none' }}>
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
            </Reveal>
          ))}
        </div>
      </section>

      {/* Dark terminal CTA moment */}
      <section className="section terminal zone-dark">
        <div className="floor" aria-hidden="true" />
        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          <Reveal>
            <div className="cta-band glass">
              <div className="grid-bg" aria-hidden="true" />
              <div className="cta-inner">
                <h2>
                  See it for <span className="accent">yourself</span>
                </h2>
                <p className="muted" style={{ maxWidth: 520, margin: '0 auto 26px' }}>
                  Download {SITE.name} and put every feature to work — free, with
                  virtual money.
                </p>
                <MagneticButton
                  href={SITE.playUrl}
                  className="btn btn-primary btn-lg btn-sheen"
                >
                  <Icon name="play" size={18} /> Get it on Google Play
                </MagneticButton>
                <div style={{ marginTop: 14 }}>
                  <Link href="/faq" className="mono" style={{ color: 'var(--green-400)', fontSize: '0.9rem' }}>
                    Have questions? Read the FAQ →
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
