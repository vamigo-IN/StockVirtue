/** Image formats the newsroom accepts. SVG is deliberately absent: it can carry scripts. */
export type ImageKind = 'jpeg' | 'png' | 'webp' | 'gif' | 'avif';

export const IMAGE_MIME: Record<ImageKind, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

export const IMAGE_EXT: Record<ImageKind, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  gif: 'gif',
  avif: 'avif',
};

export const KIND_BY_MIME: Record<string, ImageKind> = Object.fromEntries(
  Object.entries(IMAGE_MIME).map(([kind, mime]) => [mime, kind as ImageKind]),
);

/**
 * What a file really is, from its first bytes. A renamed or mislabelled file
 * (e.g. HTML saved as .png) is caught here, whatever the browser claimed.
 */
export function sniffImage(b: Buffer): ImageKind | null {
  const ascii = (from: number, to: number) =>
    b.subarray(from, to).toString('latin1');
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return 'jpeg';
  if (
    b.length >= 8 &&
    b
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (b.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a'))
    return 'gif';
  if (b.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP')
    return 'webp';
  if (
    b.length >= 12 &&
    ascii(4, 8) === 'ftyp' &&
    ['avif', 'avis'].includes(ascii(8, 12))
  ) {
    return 'avif';
  }
  return null;
}
