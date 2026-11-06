import type { BrandIconProps } from './types';

/**
 * The Facebook app logo (the "f" in a circle), single colour (currentColor), shape unaltered.
 *
 * Source: Meta's Facebook logo page in the Brand Resource Center,
 * https://www.meta.com/brand/resources/facebook/logo/: the page's own
 * vector, titled "Facebook app logo" (viewBox 0 0 500 500), already drawn
 * in currentColor there; the "f" is the shape's cut-out. The page's
 * Facebook-Brand-Asset-Pack.zip holds PNG and AI files only.
 * Downloaded 4 Nov 2026; the path data is copied from it byte for byte.
 * Use it as the brand's guidelines allow: one colour, unaltered, with clear
 * space around it. Decorative (aria-hidden): the link or button around it
 * carries the accessible name ("Share on WhatsApp", "StockVirtue on
 * Instagram").
 */
export function FacebookF({ size = 20, className }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 500 500"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        d="m500,250C500,111.93,388.07,0,250,0S0,111.93,0,250c0,117.24,80.72,215.62,189.61,242.64v-166.24h-51.55v-76.4h51.55v-32.92c0-85.09,38.51-124.53,122.05-124.53,15.84,0,43.17,3.11,54.35,6.21v69.25c-5.9-.62-16.15-.93-28.88-.93-40.99,0-56.83,15.53-56.83,55.9v27.02h81.66l-14.03,76.4h-67.63v171.77c123.77-14.95,219.7-120.35,219.7-248.17Z"
      />
    </svg>
  );
}
