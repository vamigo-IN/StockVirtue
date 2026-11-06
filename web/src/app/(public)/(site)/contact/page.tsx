import type { Metadata } from 'next';
import { ContactView } from '@/components/site/pages/ContactView';
import { CONTACT_DEFAULT } from '@/content/site/contact';
import { pageMetadata } from '@/lib/metadata';
import { getSettings } from '@/lib/settings';
import { getPageContent } from '@/lib/site-content/api';

/** /contact (spec §5.6): content and settings in parallel; ContactView renders them. ISR (the form posts a server action). */
export async function generateMetadata(): Promise<Metadata> {
  const content = await getPageContent('contact', CONTACT_DEFAULT);
  return pageMetadata({ title: content.seo.title, description: content.seo.description, path: '/contact' });
}

export default async function ContactPage() {
  const [content, settings] = await Promise.all([getPageContent('contact', CONTACT_DEFAULT), getSettings()]);
  return <ContactView content={content} settings={settings} />;
}
