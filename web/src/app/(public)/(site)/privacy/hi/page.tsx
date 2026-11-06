import type { Metadata } from 'next';
import { LegalPage } from '@/components/site-content/LegalDocument';
import { getLegalDoc } from '@/lib/site-content/api';
import { legalMetadata } from '@/lib/site-content/legal-metadata';

/**
 * /privacy/hi, the Hindi privacy notice (spec §5.7; W7 addendum §4.3, §4.6),
 * from the live revision the API serves. LegalShell lang="hi" puts lang on
 * the H1, the meta line, the summary and the body. Breadcrumbs (B-9):
 * Privacy notice / गोपनीयता सूचना, the second item in Hindi. Metadata:
 * canonical /privacy/hi and the same hreflang pair as /privacy. ISR.
 */
export async function generateMetadata(): Promise<Metadata> {
  return legalMetadata(await getLegalDoc('privacy-hi'));
}

export default async function PrivacyHindiPage() {
  const doc = await getLegalDoc('privacy-hi');
  return (
    <LegalPage
      doc={doc}
      breadcrumbs={[
        { name: 'Privacy notice', href: '/privacy' },
        { name: doc.content.title, lang: 'hi' },
      ]}
    />
  );
}
