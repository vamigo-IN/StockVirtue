import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import { getSettings } from '@/lib/settings';
import { Icon } from '@/components/Icon';
import { ContactForm } from './ContactForm';
import { Reveal } from '@/components/motion/Reveal';
import { GlowField } from '@/components/motion/GlowField';
import { Sparkline } from '@/components/motion/Sparkline';

export const metadata: Metadata = {
  title: 'Contact',
  description: `Get in touch with the ${SITE.name} team — questions, feedback, support and partnerships.`,
  alternates: { canonical: '/contact' },
};

export default async function ContactPage() {
  const settings = await getSettings();
  const email = settings.contactEmail || SITE.email;
  return (
    <>
      <div className="page-head">
        <GlowField />
        <div className="container">
          <Reveal>
            <span className="eyebrow">
              <span className="dot" /> We read every message
            </span>
          </Reveal>
          <Reveal delay={0.06}>
            <h1>
              Let&apos;s <span className="accent">talk</span>
            </h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="lead">
              Questions, feedback, or just want to say hi? A real person reads
              every message and replies.
            </p>
          </Reveal>
        </div>
      </div>

      <section className="section">
        <div
          className="container grid grid-2"
          style={{ alignItems: 'start', gap: 40 }}
        >
          <Reveal>
            <div className="card">
              <ContactForm />
            </div>
          </Reveal>

          <Reveal delay={0.08} direction="left">
            <div style={{ display: 'grid', gap: 18 }}>
              <div className="card" style={{ position: 'relative', overflow: 'hidden' }}>
                <span
                  className="eyebrow"
                  style={{ marginBottom: 12 }}
                >
                  <span className="dot" /> Usually replies within a day
                </span>
                <h3>Email us directly</h3>
                <p className="muted" style={{ marginBottom: 14 }}>
                  Prefer email? Write to us and we&apos;ll get back as soon as we
                  can.
                </p>
                <a href={`mailto:${email}`} className="btn btn-primary">
                  <Icon name="mail" size={18} /> {email}
                </a>
                <div style={{ marginTop: 18, opacity: 0.7 }}>
                  <Sparkline points={[6, 8, 7, 11, 10, 14, 13, 17]} height={30} />
                </div>
              </div>

              <div className="card">
                <div className="icon">
                  <Icon name="book" />
                </div>
                <h3 style={{ marginBottom: 4 }}>Looking for help?</h3>
                <p className="muted">
                  Many common questions are answered on our{' '}
                  <a
                    href="/faq"
                    style={{ color: 'var(--green-600)', fontWeight: 600 }}
                  >
                    FAQ page
                  </a>
                  .
                </p>
              </div>

              <div className="card">
                <div className="icon">
                  <Icon name="shield" />
                </div>
                <h3 style={{ marginBottom: 4 }}>Operated by</h3>
                <p className="muted">
                  {SITE.company} · Made in India 🇮🇳
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
