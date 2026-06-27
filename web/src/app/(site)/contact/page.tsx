import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import { getSettings } from '@/lib/settings';
import { Icon } from '@/components/Icon';
import { ContactForm } from './ContactForm';

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
        <div className="container">
          <h1>Contact us</h1>
          <p className="lead">
            Questions, feedback, or just want to say hi? We read every message.
          </p>
        </div>
      </div>

      <section className="section">
        <div className="container grid grid-2" style={{ alignItems: 'start' }}>
          <div className="card">
            <ContactForm />
          </div>
          <div>
            <h3>Other ways to reach us</h3>
            <p className="muted">
              Prefer email? Write to us directly and we&apos;ll respond as soon
              as we can.
            </p>
            <a
              href={`mailto:${email}`}
              className="btn btn-ghost"
              style={{ marginTop: 8 }}
            >
              <Icon name="mail" size={18} /> {email}
            </a>
            <div style={{ marginTop: 28 }}>
              <h3>Looking for help?</h3>
              <p className="muted">
                Many common questions are answered on our{' '}
                <a href="/faq" style={{ color: 'var(--green)', fontWeight: 600 }}>
                  FAQ page
                </a>
                .
              </p>
            </div>
            <div style={{ marginTop: 28 }}>
              <h3>Operated by</h3>
              <p className="muted">{SITE.company}</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
