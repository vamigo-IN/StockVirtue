import type { Metadata } from 'next';
import { LegalShell } from '@/components/motion/LegalShell';
import { getSettings, privacyContact } from '@/lib/settings';
import { SITE } from '@/lib/site';
import { RequestForm } from './RequestForm';

export const metadata: Metadata = {
  title: 'Privacy requests and grievances',
  description: `Ask ${SITE.name} for a summary of your data, a correction, deletion, a nominee, or make a complaint, under the Digital Personal Data Protection Act, 2023.`,
  alternates: { canonical: '/privacy/requests' },
};

/**
 * Exercising privacy rights from the website (DPDP Act 2023 s.11-14; DPDP
 * Rules 2025, rule 14): how to ask, what we need to find the account, how
 * long we take, who answers, and where to go next.
 */
export default async function PrivacyRequestsPage() {
  const contact = privacyContact(await getSettings());
  return (
    <LegalShell
      title="Privacy requests and grievances"
      badge="Your rights"
      summary="Ask for a summary of your data, a correction or deletion, name a nominee, withdraw consent, or make a complaint."
    >
      <h2>The quickest way: in the app</h2>
      <p>
        Open the {SITE.name} app → Profile →{' '}
        <strong>Privacy &amp; your data</strong>. You can download your data,
        name a nominee, turn analytics off, make a request, or delete your
        account there, straight away.
      </p>

      <h2>Without the app</h2>
      <p>
        Use this form. To make sure nobody can act on someone else&apos;s data,
        we first email a code to the address registered with your account. If
        your account only has a mobile number, use the app or write to the
        grievance officer from any email address, with your number, and
        we&apos;ll confirm it&apos;s you.
      </p>
      <RequestForm />

      <h2>What happens next</h2>
      <p>
        You get an email with a reference straight away. A person on our team
        answers within <strong>{contact.responseDays} days</strong> (the law
        allows at most 90). Deleted accounts stop being used at once; a locked
        copy is kept for one year, as the DPDP Rules 2025 require, then erased
        for good.
      </p>

      <h2>Grievance officer</h2>
      <p>
        {contact.name ? `${contact.name}, ` : ''}Grievance Officer,{' '}
        {contact.legalName}
        {contact.postalAddress ? `, ${contact.postalAddress}` : ''}.{' '}
        <a href={`mailto:${contact.email}`}>{contact.email}</a>
        {contact.phone ? `, ${contact.phone}` : ''}.
      </p>
      <p>
        If you are not satisfied with our answer, you can complain to the{' '}
        <strong>Data Protection Board of India</strong>. See our{' '}
        <a href="/privacy">privacy notice</a> (
        <a href="/privacy/hi" lang="hi">
          हिंदी
        </a>
        ) for everything we do with personal data.
      </p>
    </LegalShell>
  );
}
