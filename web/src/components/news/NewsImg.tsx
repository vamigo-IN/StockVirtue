import type { NewsImage } from '@/news/types';

/**
 * A story image with responsive copies (srcset) straight from the media CDN.
 * The API already made WebP copies, so this skips Next's image optimiser.
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
