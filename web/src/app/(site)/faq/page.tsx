import type { Metadata } from 'next';
import { FAQS, SITE } from '@/lib/site';

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
          <h1>Frequently asked questions</h1>
          <p className="lead">
            Everything you might want to know about {SITE.name}.
          </p>
        </div>
      </div>

      <section className="section">
        <div className="container" style={{ maxWidth: 760 }}>
          {FAQS.map((f) => (
            <details className="faq-item" key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
          <p className="muted center" style={{ marginTop: 28 }}>
            Still have a question?{' '}
            <a href="/contact" style={{ color: 'var(--green)', fontWeight: 600 }}>
              Contact us
            </a>
            .
          </p>
        </div>
      </section>
    </>
  );
}
