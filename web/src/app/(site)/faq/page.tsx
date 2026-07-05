import type { Metadata } from 'next';
import { FAQS, SITE } from '@/lib/site';
import { Icon } from '@/components/Icon';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/Reveal';
import { GlowField } from '@/components/motion/GlowField';
import { MagneticButton } from '@/components/motion/MagneticButton';

export const metadata: Metadata = {
  title: 'FAQ',
  description: `Frequently asked questions about ${SITE.name} — the virtual stock-market simulator for India.`,
  alternates: { canonical: '/faq' },
};

export default function FaqPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="page-head">
        <GlowField />
        <div className="container">
          <Reveal>
            <span className="eyebrow">
              <span className="dot" /> Good to know
            </span>
          </Reveal>
          <Reveal delay={0.06}>
            <h1>Frequently asked questions</h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="lead">
              Everything you might want to know about {SITE.name}.
            </p>
          </Reveal>
        </div>
      </div>

      <section className="section">
        <div className="container" style={{ maxWidth: 780 }}>
          <RevealGroup stagger={0.05}>
            {FAQS.map((f) => (
              <RevealItem key={f.q}>
                <details className="faq-item">
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              </RevealItem>
            ))}
          </RevealGroup>
          <Reveal>
            <div
              className="cta-band glass"
              style={{ marginTop: 36, padding: '36px 28px' }}
            >
              <div className="grid-bg" aria-hidden="true" />
              <div className="cta-inner">
                <div className="icon" style={{ margin: '0 auto 14px' }}>
                  <Icon name="mail" />
                </div>
                <h3 style={{ fontSize: '1.5rem' }}>Still have a question?</h3>
                <p className="muted" style={{ margin: '0 auto 20px', maxWidth: 420 }}>
                  We&apos;re happy to help — a real person reads every message.
                </p>
                <MagneticButton
                  href="/contact"
                  external={false}
                  className="btn btn-primary"
                >
                  <Icon name="mail" size={16} /> Contact us
                </MagneticButton>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
