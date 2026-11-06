import type { Metadata } from 'next';
import { LegalPage } from '@/components/site-content/LegalDocument';
import { getLegalDoc } from '@/lib/site-content/api';
import { legalMetadata } from '@/lib/site-content/legal-metadata';

/**
 * /disclaimer, the Risk Disclaimer (spec §5.7; W7 addendum §4), from the
 * live revision the API serves. The seed keeps today's "June 27, 2026"
 * label until the first real edit moves the date (§4.5). ISR.
 */
export async function generateMetadata(): Promise<Metadata> {
  return legalMetadata(await getLegalDoc('disclaimer'));
}

export default async function DisclaimerPage() {
  return <LegalPage doc={await getLegalDoc('disclaimer')} />;
}
