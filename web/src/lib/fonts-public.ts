import localFont from 'next/font/local';

/**
 * The public site's self-hosted faces (Emerald Terminal, 6 Nov 2026).
 * Nothing here is fetched from Google Fonts: the files in src/fonts are
 * subsets of the upstream OFL fonts (licences beside them), built by
 * redesign/fontwork/et-scripts/make_et_fonts.py.
 *
 * - `hanken`: Hanken Grotesk, variable wght 400–800, for all text and
 *   headings. It has no rupee sign (U+20B9) and no tabular figures.
 * - `svMono`: IBM Plex Mono 400/500/600 (renamed "SV Mono" inside: the
 *   licence reserves the name "Plex" for unmodified files). Every number,
 *   the ticker, table figures and small labels. Monospaced, so its figures
 *   are tabular by construction, and it has its own ₹.
 * - `svRupee`: the one ₹ glyph from IBM Plex Sans (wght 400–700), declared
 *   with unicode-range U+20B9 and placed FIRST in the sans stack
 *   (public.css), so Hanken text gets a real rupee sign instead of a
 *   platform fallback. Browsers fetch it only when a page shows a ₹.
 *
 * Their CSS variables (--font-hanken, --font-sv-mono, --font-sv-rupee) go
 * on #sv-public (src/app/(public)/layout.tsx), never on <html>. Only public
 * layouts import this module, so the portal never declares or preloads
 * them. The root 404 declares the same faces from ./fonts-404.ts.
 *
 * `articleSerif` (Source Serif, shared with the portal) is still exported
 * and its class still sits on #sv-public, because dropping it changes how
 * Next merges the CSS chunks (see src/app/not-found.tsx); public.css points
 * its variable at the sans stack, so the public site never downloads it.
 */
export const hanken = localFont({
  src: [{ path: '../fonts/hanken-grotesk-sv.woff2', weight: '400 800', style: 'normal' }],
  variable: '--font-hanken',
  display: 'swap',
  preload: true,
  adjustFontFallback: 'Arial',
});

export const svMono = localFont({
  src: [
    { path: '../fonts/sv-mono-400.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/sv-mono-500.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/sv-mono-600.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-sv-mono',
  display: 'swap',
  preload: true,
  adjustFontFallback: false,
  fallback: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'Menlo', 'monospace'],
});

export const svRupee = localFont({
  src: [{ path: '../fonts/sv-rupee.woff2', weight: '400 700', style: 'normal' }],
  variable: '--font-sv-rupee',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+20B9' }],
});

/** The three variable classes, for #sv-public and the root 404's wrapper. */
export const publicFontVars = `${hanken.variable} ${svMono.variable} ${svRupee.variable}`;

export { articleSerif } from './fonts';
