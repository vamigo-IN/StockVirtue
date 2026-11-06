import type { Metadata } from 'next';
import { NoticeCookieSettings } from '@/components/consent/NoticeCookieSettings';
import { LegalPage } from '@/components/site-content/LegalDocument';
import { getLegalDoc } from '@/lib/site-content/api';
import { legalMetadata } from '@/lib/site-content/legal-metadata';

/**
 * /privacy, the privacy notice (spec §5.7; W7 addendum §4). The text, the
 * dates and the token values (officer, legal name, address, response days,
 * the services in use) come from the live revision the API serves; the
 * chrome still reads Settings in the layout. The Cookie settings button is
 * the page's own island (shown only while optional services are on), and
 * a module of its own (NoticeCookieSettings: see why there).
 * Metadata: canonical /privacy and the hreflang pair with /privacy/hi. ISR.
 */
export async function generateMetadata(): Promise<Metadata> {
  return legalMetadata(await getLegalDoc('privacy'));
}

export default async function PrivacyPage() {
  const doc = await getLegalDoc('privacy');
  return <LegalPage doc={doc} islands={{ cookieSettings: <NoticeCookieSettings /> }} />;
}
