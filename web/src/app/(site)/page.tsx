import Link from 'next/link';
import { FEATURES, STEPS, SITE } from '@/lib/site';
import { Icon } from '@/components/Icon';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/Reveal';
import { TickerTape, type Tick } from '@/components/motion/TickerTape';
import { CandleChart } from '@/components/motion/CandleChart';
import { OrderBook } from '@/components/motion/OrderBook';
import { StreamNumber } from '@/components/motion/StreamNumber';
import { MagneticButton } from '@/components/motion/MagneticButton';
import { TiltCard } from '@/components/motion/TiltCard';
import { Sparkline } from '@/components/motion/Sparkline';
import { SimChip } from '@/components/motion/Glass';
import { BadgePop } from '@/components/motion/BadgePop';

const TICKS: Tick[] = [
  { sym: 'NIFTY 50', px: '24,318.50', chg: '0.62%', up: true },
  { sym: 'SENSEX', px: '79,802.10', chg: '0.12%', up: false },
  { sym: 'BANKNIFTY', px: '52,140.35', chg: '0.88%', up: true },
  { sym: 'RELIANCE', px: '2,945.10', chg: '1.18%', up: true },
  { sym: 'HDFCBANK', px: '1,672.85', chg: '0.34%', up: false },
  { sym: 'TCS', px: '3,890.40', chg: '0.51%', up: true },
  { sym: 'INFY', px: '1,845.20', chg: '0.27%', up: true },
  { sym: 'GOLD', px: '71,240', chg: '0.44%', up: true },
  { sym: 'CRUDEOIL', px: '6,588', chg: '0.73%', up: false },
];

