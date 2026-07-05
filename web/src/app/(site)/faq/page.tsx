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
        <div className="container faq-grid">
          <Reveal className="faq-side">
            <div>
              <h2 style={{ fontSize: '1.7rem' }}>Questions &amp; answers</h2>
              <p className="muted">
                The essentials about how {SITE.name} works. Can&apos;t find your
                answer? We&apos;re one message away.
              </p>
              <div className="card" style={{ marginTop: 20 }}>
                <div className="icon">
                  <Icon name="mail" />
                </div>
                <h3 style={{ marginBottom: 4 }}>Still curious?</h3>
                <p className="muted" style={{ marginBottom: 16 }}>
                  A real person reads every message and replies.
                </p>
                <MagneticButton
                  href="/contact"
                  external={false}
                  className="btn btn-primary btn-block"
                >
                  <Icon name="mail" size={16} /> Contact us
                </MagneticButton>
              </div>
            </div>
          </Reveal>

          <RevealGroup className="faq-list" stagger={0.05}>
            {FAQS.map((f) => (
              <RevealItem key={f.q}>
                <details className="faq-item">
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>
    </>
  );
}
