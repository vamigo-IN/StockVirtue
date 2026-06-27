import Link from 'next/link';
import { FEATURES, STEPS, SITE } from '@/lib/site';
import { Icon } from '@/components/Icon';

export default function HomePage() {
  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="eyebrow">● Virtual money · Zero risk</span>
            <h1>Practise the stock market. Build real skill.</h1>
            <p className="lead">
              {SITE.name} is a virtual trading simulator for the Indian markets.
              Trade NSE &amp; BSE stocks, F&amp;O and indices with live prices
              and real order types — using ₹ virtual money, never real funds.
            </p>
            <div className="hero-cta">
              <a
                className="btn btn-primary btn-lg"
                href={SITE.playUrl}
                target="_blank"
                rel="noopener"
              >
                <Icon name="play" size={18} />
                Get it on Google Play
              </a>
              <Link className="btn btn-light btn-lg" href="/features">
                Explore features
              </Link>
            </div>
            <div className="hero-meta">
              <div>
                <strong>NSE · BSE</strong>
                <span>Live market data</span>
              </div>
              <div>
                <strong>F&amp;O</strong>
                <span>Options &amp; futures</span>
              </div>
              <div>
                <strong>₹0</strong>
                <span>Real money at risk</span>
              </div>
            </div>
          </div>

          <div className="phone" aria-hidden="true">
            <div className="phone-screen">
              <div style={{ color: '#fff', fontWeight: 800, marginBottom: 6 }}>
                Watchlist
              </div>
              <div className="tick-sub" style={{ marginBottom: 10 }}>
                Live · NSE
              </div>
              {[
                ['NIFTY 50', '24,318.50', '+0.62%', true],
                ['RELIANCE', '2,945.10', '+1.18%', true],
                ['HDFCBANK', '1,672.85', '−0.34%', false],
                ['TCS', '3,890.40', '+0.51%', true],
                ['SENSEX', '79,802.10', '−0.12%', false],
              ].map(([name, price, chg, up]) => (
                <div className="tick-row" key={name as string}>
                  <div>
                    <div className="tick-name">{name}</div>
                    <div className="tick-sub">₹{price}</div>
                  </div>
                  <div className={up ? 'up' : 'down'}>{chg}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust chips ──────────────────────────────────────── */}
      <section className="section-sm">
        <div className="container center">
          <div className="chips" style={{ justifyContent: 'center' }}>
            {[
              'Live NSE & BSE prices',
              'Market, Limit, SL, SL-L & Trailing',
              'Intraday & Delivery',
              'Option chains',
              'Leaderboards',
              'Trading Academy',
            ].map((c) => (
              <span className="chip" key={c}>
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section className="section bg-alt" id="features">
        <div className="container">
          <div className="center" style={{ marginBottom: 44 }}>
            <h2>Everything you need to learn trading</h2>
            <p className="lead">
              A complete, realistic trading experience — without the financial
              risk. Practise like it&apos;s real, because the market data is.
            </p>
          </div>
          <div className="grid grid-4">
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
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="section">
        <div className="container">
          <div className="center" style={{ marginBottom: 44 }}>
            <h2>Start trading in minutes</h2>
            <p className="lead">No paperwork, no deposits — just download and go.</p>
          </div>
          <div className="grid grid-4">
            {STEPS.map((s, i) => (
              <div key={s.title}>
                <div className="step-num">{i + 1}</div>
                <h3>{s.title}</h3>
                <p className="muted">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Learn section ────────────────────────────────────── */}
      <section className="section bg-alt">
        <div className="container grid grid-2" style={{ alignItems: 'center' }}>
          <div>
            <h2>Learn by doing — safely</h2>
            <p className="muted">
              Most people lose money learning to trade. {SITE.name} flips that:
              you make every beginner mistake with virtual money, so the only
              thing you lose is the habit of losing.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0 0' }}>
              {[
                'Structured Trading Academy with lessons & quizzes',
                'A market glossary that explains every term',
                'Achievement badges that reward good habits',
                'Realistic fees & taxes so P&L reflects reality',
              ].map((t) => (
                <li
                  key={t}
                  style={{ display: 'flex', gap: 10, marginBottom: 12 }}
                >
                  <span style={{ color: 'var(--green)' }}>
                    <Icon name="check" size={20} />
                  </span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-2">
            {[
              { icon: 'book', k: 'Academy', v: 'Lessons & quizzes' },
              { icon: 'trophy', k: 'Badges', v: 'Earn as you learn' },
              { icon: 'users', k: 'Rooms', v: 'Compete with friends' },
              { icon: 'bell', k: 'Alerts', v: 'Stay on top of fills' },
            ].map((c) => (
              <div className="card" key={c.k}>
                <div className="icon">
                  <Icon name={c.icon} />
                </div>
                <h3 style={{ marginBottom: 2 }}>{c.k}</h3>
                <p>{c.v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA band ─────────────────────────────────────────── */}
      <section className="section">
        <div className="container">
          <div className="cta-band">
            <h2>Ready to trade — risk-free?</h2>
            <p>
              Download {SITE.name} and start practising the markets today. It
              &apos;s free, and your wallet is full of virtual money.
            </p>
            <a
              className="btn btn-ghost btn-lg"
              href={SITE.playUrl}
              target="_blank"
              rel="noopener"
            >
              <Icon name="play" size={18} />
              Download on Google Play
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
