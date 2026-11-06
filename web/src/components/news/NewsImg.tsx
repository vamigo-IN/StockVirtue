import type { NewsImage } from '@/news/types';

/**
 * The `sizes` presets for story images (spec §4.8), one per StoryCard
 * image slot, so every caller asks the browser for the same widths:
 * - splash: 3:2 in the main column at >= 768 (600 px at 1280+, 472 px on
 *   tablets), full-bleed 16:9 on phones. The horizontal splash uses it too.
 * - feature: 3:2 in a 3- or 2-column row.
 * - row: the 96 px square thumbnail (80 px below 768).
 * - rowLarge: the large row's 160 px 3:2 thumbnail at >= 768 (a normal
 *   80 px row below that).
 * - line: the optional 96 px thumbnail of a `line` row (>= 1024).
 */
export const SIZES = {
  splash: '(min-width: 1280px) 600px, (min-width: 768px) 472px, 100vw',
  feature: '(min-width: 1280px) 300px, (min-width: 768px) 45vw, 100vw',
  row: '96px',
  rowLarge: '(min-width: 768px) 160px, 80px',
  line: '96px',
} as const;

export type NewsImgSize = keyof typeof SIZES;

/**
 * A story image with responsive copies (srcset) straight from the media CDN.
 * The API already made WebP copies, so this skips Next's image optimiser.
 * `sizes` takes a SIZES preset (`SIZES.feature`) or any sizes string.
 */
export function NewsImg({
  image,
  sizes,
  className,
  priority = false,
}: {
  image: NewsImage;
  sizes: string;
  className?: string;
  priority?: boolean;
}) {
  const sources = image.variants.map((v) => `${v.url} ${v.width}w`);
  const widest = image.variants[image.variants.length - 1];
  if (image.width && (!widest || image.width > widest.width)) {
    sources.push(`${image.url} ${image.width}w`);
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={widest?.url ?? image.url}
      srcSet={sources.length ? sources.join(', ') : undefined}
      sizes={sources.length ? sizes : undefined}
      alt={image.alt}
      width={image.width ?? undefined}
      height={image.height ?? undefined}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : undefined}
      decoding="async"
      className={className}
    />
  );
}
