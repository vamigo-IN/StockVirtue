import type { BrandIconProps } from './types';

/**
 * The X logo, single colour (currentColor), shape unaltered.
 *
 * Source: Simple Icons 16.35.0 (CC0-1.0), whose X icon is X's own mark:
 * https://cdn.jsdelivr.net/npm/simple-icons@16.35.0/icons/x.svg
 * (one path, viewBox 0 0 24 24; SHA-256 of the file
 * 693e68863eceb8dc9f72e2acd386ab9c20a10858dab2c076212f7084cb7a32fe).
 * X's own brand toolkit sits behind a browser check (lead decision 4).
 * Downloaded 5 Nov 2026; the path data is copied from it byte for byte.
 * Use it as the brand's guidelines allow: one colour, unaltered, with clear
 * space around it. Decorative (aria-hidden): the link or button around it
 * carries the accessible name ("X", "Share on X").
 */
export function XLogo({ size = 20, className }: BrandIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
    </svg>
  );
}
