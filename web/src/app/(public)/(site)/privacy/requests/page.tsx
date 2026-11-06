import type { Metadata } from 'next';
import { LegalPage } from '@/components/site-content/LegalDocument';
import { getLegalDoc } from '@/lib/site-content/api';
import { legalMetadata } from '@/lib/site-content/legal-metadata';
import { RequestForm } from './RequestForm';

/**
 * /privacy/requests (spec §5.7; W7 addendum §3.8, §4.4): how to exercise
 * privacy rights from the website (DPDP Act 2023 s.11-14; DPDP Rules 2025,
 * rule 14). The text comes from the live revision the API serves; the
 * request form is the page's own island, placed where the document's
 * `requestForm` block sits. No "Updated" date, as before. Breadcrumbs (B-9):
 * Privacy notice / Privacy requests and grievances. ISR.
 */
export async function generateMetadata(): Promise<Metadata> {
  return legalMetadata(await getLegalDoc('privacy-requests'));
}

export default async function PrivacyRequestsPage() {
  const doc = await getLegalDoc('privacy-requests');
  return (
    <LegalPage
      doc={doc}
      showUpdated={false}
      breadcrumbs={[{ name: 'Privacy notice', href: '/privacy' }, { name: doc.content.title }]}
      islands={{ requestForm: <RequestForm /> }}
    />
  );
}
