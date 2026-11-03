import type { Metadata } from 'next';
import { getSettings, privacyContact } from '@/lib/settings';
import { SITE } from '@/lib/site';
import { LegalShell } from '@/components/motion/LegalShell';

export const metadata: Metadata = {
  title: 'Terms & Conditions',
  description: `The terms and conditions governing your use of ${SITE.name}, the virtual stock-market simulator.`,
  alternates: { canonical: '/terms' },
};

const UPDATED = '3 November 2026';

export default async function TermsPage() {
  const contact = privacyContact(await getSettings());
  return (
    <LegalShell
      title="Terms & Conditions"
      updated={UPDATED}
      summary={`The terms that govern your use of ${SITE.name} — an educational simulator, not a broker.`}
    >
      <p>
            These Terms &amp; Conditions (&quot;Terms&quot;) govern your access
            to and use of the {SITE.name} mobile application and the website at{' '}
            {SITE.url} (together, the &quot;Service&quot;), operated by{' '}
            {SITE.company} (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;). By
            creating an account or using the Service, you agree to these Terms. If
            you do not agree, do not use the Service.
          </p>

          <h2>1. What {SITE.name} is — and is not</h2>
          <p>
            {SITE.name} is an <strong>educational stock-market simulator</strong>.
            It lets you place simulated trades using <strong>virtual money</strong>{' '}
            against real market data. {SITE.name} is <strong>not</strong> a stock
            broker, exchange, depository, clearing member, or investment adviser,
            and is not registered with the Securities and Exchange Board of India
            (SEBI) or any regulator. No real securities are bought or sold, and no
            real money is ever deposited, held, transferred, or withdrawn through
            the Service.
          </p>

          <h2>2. No investment advice</h2>
          <p>
            Nothing in the Service constitutes investment, financial, legal, or
            tax advice, or a recommendation to buy, sell, or hold any security.
            Any data, content, lessons, tools, or results are provided for
            education and illustration only. You are solely responsible for any
            decisions you make, including any real-world investing you choose to
            do elsewhere. Please consult a SEBI-registered investment adviser
            before making real investment decisions.
          </p>

          <h2>3. Eligibility &amp; accounts</h2>
          <ul>
            <li>You must be at least 18 years old to have an account. You confirm this when you sign up; we close accounts that belong to anyone younger.</li>
            <li>You agree to provide accurate information and to keep your login credentials secure.</li>
            <li>You are responsible for all activity under your account.</li>
            <li>You may sign in via email, Google, or phone number. How we handle that and all other personal data is explained in our <a href="/privacy">Privacy notice</a>, which you accept separately when you sign up.</li>
            <li>Leaderboards and rooms show your display name and returns to other users; choose a nickname if you prefer.</li>
          </ul>

          <h2>4. Virtual money &amp; in-app items</h2>
          <p>
            The Service provides virtual balances, points, badges, leaderboards,
            and similar items. These have <strong>no monetary value</strong>,
            cannot be exchanged for real money or securities, and may be adjusted,
            reset, or removed at any time. Referral or bonus credits are likewise
            virtual and carry no cash value.
          </p>

          <h2>5. Market data</h2>
          <p>
            Market prices and related data are obtained from third-party sources
            and may be delayed, inaccurate, or unavailable. We do not guarantee
            the accuracy, completeness, timeliness, or availability of any data,
            and the simulated environment may differ from real-market execution.
          </p>

          <h2>6. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>use the Service for any unlawful purpose or in violation of any applicable law or regulation;</li>
            <li>attempt to gain unauthorised access to the Service, other accounts, or our systems;</li>
            <li>interfere with, disrupt, reverse-engineer, scrape, or overload the Service;</li>
            <li>misrepresent the Service as real trading or as affiliated with any exchange or regulator;</li>
            <li>upload malicious code or abuse referral, competition, or reward mechanics.</li>
          </ul>

          <h2>7. Intellectual property</h2>
          <p>
            The Service, including its software, design, content, and trademarks,
            is owned by {SITE.company} or its licensors and is protected by law.
            We grant you a limited, revocable, non-exclusive, non-transferable
            licence to use the Service for personal, non-commercial education. You
            may not copy, modify, distribute, or create derivative works without
            our written permission.
          </p>

          <h2>8. Third-party services</h2>
          <p>
            The Service relies on third-party providers (e.g. Google services,
            market-data feeds, analytics, and email). Your use of those services
            may be subject to their own terms and privacy policies.
          </p>

          <h2>9. Disclaimers</h2>
          <p>
            The Service is provided &quot;as is&quot; and &quot;as available&quot;
            without warranties of any kind, whether express or implied, including
            fitness for a particular purpose, accuracy, or non-infringement. We do
            not warrant that the Service will be uninterrupted, secure, or
            error-free. See also our <a href="/disclaimer">Risk Disclaimer</a>.
          </p>

          <h2>10. Limitation of liability</h2>
          <p>
            To the maximum extent permitted by law, {SITE.company} and its
            officers, employees, and partners will not be liable for any indirect,
            incidental, special, consequential, or punitive damages, or for any
            loss of profits, data, or goodwill, arising from your use of (or
            inability to use) the Service. Because no real money is involved in
            the Service, you acknowledge that simulated outcomes carry no
            real-world financial value.
          </p>

          <h2>11. Termination and deleting your account</h2>
          <p>
            We may suspend or terminate your access for breach of these Terms or
            to protect the Service or other users. You can delete your account
            at any time in the app (Profile → Privacy &amp; your data → Delete
            my account) or through our{' '}
            <a href="/privacy/requests">privacy requests page</a>. Deletion
            takes effect at once; a locked copy is kept for one year, as the law
            requires, and then erased. Accounts unused for three years are
            erased after an email notice. Virtual balances and items end with
            the account.
          </p>

          <h2>12. Changes to these Terms</h2>
          <p>
            We may update these Terms from time to time. Material changes will be
            reflected by updating the &quot;Updated&quot; date above and, where
            they matter to you, announced in the app or by email before they
            take effect. Continued use of the Service after changes take effect
            constitutes acceptance of the revised Terms. Changes to how we use
            personal data follow our Privacy notice, which asks for your consent
            again where the law requires.
          </p>

          <h2>13. Governing law</h2>
          <p>
            These Terms are governed by the laws of India, and the courts at our
            registered place of business shall have exclusive jurisdiction,
            subject to applicable law.
          </p>

          <h2>14. Contact and grievances</h2>
          <p>
            Questions about these Terms? Contact us at{' '}
            <a href={`mailto:${SITE.email}`}>{SITE.email}</a> or via our{' '}
            <a href="/contact">contact page</a>.
          </p>
          <p>
            Complaints about personal data, or about content and conduct on the
            Service, go to our Grievance Officer
            {contact.name ? `, ${contact.name}` : ''}:{' '}
            <a href={`mailto:${contact.email}`}>{contact.email}</a>
            {contact.phone ? `, ${contact.phone}` : ''}. We reply within{' '}
            {contact.responseDays} days.
          </p>

      <p className="muted" style={{ fontSize: '0.85rem', marginTop: 32 }}>
        This document is a general template provided for convenience and does
        not constitute legal advice. Please have it reviewed by a qualified
        lawyer before relying on it.
      </p>
    </LegalShell>
  );
}
