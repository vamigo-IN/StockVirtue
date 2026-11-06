import type { Metadata } from 'next';
import { AboutView } from '@/components/site/pages/AboutView';
import { ABOUT_DEFAULT } from '@/content/site/about';
import { pageMetadata } from '@/lib/metadata';
import { getSettings } from '@/lib/settings';
import { getPageContent } from '@/lib/site-content/api';

/** /about (spec §5.3): content and settings in parallel; AboutView renders them. ISR. */
export async function generateMetadata(): Promise<Metadata> {
  const content = await getPageContent('about', ABOUT_DEFAULT);
  return pageMetadata({ title: content.seo.title, description: content.seo.description, path: '/about' });
}

export default async function AboutPage() {
  const [content, settings] = await Promise.all([getPageContent('about', ABOUT_DEFAULT), getSettings()]);
  return <AboutView content={content} settings={settings} />;
}
