/**
 * Brand icons for the footer's social links and the story ShareBar (spec
 * §4.5, §4.9; plan §1.3): single-colour SVGs in currentColor, each copied
 * from the brand's own brand-resources page, or, for X and YouTube, from
 * Simple Icons (CC0), whose X and YouTube icons are the brands' own marks
 * (the source URL is in each file). lucide-react has no brand icons, and its
 * `X` is the close glyph.
 *
 * XLogo and YouTubeIcon come from Simple Icons 16.35.0 (5 Nov 2026), because
 * about.x.com's brand toolkit sits behind a browser check and brand.youtube
 * offers no reachable download (M0.4 report, lead decision 4). Never draw,
 * trace or guess a logo: add a brand here only from an official file.
 */
export { FacebookF } from './FacebookF';
export { InstagramGlyph } from './InstagramGlyph';
export { LinkedInBug } from './LinkedInBug';
export { WhatsAppGlyph } from './WhatsAppGlyph';
export { XLogo } from './XLogo';
export { YouTubeIcon } from './YouTubeIcon';
export type { BrandIconProps } from './types';
