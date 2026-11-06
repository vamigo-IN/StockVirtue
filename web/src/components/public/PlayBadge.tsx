import { cn } from '@/lib/utils';

/**
 * Google's official English "Get it on Google Play" badge (spec §4.6),
 * unmodified: public/badges/google-play.png, downloaded from Google's
 * badge page (plan §1.3). Server-safe.
 *
 * The file is 646 × 250 with a 41 px transparent margin around the
 * 564 × 168 visible badge. The link (`.sv-play` in public.css) crops that
 * margin, so the VISIBLE badge is 48 px tall (52 px below 768 px, and 52 px
 * everywhere at `size="lg"`, the /download hero) and lines up with the
 * text beside it. The image shown is about 3.5 times the file's density at
 * 48 px, so one file serves 1x and 2x screens.
 *
 * - The link's accessible name is the image's alt, "Get it on Google
 *   Play"; it opens the Play listing in a new tab (rel="noopener").
 * - Keep at least a quarter of the badge's height clear around it
 *   (Google's clear space: 12 px at 48, 13 px at 52).
 * - Put `PlayTrademark` once per page, under the last badge.
 * - It is never replaced by a button (R13): "Get it on Google Play" is
 *   only ever the badge's name.
 */
export function PlayBadge({
  href,
  size = 'md',
  className,
}: {
  /** The Play listing: playStoreUrl(settings) from '@/lib/metadata'. */
  href: string;
  /** md: 48 px (52 below 768); lg: 52 px everywhere. */
  size?: 'md' | 'lg';
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={cn('sv-play', className)}
      data-size={size === 'lg' ? 'lg' : undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a fixed 4.9 KB badge; next/image would add client JS */}
      <img
        src="/badges/google-play.png"
        width={646}
        height={250}
        alt="Get it on Google Play"
        decoding="async"
      />
    </a>
  );
}

/**
 * The trademark line Google's badge rules require (spec §4.6): `meta`,
 * `--sv-fg-3`. Once per page, under the last badge.
 */
export function PlayTrademark({ className }: { className?: string }) {
  return (
    <p className={cn('t-meta text-fg-3', className)}>
      Google Play and the Google Play logo are trademarks of Google LLC.
    </p>
  );
}