export default function HomePage() {
  return (
    <>
      {/* ── HERO — dark terminal ─────────────────────────────── */}
      <section className="hero terminal">
        <div className="floor" aria-hidden="true" />
        <div className="grid-bg" aria-hidden="true" />
        <TickerTape items={TICKS} speed={48} className="hero-ticker" />

        <div className="container hero-grid">
          <div>
            <Reveal>
              <span className="eyebrow">
                <span className="dot" /> Live NSE · BSE · MCX — virtual money
              </span>
            </Reveal>
            <Reveal delay={0.06}>
              <h1>
                Virtual trading.
                <br />
                <span className="accent">Real skills.</span>
                <span className="caret" aria-hidden="true" />
              </h1>
            </Reveal>
            <Reveal delay={0.12}>
              <p className="hero-sub">
                {SITE.name} is a trading simulator for the Indian markets — live
                prices and the exact order types real traders use, but you learn
                with virtual money. Master it here before any of your own is on
                the line.
              </p>
            </Reveal>
            <Reveal delay={0.18}>
              <div className="hero-cta">
                <MagneticButton
                  href={SITE.playUrl}
                  className="btn btn-primary btn-lg btn-sheen"
                >
                  <Icon name="play" size={18} />
                  Get it on Google Play
                </MagneticButton>
                <a className="btn btn-ghost btn-lg" href="#how">
                  See how it works
                </a>
              </div>
            </Reveal>
            <Reveal delay={0.24}>
              <div className="hero-meta">
                <div>
                  <div className="k">NSE · BSE</div>
                  <div className="v">Live market data</div>
                </div>
                <div>
                  <div className="k">F&amp;O · MCX</div>
                  <div className="v">Options &amp; commodities</div>
                </div>
                <div>
                  <div className="k mono">₹0</div>
                  <div className="v">Real money at risk</div>
                </div>
              </div>
            </Reveal>
          </div>

          {/* Live terminal panel */}
          <Reveal direction="left" delay={0.15}>
            <TiltCard className="terminal-panel-tilt" max={7}>
              <div className="tp-head">
                <span className="tp-dot" />
                <span className="tp-dot" />
                <span className="tp-dot g" />
                <span className="tp-title">NIFTY 50 · 5m</span>
                <span style={{ marginLeft: 'auto' }}>
                  <SimChip label="Simulated" />
                </span>
              </div>
              <div className="tp-body">
                <CandleChart count={34} />
                <div className="tp-pnl">
                  <span className="label">Today&apos;s P&amp;L</span>
                  <span className="val">
                    <StreamNumber
                      value={124860}
                      format="inr"
                      live
                      interval={2800}
                    />
                  </span>
                </div>
                <OrderBook />
              </div>
            </TiltCard>
          </Reveal>
        </div>

        <a
          className="scroll-cue"
          href="#how"
          aria-label="Scroll to how it works"
        >
          <Icon name="arrow" size={22} />
        </a>
      </section>

      {/* ── TRUST STRIP — dark ───────────────────────────────── */}
      <section className="section-sm terminal zone-dark">
        <div className="floor" aria-hidden="true" style={{ opacity: 0.5 }} />
        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          <Reveal>
            <div className="trust-row">
              {[
                ['play', 'On Google Play'],
                ['shield', '100% virtual money'],
                ['chart', 'Real NSE & BSE data'],
                ['check', 'No real risk, ever'],
              ].map(([icon, label]) => (
                <span className="trust-item" key={label}>
                  <Icon name={icon} size={18} />
                  {label}
                </span>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FEATURES — dark bento ────────────────────────────── */}
      <section className="section terminal zone-dark" id="features">
        <div className="floor" aria-hidden="true" />
        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          <Reveal>
            <div className="center" style={{ marginBottom: 48 }}>
              <span className="eyebrow">
                <span className="dot" /> The setup
              </span>
              <h2 style={{ marginTop: 16 }}>
                A real trading desk, minus the risk
              </h2>
              <p className="lead">
                The data is real, so the practice counts. The money isn&apos;t,
                so the mistakes don&apos;t.
              </p>
            </div>
          </Reveal>

          {/* Live micro-widget cards */}
          <RevealGroup className="grid grid-4" stagger={0.07}>
            <RevealItem>
              <TiltCard>
                <div className="icon">
                  <Icon name="chart" />
                </div>
                <h3>Live market data</h3>
                <p>
                  Real-time NSE &amp; BSE prices, charts and full depth — your
                  practice moves tick for tick with the market.
                </p>
                <div style={{ marginTop: 16 }}>
                  <Sparkline points={[12, 11, 14, 13, 16, 15, 19, 18, 22]} />
                </div>
              </TiltCard>
            </RevealItem>

            <RevealItem>
              <TiltCard>
                <div className="icon">
                  <Icon name="portfolio" />
                </div>
                <h3>Portfolio &amp; live P&amp;L</h3>
                <p>
                  Holdings, cost and current value in one place — P&amp;L moves
                  tick for tick.
                </p>
                <div
                  className="mono"
                  style={{
                    marginTop: 14,
                    fontSize: '1.4rem',
                    color: 'var(--green-500)',
                  }}
                >
                  <StreamNumber
                    value={38420}
                    format="inr"
                    live
                    interval={2400}
                  />
                </div>
              </TiltCard>
            </RevealItem>

            <RevealItem>
              <TiltCard>
                <div className="icon">
                  <Icon name="trade" />
                </div>
                <h3>Every order type</h3>
                <p>
                  Market, Limit, Stop-Loss, SL-Limit and Trailing — intraday or
                  delivery, with real fees baked in.
                </p>
                <div style={{ marginTop: 14 }} className="chips">
                  <span className="chip">MKT</span>
                  <span className="chip">LIMIT</span>
                  <span className="chip">SL</span>
                  <span className="chip">TRAIL</span>
                </div>
              </TiltCard>
            </RevealItem>

            <RevealItem>
              <TiltCard>
                <div className="icon">
                  <Icon name="fno" />
                </div>
                <h3>F&amp;O &amp; commodities</h3>
                <p>
                  Index &amp; stock F&amp;O in correct lots, full option chains,
                  and MCX gold, silver &amp; crude.
                </p>
                <div style={{ marginTop: 16 }}>
                  <Sparkline points={[10, 12, 11, 15, 14, 18, 17, 21, 24]} />
                </div>
              </TiltCard>
            </RevealItem>
          </RevealGroup>

          <RevealGroup
            className="grid grid-4"
            stagger={0.06}
            style={{ marginTop: 22 }}
          >
            {FEATURES.filter((f) =>
              ['clock', 'trophy', 'book', 'shield'].includes(f.icon),
            ).map((f) => (
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
        </div>
      </section>

      {/* ── HOW IT WORKS — assembly ──────────────────────────── */}
      <section className="section terminal zone-dark" id="how">
        <div className="floor" aria-hidden="true" />
        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          <Reveal>
            <div className="center" style={{ marginBottom: 56 }}>
              <span className="eyebrow">
                <span className="dot" /> From zero to trading
              </span>
              <h2 style={{ marginTop: 16 }}>The whole desk, handed to you</h2>
              <p className="lead">
                No paperwork, no deposits, no KYC. Download and you&apos;re
                trading in minutes.
              </p>
            </div>
          </Reveal>

          {/* Assembly: floating panels converge on the phone. The absolute
              panels are direct children of `.assembly` (its positioning
              context); the reveal lives INSIDE each so its transform/filter
              doesn't hijack the containing block. */}
          <div className="assembly">
            <div
              className="assembly-panel glass"
              style={{ top: 10, left: 0, padding: 14 }}
            >
              <Reveal direction="right" delay={0.05}>
                <div className="tp-title" style={{ marginBottom: 8 }}>
                  Chart
                </div>
                <Sparkline points={[6, 9, 8, 12, 11, 15, 14, 18]} height={30} />
              </Reveal>
            </div>
            <div
              className="assembly-panel glass"
              style={{ top: 30, right: 0, padding: 14 }}
            >
              <Reveal direction="left" delay={0.12}>
                <div className="tp-title" style={{ marginBottom: 8 }}>
                  Order ticket
                </div>
                <div
                  className="mono"
                  style={{ fontSize: '0.8rem', color: 'var(--fg-muted)' }}
                >
                  BUY 50 @ LIMIT
                  <br />
                  <span style={{ color: 'var(--green-500)' }}>● FILLED</span>
                </div>
              </Reveal>
            </div>
            <div
              className="assembly-panel glass"
              style={{ bottom: 20, left: 20, padding: 14 }}
            >
              <Reveal direction="up" delay={0.2}>
                <div className="tp-title" style={{ marginBottom: 6 }}>
                  P&amp;L
                </div>
                <div
                  className="mono"
                  style={{ fontSize: '1.1rem', color: 'var(--green-500)' }}
                >
                  +₹1,24,860
                </div>
              </Reveal>
            </div>

            <Reveal>
              <div className="assembly-phone">
                <div className="screen">
                  <SimChip label="Simulated" />
                  <div style={{ marginTop: 14 }}>
                    <CandleChart count={24} />
                  </div>
                  <div className="tp-pnl" style={{ marginTop: 14 }}>
                    <span className="label">Portfolio</span>
                    <span className="val" style={{ fontSize: '1.2rem' }}>
                      ₹11,24,860
                    </span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          <RevealGroup
            className="grid grid-4 center-stack"
            stagger={0.08}
            style={{ marginTop: 56 }}
          >
            {STEPS.map((s, i) => (
              <RevealItem key={s.title}>
                <div className="step-num mono">{i + 1}</div>
                <h3>{s.title}</h3>
                <p className="muted">{s.body}</p>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ── MARKETS — divider tapes ──────────────────────────── */}
      <section className="section-sm terminal zone-dark divider-tape">
        <div className="floor" aria-hidden="true" style={{ opacity: 0.6 }} />
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            display: 'grid',
            gap: 10,
          }}
        >
          <TickerTape items={TICKS} speed={52} />
          <TickerTape items={[...TICKS].reverse()} speed={64} reverse />
        </div>
      </section>

      {/* ── ACADEMY — light zone ─────────────────────────────── */}
      <section className="section">
        <div className="container">
          <div
            className="grid grid-2 stack-center"
            style={{ alignItems: 'center', gap: 48 }}
          >
            <Reveal>
              <div className="stack-copy">
                <span className="eyebrow">
                  <span className="dot" /> Learn by doing
                </span>
                <h2 style={{ marginTop: 16 }}>
                  Learn to trade. Without losing real money.
                </h2>
                <p className="muted">
                  Most people pay for their trading education in blown-up
                  accounts. {SITE.name} lets you make those beginner mistakes
                  with virtual money instead — so the only thing you lose is the
                  habit of losing.
                </p>
                <ul
                  className="check-list"
                  style={{ listStyle: 'none', padding: 0 }}
                >
                  {[
                    'Structured Trading Academy — lessons & quizzes',
                    'A market glossary that explains every term',
                    'Achievement badges that reward good habits',
                    'Realistic fees & taxes so P&L reflects reality',
                  ].map((t) => (
                    <li
                      key={t}
                      style={{ display: 'flex', gap: 11, marginBottom: 13 }}
                    >
                      <span style={{ color: 'var(--green-600)', flex: 'none' }}>
                        <Icon name="check" size={20} />
                      </span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <RevealGroup className="grid grid-2 center-stack" stagger={0.09}>
              {[
                { icon: 'book', k: 'Academy', v: 'Lessons & quizzes' },
                { icon: 'trophy', k: 'Badges', v: 'Earn as you learn' },
                { icon: 'users', k: 'Rooms', v: 'Compete with friends' },
                { icon: 'bell', k: 'Alerts', v: 'Stay on top of fills' },
              ].map((c, i) => (
                <RevealItem key={c.k}>
                  <BadgePop index={i}>
                    <div className="card">
                      <div className="icon">
                        <Icon name={c.icon} />
                      </div>
                      <h3 style={{ marginBottom: 2 }}>{c.k}</h3>
                      <p>{c.v}</p>
                    </div>
                  </BadgePop>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </div>
      </section>

      {/* ── STATS STRIP — dark ───────────────────────────────── */}
      <section className="section-sm terminal zone-dark">
        <div className="floor" aria-hidden="true" />
        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          <div className="stats">
            {[
              { v: 5000, suffix: '+', l: 'Symbols tracked', fmt: 'int' as const },
              { v: 5, suffix: '', l: 'Order types', fmt: 'int' as const },
              { v: 1000000, suffix: '', l: 'Virtual starting wallet', fmt: 'inr' as const },
              { v: 0, suffix: '', l: 'Rupees of real risk', fmt: 'inr' as const },
            ].map((s) => (
              <Reveal key={s.l} className="stat center">
                <div className="n">
                  <StreamNumber value={s.v} format={s.fmt} />
                  {s.suffix}
                </div>
                <div className="l">{s.l}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA — dark terminal ────────────────────────── */}
      <section className="section terminal zone-dark">
        <div className="floor" aria-hidden="true" />
        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          <Reveal>
            <div className="cta-band glass">
              <div className="grid-bg" aria-hidden="true" />
              <div className="cta-inner">
                <span className="eyebrow">
                  <span className="dot" /> Your wallet is waiting
                </span>
                <h2 style={{ marginTop: 16 }}>
                  Start trading in a couple of{' '}
                  <span className="accent">minutes</span>
                </h2>
                <p
                  className="muted"
                  style={{ maxWidth: 540, margin: '0 auto 26px' }}
                >
                  Download {SITE.name} free, pick up your virtual ₹10L wallet,
                  and trade the real markets with zero risk.
                </p>
                <MagneticButton
                  href={SITE.playUrl}
                  className="btn btn-primary btn-lg btn-sheen"
                >
                  <Icon name="play" size={18} />
                  Get it on Google Play
                </MagneticButton>
                <div style={{ marginTop: 16 }}>
                  <Link
                    href="/features"
                    className="mono"
                    style={{ color: 'var(--green-400)', fontSize: '0.9rem' }}
                  >
                    Explore every feature →
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
