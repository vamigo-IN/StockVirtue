import type { Metadata } from 'next';
import { FAQS, SITE } from '@/lib/site';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/Reveal';

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
            <p className="muted center" style={{ marginTop: 30 }}>
              Still have a question?{' '}
              <a href="/contact" style={{ color: 'var(--green-600)', fontWeight: 600 }}>
                Contact us
              </a>
              .
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
