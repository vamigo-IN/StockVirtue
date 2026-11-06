import localFont from 'next/font/local';

/**
 * The public faces for the root 404 only (src/app/not-found.tsx, spec
 * §5.8): the same files and settings as ./fonts-public.ts, declared from a
 * module of its own.
 *
 * Why a second declaration: next/font emits each declaration's @font-face
 * and variable class as a CSS file, and Next 15.5 gives a CSS file to only
 * one of the entries that import it. The (public) layout claims the ones
 * from ./fonts-public.ts, so the root not-found would get no faces (and no
 * variables) on Windows builds; see src/app/not-found.css. next/font needs
 * literal options, so they are repeated here: keep them in step with
 * ./fonts-public.ts.
 *
 * `preload: false`: the root not-found sits in every route's tree, and only
 * a 404 needs these faces. The 404 sets the same variables, so public.css
 * reads them unchanged.
 */
export const hanken404 = localFont({
  src: [{ path: '../fonts/hanken-grotesk-sv.woff2', weight: '400 800', style: 'normal' }],
  variable: '--font-hanken',
  display: 'swap',
  preload: false,
  adjustFontFallback: 'Arial',
});

export const svMono404 = localFont({
  src: [
    { path: '../fonts/sv-mono-400.woff2', weight: '400', style: 'normal' },
    { path: '../fonts/sv-mono-500.woff2', weight: '500', style: 'normal' },
    { path: '../fonts/sv-mono-600.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-sv-mono',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  fallback: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'Menlo', 'monospace'],
});

export const svRupee404 = localFont({
  src: [{ path: '../fonts/sv-rupee.woff2', weight: '400 700', style: 'normal' }],
  variable: '--font-sv-rupee',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'unicode-range', value: 'U+20B9' }],
});

/** The three variable classes for the 404's wrapper. */
export const fontVars404 = `${hanken404.variable} ${svMono404.variable} ${svRupee404.variable}`;
