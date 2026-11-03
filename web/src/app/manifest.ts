import type { MetadataRoute } from 'next';
import { getSettings } from '@/lib/settings';
import { SITE } from '@/lib/site';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const s = await getSettings();
  const { favicon, themeColor } = s.config.branding;
  return {
    name: s.siteTitle || SITE.name,
    short_name: SITE.name,
    description: s.siteDescription || SITE.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: themeColor || '#16a34a',
    icons: [
      {
        // A favicon from the media library comes as PNG through /brand.
        src: favicon ? `/brand/icon.png?v=${favicon.id}` : '/icon.png',
        sizes: '256x256',
        type: 'image/png',
      },
    ],
  };
}
