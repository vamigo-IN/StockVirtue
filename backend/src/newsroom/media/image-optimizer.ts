import sharp from 'sharp';
import type { ImageKind } from './image-sniff';

/// The stored image's longest side: sharp at 1200 CSS pixels on 2x screens.
export const MAX_EDGE = 2400;
/** Smaller WebP copies for responsive pages and the library grid. */
export const VARIANT_WIDTHS = [480, 1200] as const;
/// ~60 megapixels: far beyond any news photo, and stops decompression bombs.
export const MAX_PIXELS = 60_000_000;

const INPUT = {
  limitInputPixels: MAX_PIXELS,
  animated: true,
  failOn: 'error' as const,
};
/** Photos (and anything animated): lossy, where WebP saves the most. */
const PHOTO = { quality: 80, effort: 5, smartSubsample: true };
/** Graphics such as charts and screenshots: lossy but gentler on edges… */
const GRAPHIC = {
  quality: 85,
  alphaQuality: 100,
  effort: 5,
  smartSubsample: true,
};
/** …or lossless, when that is about as small. */
const EXACT = { lossless: true, effort: 5 };
const LOSSLESS_ALLOWANCE = 1.1;
const VARIANT = { quality: 78, effort: 5, smartSubsample: true };

export interface WebpVariant {
  /** The width asked for (480, 1200). */
  target: number;
  width: number;
  height: number;
  data: Buffer;
}

export interface OptimizedImage {
  /** The WebP to store: the only copy of the image that is kept. */
  data: Buffer;
  width: number;
  height: number;
  /**
   * converted: re-encoded as WebP (and scaled down past MAX_EDGE);
   * kept: an uploaded WebP stored as sent, minus its metadata.
   */
  method: 'converted' | 'kept';
  lossless: boolean;
  animated: boolean;
  variants: WebpVariant[];
}

/**
 * Turns an uploaded image into the WebP files the media library keeps.
 * JPEG, PNG, GIF and AVIF are re-encoded as WebP, upright and at most
 * MAX_EDGE pixels on the long side; graphics stay lossless when that is
 * about as small as lossy. A WebP that is upright and small enough is kept
 * byte for byte, minus EXIF/XMP (camera, GPS location) and anything else
 * that isn't the picture. Re-encoding writes no metadata either. Still
 * images also get smaller copies. Throws on anything that won't decode.
 */
export async function optimizeImage(
  input: Buffer,
  kind: ImageKind,
): Promise<OptimizedImage> {
  const meta = await sharp(input, INPUT).metadata();
  const animated = (meta.pages ?? 1) > 1;
  const width = meta.width ?? 0;
  const height = animated ? (meta.pageHeight ?? 0) : (meta.height ?? 0);
  if (!width || !height) throw new Error('the image has no size');
  const upright = !meta.orientation || meta.orientation === 1;
  const fits = Math.max(width, height) <= MAX_EDGE;

  const kept =
    kind === 'webp' && upright && fits ? stripWebpMetadata(input) : null;
  let image: Omit<OptimizedImage, 'variants'>;
  if (kept) {
    // The cleaned file must still decode, every frame of it.
    await sharp(kept, INPUT).resize({ width: 32 }).toBuffer();
    image = {
      data: kept,
      width,
      height,
      method: 'kept',
      lossless: isLosslessWebp(kept),
      animated,
    };
  } else {
    image = await convert(input, kind, animated);
  }

  const variants: WebpVariant[] = [];
  if (!animated) {
    for (const target of VARIANT_WIDTHS) {
      if (target >= image.width) continue;
      const v = await sharp(input, INPUT)
        .rotate()
        .resize({ width: target })
        .webp(VARIANT)
        .toBuffer({ resolveWithObject: true });
      variants.push({
        target,
        width: v.info.width,
        height: v.info.height,
        data: v.data,
      });
    }
  }
  return { ...image, variants };
}

async function convert(
  input: Buffer,
  kind: ImageKind,
  animated: boolean,
): Promise<Omit<OptimizedImage, 'variants'>> {
  const pipeline = () => {
    let img = sharp(input, INPUT);
    // rotate() applies the EXIF orientation (animations have none).
    if (!animated) img = img.rotate();
    return img.resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      withoutEnlargement: true,
    });
  };
  const graphic =
    !animated &&
    (kind === 'png' ||
      kind === 'gif' ||
      (kind === 'webp' && isLosslessWebp(input)));
  let data = await pipeline()
    .webp(graphic ? GRAPHIC : PHOTO)
    .toBuffer();
  let lossless = false;
  if (graphic) {
    const exact = await pipeline().webp(EXACT).toBuffer();
    if (exact.length <= data.length * LOSSLESS_ALLOWANCE) {
      data = exact;
      lossless = true;
    }
  }
  const out = await sharp(data, INPUT).metadata();
  return {
    data,
    width: out.width ?? 0,
    height: animated ? (out.pageHeight ?? 0) : (out.height ?? 0),
    method: 'converted',
    lossless,
    animated,
  };
}

/** Chunks a WebP is made of; the rest (EXIF, XMP, unknown) is dropped. */
const PICTURE_CHUNKS = new Set([
  'VP8 ',
  'VP8L',
  'VP8X',
  'ALPH',
  'ANIM',
  'ANMF',
  'ICCP',
]);
/// VP8X flag bits announcing EXIF and XMP chunks.
const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

interface Chunk {
  id: string;
  start: number;
  end: number;
}

/** A WebP's chunks, or null when its structure doesn't add up. */
function webpChunks(b: Buffer): Chunk[] | null {
  if (
    b.length < 20 ||
    b.toString('latin1', 0, 4) !== 'RIFF' ||
    b.toString('latin1', 8, 12) !== 'WEBP'
  ) {
    return null;
  }
  const riffEnd = 8 + b.readUInt32LE(4);
  if (riffEnd > b.length) return null;
  const chunks: Chunk[] = [];
  let at = 12;
  while (at + 8 <= riffEnd) {
    const size = b.readUInt32LE(at + 4);
    if (at + 8 + size > riffEnd) return null;
    const end = Math.min(at + 8 + size + (size & 1), riffEnd);
    chunks.push({ id: b.toString('latin1', at, at + 4), start: at, end });
    at = end;
  }
  return chunks;
}

function isLosslessWebp(b: Buffer): boolean {
  return webpChunks(b)?.some((c) => c.id === 'VP8L') ?? false;
}

/**
 * The WebP as uploaded, minus what isn't the picture: EXIF and XMP (camera
 * details, GPS location, editing history), unknown chunks and anything after
 * the end of the file. The pixels are untouched. Null when the file's
 * structure is off, so it gets re-encoded instead.
 */
export function stripWebpMetadata(b: Buffer): Buffer | null {
  const chunks = webpChunks(b);
  if (
    !chunks?.some((c) => c.id === 'VP8 ' || c.id === 'VP8L' || c.id === 'ANMF')
  ) {
    return null;
  }
  const parts = chunks
    .filter((c) => PICTURE_CHUNKS.has(c.id))
    .map((c) => {
      let part = Buffer.from(b.subarray(c.start, c.end));
      if (c.id === 'VP8X' && part.length > 8) {
        part[8] &= ~(VP8X_EXIF | VP8X_XMP);
      }
      // Chunks are padded to an even length; the last one may have lost it.
      if (part.length % 2 === 1) part = Buffer.concat([part, Buffer.alloc(1)]);
      return part;
    });
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1');
  head.writeUInt32LE(body.length + 4, 4);
  head.write('WEBP', 8, 'latin1');
  return Buffer.concat([head, body]);
}
