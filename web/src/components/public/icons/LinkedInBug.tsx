import type { BrandIconProps } from './types';

/**
 * The LinkedIn [in] bug, single colour (currentColor), shape unaltered.
 *
 * Source: LinkedIn's brand downloads page, https://brand.linkedin.com/downloads:
 * the page's own vector of the [in] logo (the symbol "inbug-blue-48",
 * titled "LinkedIn logo", viewBox 0 0 48 48), its fill #0a66c2 replaced by
 * currentColor. The page's "Download [in] Logo" zip (in-logo.zip) holds
 * PNGs only, so the vector comes from the same page.
 * Downloaded 4 Nov 2026; the path data is copied from it byte for byte.
 * Use it as the brand's guidelines allow: one colour, unaltered, with clear
 * space around it. Decorative (aria-hidden): the link or button around it
 * carries the accessible name ("Share on WhatsApp", "StockVirtue on
 * Instagram").
 */
export function LinkedInBug({ size = 20, className }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path
        d="m44.4 0h-40.9c-1.9 0-3.5 1.5-3.5 3.5v41.1c0 1.9 1.6 3.4 3.5 3.4h40.9c1.9 0 3.5-1.5 3.6-3.5v-41c0-2-1.6-3.5-3.6-3.5zm-30.2 40.9h-7.1v-22.9h7.1v22.9zm-3.5-26c-2.3 0-4.1-1.8-4.1-4.1s1.8-4.1 4.1-4.1 4.1 1.8 4.1 4.1c0 2.2-1.8 4.1-4.1 4.1zm30.2 26h-7.1v-11.1c0-2.7 0-6.1-3.7-6.1s-4.3 2.9-4.3 5.9v11.3h-7.1v-22.9h6.8v3.1h0.1c1-1.8 3.3-3.7 6.7-3.7 7.2 0 8.5 4.7 8.5 10.9v12.6z"
      />
    </svg>
  );
}
