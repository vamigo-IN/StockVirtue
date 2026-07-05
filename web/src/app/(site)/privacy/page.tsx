import type { Metadata } from 'next';
import { SITE } from '@/lib/site';
import { GlowField } from '@/components/motion/GlowField';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: `How ${SITE.name} collects, uses, and protects your personal information.`,
  alternates: { canonical: '/privacy' },
};

const UPDATED = 'June 27, 2026';

export default function PrivacyPage() {
  return (
    <>
      <div className="page-head">
        <GlowField />
        <div className="container">
          <h1>Privacy Policy</h1>
          <p className="updated">Last updated: {UPDATED}</p>
        </div>
      </div>

      <section className="section">
        <div className="container prose">
          <p>
            This Privacy Policy explains how {SITE.company} (&quot;we&quot;,
            &quot;us&quot;) collects, uses, and protects your information when you
            use the {SITE.name} app and website (the &quot;Service&quot;). We
            respect your privacy and only collect what we need to run the Service.
          </p>

          <h2>1. Information we collect</h2>
          <ul>
            <li>
              <strong>Account information:</strong> your name, email address,
              and/or phone number, and authentication identifiers when you sign in
              with email, Google, or phone.
            </li>
            <li>
              <strong>Profile &amp; usage data:</strong> your virtual portfolio,
              simulated trades, achievements, watchlists, preferences, and
              in-app activity.
            </li>
            <li>
              <strong>Device &amp; technical data:</strong> device model, OS
              version, app version, IP address, and crash/diagnostic data.
            </li>
            <li>
              <strong>Analytics:</strong> aggregated usage events (e.g. screens
              viewed, features used) via Google Analytics for Firebase, used to
              improve the Service.
            </li>
            <li>
              <strong>Communications:</strong> messages you send us (e.g. via the
              contact form or email).
            </li>
          </ul>
          <p>
            We do <strong>not</strong> collect bank account, demat, card, or other
            real financial-transaction data, because {SITE.name} uses virtual
            money only.
          </p>

          <h2>2. How we use information</h2>
          <ul>
            <li>to create and operate your account and provide the Service;</li>
            <li>to personalise your experience and remember your preferences;</li>
            <li>to send transactional messages (e.g. verification codes, order and account notifications) and, where enabled, optional updates;</li>
            <li>to understand usage, fix bugs, and improve features;</li>
            <li>to maintain security and prevent abuse;</li>
            <li>to comply with legal obligations.</li>
          </ul>

          <h2>3. Legal bases</h2>
          <p>
            Where applicable, we process your information to perform our contract
            with you (providing the Service), based on your consent (e.g. optional
            emails, analytics where required), to pursue our legitimate interests
            (security, improvement), and to comply with the law.
          </p>

          <h2>4. Sharing your information</h2>
          <p>
            We do not sell your personal information. We share it only with:
          </p>
          <ul>
            <li>
              <strong>Service providers</strong> who help us run the Service —
              such as cloud hosting, Google/Firebase (authentication, analytics,
              push notifications), market-data providers, and email delivery —
              under appropriate confidentiality and data-processing terms;
            </li>
            <li>
              <strong>Authorities</strong>, where required by law or to protect
              our rights, users, or the public;
            </li>
            <li>
              <strong>A successor</strong> in the event of a merger, acquisition,
              or asset sale, subject to this Policy.
            </li>
          </ul>

          <h2>5. Cookies &amp; similar technologies</h2>
          <p>
            Our website may use essential cookies (e.g. to keep an admin signed
            in) and, where enabled, analytics or verification tags configured by
            us. You can control cookies through your browser settings.
          </p>

          <h2>6. Data retention</h2>
          <p>
            We retain your information for as long as your account is active or as
            needed to provide the Service, and thereafter as required for legal,
            security, or legitimate-business purposes. You can request deletion of
            your account and associated data (see &quot;Your rights&quot;).
          </p>

          <h2>7. Security</h2>
          <p>
            We use reasonable technical and organisational measures to protect your
            information, including encryption in transit and access controls. No
            method of transmission or storage is completely secure, however, and we
            cannot guarantee absolute security.
          </p>

          <h2>8. Your rights</h2>
          <p>
            Depending on your location, you may have the right to access, correct,
            update, or delete your personal information, to object to or restrict
            certain processing, and to withdraw consent. To exercise these rights,
            contact us at <a href={`mailto:${SITE.email}`}>{SITE.email}</a>.
          </p>

          <h2>9. Children</h2>
          <p>
            The Service is not directed to children under 18, and we do not
            knowingly collect their personal information. If you believe a child
            has provided us data, contact us and we will delete it.
          </p>

          <h2>10. International users</h2>
          <p>
            We operate from India. If you access the Service from elsewhere, your
            information may be processed in India and other countries where our
            providers operate.
          </p>

          <h2>11. Changes to this Policy</h2>
          <p>
            We may update this Policy from time to time. We will reflect changes by
            updating the &quot;Last updated&quot; date above and, where appropriate,
            by additional notice.
          </p>

          <h2>12. Contact</h2>
          <p>
            For privacy questions or requests, contact us at{' '}
            <a href={`mailto:${SITE.email}`}>{SITE.email}</a> or via our{' '}
            <a href="/contact">contact page</a>. Operated by {SITE.company}.
          </p>

          <p className="muted" style={{ fontSize: '0.85rem', marginTop: 32 }}>
            This document is a general template provided for convenience and does
            not constitute legal advice. Please have it reviewed by a qualified
            lawyer and tailored to your data practices and the Google Play Data
            Safety requirements.
          </p>
        </div>
      </section>
    </>
  );
}
