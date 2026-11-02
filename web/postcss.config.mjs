import { createRequire } from 'node:module';

// Tailwind CSS for the staff portal (it skips any file without Tailwind
// directives, e.g. the marketing site's globals.css), followed by the exact
// plugins and browser targets Next.js applies when a project has no PostCSS
// config, so the marketing CSS is processed exactly as before this file
// existed.
const require = createRequire(import.meta.url);
const {
  MODERN_BROWSERSLIST_TARGET,
} = require('next/dist/shared/lib/constants');

const config = {
  plugins: [
    '@tailwindcss/postcss',
    'next/dist/compiled/postcss-flexbugs-fixes',
    [
      'next/dist/compiled/postcss-preset-env',
      {
        browsers: MODERN_BROWSERSLIST_TARGET,
        autoprefixer: { flexbox: 'no-2009' },
        stage: 3,
        features: { 'custom-properties': false },
      },
    ],
  ],
};

export default config;
