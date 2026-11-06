/**
 * The chrome's small glyphs, drawn inline (spec §4.1, §4.3, §4.14). The
 * path data is lucide's (lucide-react 1.66.0, ISC licence): `search`,
 * `menu` and `chevron-down`. They are inline SVG rather than lucide-react
 * imports so that StaticHeader, which the server-only root 404 renders,
 * shares them with SiteHeader without pulling a client module into the 404,
 * and so the brand bar looks the same in both. Server-safe: no hooks, no
 * 'use client'. Decorative: the link or button around each one carries the
 * accessible name.
 */

type GlyphProps = { className?: string; size?: number };

function Glyph({
  className,
  size = 20,
  children,
}: GlyphProps & { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  );
}

/** lucide `search`. */
export function SearchGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="m21 21-4.34-4.34" />
      <circle cx="11" cy="11" r="8" />
    </Glyph>
  );
}

/** lucide `menu`. */
export function MenuGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="M4 5h16" />
      <path d="M4 12h16" />
      <path d="M4 19h16" />
    </Glyph>
  );
}

/** lucide `chevron-down`. */
export function ChevronDownGlyph(p: GlyphProps) {
  return (
    <Glyph {...p}>
      <path d="m6 9 6 6 6-6" />
    </Glyph>
  );
}
