import type { BrandIconProps } from './types';

/**
 * The YouTube icon (the play button), single colour (currentColor), shape
 * unaltered; the play triangle is the shape's cut-out.
 *
 * Source: Simple Icons 16.35.0 (CC0-1.0), whose YouTube icon is YouTube's
 * own mark: https://cdn.jsdelivr.net/npm/simple-icons@16.35.0/icons/youtube.svg
 * (one path, viewBox 0 0 24 24; SHA-256 of the file
 * 5038808acbbc4e6edda16cbeb1cc6dec80e4e4ee4e227e039c41229fa222aa8c).
 * brand.youtube offers no reachable download (lead decision 4).
 * Downloaded 5 Nov 2026; the path data is copied from it byte for byte.
 * Use it as the brand's guidelines allow: one colour, unaltered, with clear
 * space around it. Decorative (aria-hidden): the link around it carries the
 * accessible name ("YouTube").
 */
export function YouTubeIcon({ size = 20, className }: BrandIconProps) {
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
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}
