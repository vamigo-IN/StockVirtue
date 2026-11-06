import type { Metadata } from 'next';
import { LegalPage } from '@/components/site-content/LegalDocument';
import { getLegalDoc } from '@/lib/site-content/api';
import { legalMetadata } from '@/lib/site-content/legal-metadata';

/**
 * /terms, the Terms & Conditions (spec §5.7; W7 addendum §4), from the live
 * revision the API serves, with the values it recorded (officer, response
 * days; the seed keeps SITE's company and email). ISR.
 */
export async function generateMetadata(): Promise<Metadata> {
  return legalMetadata(await getLegalDoc('terms'));
}

export default async function TermsPage() {
  return <LegalPage doc={await getLegalDoc('terms')} />;
}
