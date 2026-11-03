import sharp from 'sharp';
import { getArticle } from '@/news/api';
import { SHARE_SIZES, type ShareSize } from '@/news/seo';

/**
 * A story's featured image cropped to the sizes search engines and social
 * networks ask for: og.jpg (1200×630, Open Graph and X) and 16x9.jpg,
 * 4x3.jpg, 1x1.jpg (Google's article images). Cropped around the most
 * interesting part of the photo, made once per story and cached.
 */
export const dynamic = 'force-static';
export const revalidate = 86_400;

/** Rendered on first request, like the stories themselves. */
export function generateStaticParams() {
  return [];
}

/// A featured image larger than this isn't a news photo.
const MAX_BYTES = 20 * 1024 * 1024;

type Ctx = { params: Promise<{ slug: string; size: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { slug, size } = await ctx.params;
  const box = SHARE_SIZES[size as ShareSize];
  if (!box) return new Response('Not found', { status: 404 });
  const article = await getArticle(slug);
  const image = article ? (article.seo.image ?? article.image) : null;
  if (!image) return new Response('Not found', { status: 404 });
  let input: Buffer;
  try {
    const res = await fetch(image.url, {
      signal: AbortSignal.timeout(10_000),
      next: { revalidate: 86_400 },
    });
    if (!res.ok) return new Response('Image unavailable', { status: 502 });
    input = Buffer.from(await res.arrayBuffer());
  } catch {
    return new Response('Image unavailable', { status: 502 });
  }
  if (input.length > MAX_BYTES) {
    return new Response('Image too large', { status: 502 });
  }
  const out = await sharp(input, { limitInputPixels: 60_000_000 })
    .rotate()
    .resize(box.width, box.height, {
      fit: 'cover',
      position: sharp.strategy.attention,
    })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
  return new Response(new Uint8Array(out), {
    headers: {
      'content-type': 'image/jpeg',
      'cache-control':
        'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
    },
  });
}
