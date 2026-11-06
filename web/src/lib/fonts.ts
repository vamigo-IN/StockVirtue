import localFont from 'next/font/local';

/**
 * Source Serif 4, the reading face for story headlines and article text
 * (spec §3.2.1), self-hosted from src/fonts (built by
 * scripts/fonts/make_font.py from the upstream OFL file; licence beside it).
 * The files are named "SV Serif" inside (make_font.py --family): our subset
 * is a Modified Version under the OFL, which may not use the Reserved Font
 * Name "Source". CSS never sees that name; it uses next/font's family.
 * Shared by the public site and the portal's editor and preview, so writers
 * see what readers will: the portal imports `articleSerif` from this module,
 * so keep the export name and the --font-serif-sv variable.
 *
 * Archivo, the public site's UI face, lives in ./fonts-public.ts on purpose:
 * next/font preloads every font defined in a module a layout imports, so if
 * it were defined here the /admin layout (which imports this module) would
 * preload and declare Archivo too. Public code imports both faces from
 * '@/lib/fonts-public'.
 */
export const articleSerif = localFont({
  src: [
    { path: '../fonts/source-serif-sv.woff2', weight: '400 700', style: 'normal' },
    { path: '../fonts/source-serif-sv-italic.woff2', weight: '400 700', style: 'italic' },
  ],
  variable: '--font-serif-sv',
  display: 'swap',
  preload: false,
  adjustFontFallback: 'Times New Roman',
});
