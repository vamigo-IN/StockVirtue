import type { Metadata } from 'next';
import { FaqView } from '@/components/site/pages/FaqView';
import { FAQ_DEFAULT } from '@/content/site/faq';
import { pageMetadata } from '@/lib/metadata';
import { getSettings } from '@/lib/settings';
import { getPageContent } from '@/lib/site-content/api';

/** /faq (spec §5.4): content and settings in parallel; FaqView renders them and the FAQPage JSON-LD. ISR. */
export async function generateMetadata(): Promise<Metadata> {
  const content = await getPageContent('faq', FAQ_DEFAULT);
  return pageMetadata({ title: content.seo.title, description: content.seo.description, path: '/faq' });
}

export default async function FaqPage() {
  const [content, settings] = await Promise.all([getPageContent('faq', FAQ_DEFAULT), getSettings()]);
  return <FaqView content={content} settings={settings} />;
}
