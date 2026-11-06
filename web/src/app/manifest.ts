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
    // The paper colour, as the root layout's themeColor (spec §2.4); the
    // admin's theme colour still overrides theme_color, as it does there.
    background_color: '#F6F5F1',
    theme_color: themeColor || '#F6F5F1',
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
