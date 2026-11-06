import type { Metadata } from 'next';
import { DownloadView } from '@/components/site/pages/DownloadView';
import { DOWNLOAD_DEFAULT } from '@/content/site/download';
import { FAQ_DEFAULT } from '@/content/site/faq';
import { pageMetadata } from '@/lib/metadata';
import { getSettings } from '@/lib/settings';
import { getPageContent } from '@/lib/site-content/api';

/**
 * /download (spec §5.5): its content, the FAQ (for "Before you install", so
 * the page also carries the content:faq tag, addendum §7.5) and the
 * settings, in parallel; DownloadView renders them. ISR.
 */
export async function generateMetadata(): Promise<Metadata> {
  const content = await getPageContent('download', DOWNLOAD_DEFAULT);
  return pageMetadata({ title: content.seo.title, description: content.seo.description, path: '/download' });
}

export default async function DownloadPage() {
  const [content, faq, settings] = await Promise.all([
    getPageContent('download', DOWNLOAD_DEFAULT),
    getPageContent('faq', FAQ_DEFAULT),
    getSettings(),
  ]);
  return <DownloadView content={content} settings={settings} data={{ faq }} />;
}
