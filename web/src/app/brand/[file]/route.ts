import sharp from 'sharp';
import { getSettings } from '@/lib/settings';

/**
 * The site's icon and share image when Site settings picks them from the
 * media library, in formats every device and network reads: the library
 * keeps WebP, which iPhone home-screen icons and some link previews don't
 * take. Links add ?v=<image id>, so a new image gets a new address.
 */
export const dynamic = 'force-dynamic';

type Slot = 'favicon' | 'shareImage';

const FILES: Record<
  string,
  { slot: Slot; type: string; render: (img: sharp.Sharp) => sharp.Sharp }
> = {
  'icon.png': {
    slot: 'favicon',
    type: 'image/png',
    render: (img) =>
      img
        .resize(256, 256, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png(),
  },
  'apple-icon.png': {
    slot: 'favicon',
    type: 'image/png',
    // iPhones show transparency as black.
    render: (img) =>
      img
        .resize(180, 180, { fit: 'contain', background: '#ffffff' })
        .flatten({ background: '#ffffff' })
        .png(),
  },
  'share.jpg': {
    slot: 'shareImage',
    type: 'image/jpeg',
    render: (img) =>
      img
        .resize(1200, 630, {
          fit: 'cover',
          position: sharp.strategy.attention,
        })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 85, mozjpeg: true }),
  },
};

/// A library image larger than this isn't a logo or a share picture.
const MAX_BYTES = 20 * 1024 * 1024;

type Ctx = { params: Promise<{ file: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { file } = await ctx.params;
  const spec = FILES[file];
  if (!spec) return new Response('Not found', { status: 404 });
  const image = (await getSettings()).config.branding[spec.slot];
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
  const out = await spec
    .render(sharp(input, { limitInputPixels: 60_000_000 }).rotate())
    .toBuffer();
  return new Response(new Uint8Array(out), {
    headers: {
      'content-type': spec.type,
      'cache-control':
        'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
