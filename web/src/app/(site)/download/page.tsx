import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import { Icon } from '@/components/Icon';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/Reveal';
import { TiltCard } from '@/components/motion/TiltCard';
import { MagneticButton } from '@/components/motion/MagneticButton';
import { CandleChart } from '@/components/motion/CandleChart';
import { SimChip } from '@/components/motion/Glass';

export const metadata: Metadata = {
  title: 'Download',
  description: `Download ${SITE.name} free on Google Play and start practising the Indian stock market with virtual money.`,
  alternates: { canonical: '/download' },
};

export default function DownloadPage() {
  return (
    <>
      <section className="section terminal zone-dark" style={{ paddingTop: 'clamp(3rem,7vh,5rem)' }}>
        <div className="floor" aria-hidden="true" />
        <div className="grid-bg" aria-hidden="true" />
        <div className="container" style={{ position: 'relative', zIndex: 2 }}>
          <div className="grid grid-2" style={{ alignItems: 'center', gap: 48 }}>
            <div>
              <Reveal>
                <span className="eyebrow">
                  <span className="dot" /> Free on Android
                </span>
              </Reveal>
              <Reveal delay={0.06}>
                <h1>
                  Download <span className="accent">{SITE.name}</span>
                </h1>
              </Reveal>
              <Reveal delay={0.12}>
                <p className="hero-sub">
                  Start trading the markets with virtual money in minutes — no
                  deposits, no KYC, no risk.
                </p>
              </Reveal>
              <Reveal delay={0.18}>
                <div className="hero-cta">
                  <MagneticButton
                    href={SITE.playUrl}
                    className="btn btn-primary btn-lg btn-sheen"
                  >
                    <Icon name="play" size={20} />
                    Get it on Google Play
                  </MagneticButton>
                </div>
                <p className="mono" style={{ marginTop: 16, color: 'var(--fg-faint)', fontSize: '0.82rem' }}>
                  Package: {SITE.packageId}
                </p>
              </Reveal>
            </div>

            <Reveal direction="left" delay={0.15}>
              <div className="assembly-phone" style={{ margin: '0 auto' }}>
                <div className="screen">
                  <SimChip label="Simulated" />
                  <div style={{ marginTop: 14 }}>
                    <CandleChart count={26} />
                  </div>
                  <div className="tp-pnl" style={{ marginTop: 14 }}>
                    <span className="label">Today&apos;s P&amp;L</span>
                    <span className="val" style={{ fontSize: '1.2rem' }}>
                      +₹1,24,860
                    </span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <RevealGroup className="grid grid-3">
            {[
              ['shield', '100% virtual money', 'You never deposit or withdraw real funds. Practise freely.'],
              ['chart', 'Real market data', 'Live NSE & BSE prices so your practice mirrors reality.'],
              ['trophy', 'Free forever', 'Download and trade at no cost. Learning shouldn’t be paywalled.'],
            ].map(([icon, t, d]) => (
              <RevealItem key={t}>
                <TiltCard>
                  <div className="icon">
                    <Icon name={icon} />
                  </div>
                  <h3>{t}</h3>
                  <p>{d}</p>
                </TiltCard>
              </RevealItem>
            ))}
          </RevealGroup>

          <Reveal>
            <p className="muted center" style={{ marginTop: 44, fontSize: '0.92rem' }}>
              iOS support is planned. Want to be notified?{' '}
              <a href="/contact" style={{ color: 'var(--green-600)', fontWeight: 600 }}>
                Get in touch
              </a>
              .
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
