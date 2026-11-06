// The Arial fallback overrides for the static stage faces, computed exactly
// as next/font computes them for its own files (Next's bundled fontkit and
// getFallbackMetricsFromFontFile: the average width of a letter-frequency
// sample against Arial's, then ascent/descent/line gap scaled to match).
// The values go into the "Archivo Stage N Fallback" @font-face rules in
// src/app/(public)/public.css; rerun this whenever a stage file is rebuilt.
//
// usage (from web/): node scripts/fonts/fallback-metrics.mjs public/fonts/archivo-stage1.v1.woff2 public/fonts/archivo-stage2.v1.woff2
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const fontkit = require('next/dist/compiled/@next/font/dist/fontkit').default;
const fontFromBuffer = fontkit.default || fontkit;
const {
  getFallbackMetricsFromFontFile,
} = require('next/dist/compiled/@next/font/dist/local/get-fallback-metrics-from-font-file');

for (const file of process.argv.slice(2)) {
  const font = fontFromBuffer(fs.readFileSync(file));
  const m = getFallbackMetricsFromFontFile(font, 'sans-serif');
  console.log(
    `${file}: src: local("${m.fallbackFont}"); size-adjust: ${m.sizeAdjust}; ` +
      `ascent-override: ${m.ascentOverride}; descent-override: ${m.descentOverride}; ` +
      `line-gap-override: ${m.lineGapOverride};`,
  );
}
