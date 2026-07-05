import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import { Icon } from '@/components/Icon';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/Reveal';
import { TiltCard } from '@/components/motion/TiltCard';
import { GlowField } from '@/components/motion/GlowField';
import { StreamNumber } from '@/components/motion/StreamNumber';
import { CandleChart } from '@/components/motion/CandleChart';
import { SimChip } from '@/components/motion/Glass';

export const metadata: Metadata = {
  title: 'About Us',
  description: `Learn about ${SITE.name} — our mission to make stock-market education accessible, practical and risk-free for everyone in India.`,
  alternates: { canonical: '/about' },
};

const STATS = [
  { v: 5000, suffix: '+', l: 'Symbols tracked', fmt: 'int' as const },
  { v: 1000000, suffix: '', l: 'Virtual wallet', fmt: 'inr' as const },
  { v: 5, suffix: '', l: 'Order types', fmt: 'int' as const },
  { v: 0, suffix: '', l: 'Real money at risk', fmt: 'inr' as const },
];

export default function AboutPage() {
  return (
    <>
      <div className="page-head">
        <GlowField />
        <div className="container">
          <Reveal>
            <span className="eyebrow">
              <span className="dot" /> Our mission
            </span>
          </Reveal>
          <Reveal delay={0.06}>
            <h1>
              Learning to trade,{' '}
              <span className="accent">without the losses</span>
            </h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="lead">
              We&apos;re on a mission to make stock-market education practical,
              accessible and completely risk-free for everyone in India.
            </p>
          </Reveal>
        </div>
      </div>

      {/* Animated stats band */}
      <section className="section-sm terminal zone-dark">
        <div className="floor" aria-hidden="true" />
        <div className="grid-bg" aria-hidden="true" />
        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          <div className="stats">
            {STATS.map((s) => (
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

      <section className="section">
        <div className="container prose">
          <Reveal>
            <h2>Why we built {SITE.name}</h2>
            <p>
              Millions of people want to learn how the stock market works — but
              the usual way to learn is to risk real money and lose it.
              That&apos;s an expensive, stressful classroom. We believe the path
              to becoming a confident, informed market participant should start
              somewhere safe.
            </p>
            <p>
              {SITE.name} is a true-to-life trading simulator for the Indian
              markets. You trade NSE &amp; BSE stocks, indices, F&amp;O and MCX
              commodities with <strong>live market data</strong> and real order
              types — but every rupee is virtual. Make every beginner mistake,
              learn from it instantly, and build real skill without losing a
              paisa.
            </p>
          </Reveal>

          <Reveal>
            <h2>What we believe</h2>
            <ul>
              <li>
                <strong>Learning should be hands-on.</strong> You don&apos;t
                learn to swim by reading about water. Practice beats theory.
              </li>
              <li>
                <strong>Risk-free first.</strong> Make your mistakes where they
                don&apos;t cost you anything.
              </li>
              <li>
                <strong>Honest by design.</strong> Realistic prices, fees and
                taxes — so what you learn actually transfers to the real market.
              </li>
              <li>
                <strong>Education, not advice.</strong> We give you the tools and
                knowledge; the decisions — and any real investing — stay with
                you.
              </li>
            </ul>
          </Reveal>
        </div>

        <div className="container" style={{ marginTop: 12 }}>
          <RevealGroup className="grid grid-4">
            {[
              ['chart', 'Trade with live data', 'Real NSE & BSE prices, charts and depth.'],
              ['fno', 'Master derivatives', 'Practise F&O and option chains safely.'],
              ['book', 'Learn structured', 'Academy lessons, quizzes and a glossary.'],
              ['trophy', 'Compete & grow', 'Tournaments, leaderboards and badges.'],
            ].map(([icon, t, d]) => (
              <RevealItem key={t}>
                <TiltCard>
                  <div className="icon">
                    <Icon name={icon} />
                  </div>
                  <h3 style={{ marginBottom: 2 }}>{t}</h3>
                  <p>{d}</p>
                </TiltCard>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* Dark "how it feels" band with a live chart */}
      <section className="section terminal zone-dark">
        <div className="floor" aria-hidden="true" />
        <div className="grid-bg" aria-hidden="true" />
        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          <div className="grid grid-2" style={{ alignItems: 'center', gap: 48 }}>
            <Reveal>
              <div>
                <span className="eyebrow">
                  <span className="dot" /> The real thing
                </span>
                <h2 style={{ marginTop: 16 }}>
                  Real prices. Real order types. Fake money.
                </h2>
                <p className="muted">
                  Everything looks and behaves like a live trading desk — the
                  charts, the depth, the fills, the P&amp;L — except the money is
                  virtual. That&apos;s what makes the practice count and the
                  mistakes painless.
                </p>
              </div>
            </Reveal>
            <Reveal direction="left" delay={0.1}>
              <TiltCard max={6}>
                <div className="tp-head">
                  <span className="tp-dot" />
                  <span className="tp-dot" />
                  <span className="tp-dot g" />
                  <span className="tp-title">NIFTY 50 · live</span>
                  <span style={{ marginLeft: 'auto' }}>
                    <SimChip label="Simulated" />
                  </span>
                </div>
                <div style={{ marginTop: 14 }}>
                  <CandleChart count={30} />
                </div>
                <div className="tp-pnl" style={{ marginTop: 14 }}>
                  <span className="label">Unrealised P&amp;L</span>
                  <span className="val">
                    <StreamNumber value={86420} format="inr" live />
                  </span>
                </div>
              </TiltCard>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container prose">
          <Reveal>
            <h2>Who we are</h2>
            <p>
              {SITE.name} is built and operated by <strong>{SITE.company}</strong>
              . We&apos;re a small team of builders and market enthusiasts based
              in India, focused on making financial literacy practical and
              approachable.
            </p>

            <h2>Important note</h2>
            <p>
              {SITE.name} is an educational simulator. It is{' '}
              <strong>not a broker</strong>, is not registered with SEBI, and
              does not facilitate real securities transactions or provide
              investment advice. See our <a href="/disclaimer">Risk Disclaimer</a>{' '}
              for details.
            </p>

            <p style={{ marginTop: 32 }}>
              Questions or feedback? We&apos;d love to hear from you —{' '}
              <a href="/contact">get in touch</a>.
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
