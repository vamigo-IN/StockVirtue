import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import { Icon } from '@/components/Icon';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/Reveal';
import { TiltCard } from '@/components/motion/TiltCard';

export const metadata: Metadata = {
  title: 'About Us',
  description: `Learn about ${SITE.name} — our mission to make stock-market education accessible, practical and risk-free for everyone in India.`,
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <>
      <div className="page-head">
        <div className="container">
          <Reveal>
            <span className="eyebrow">
              <span className="dot" /> Our mission
            </span>
          </Reveal>
          <Reveal delay={0.06}>
            <h1>About {SITE.name}</h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="lead">
              We&apos;re on a mission to make stock-market education practical,
              accessible and completely risk-free.
            </p>
          </Reveal>
        </div>
      </div>

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
              types — but every rupee is virtual. You can make every beginner
              mistake, learn from it instantly, and build real skill without
              losing a paisa.
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
                <strong>Education, not advice.</strong> We give you tools and
                knowledge; the decisions — and any real investing — stay with
                you.
              </li>
            </ul>
          </Reveal>
        </div>

        <div className="container" style={{ marginTop: 8 }}>
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

        <div className="container prose" style={{ marginTop: 40 }}>
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
