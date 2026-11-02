/**
 * Storage keys. Library files are "media/<yyyy>/<mm>/<uuid>.<ext>" with their
 * resized copies beside them ("…-w480.webp"). An upload waits under
 * "incoming/<asset id>" until it has been checked and cleaned, and only
 * library files are ever served, so nothing unchecked reaches a reader.
 */
export const MEDIA_FILE =
  /^media\/\d{4}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:-w\d{2,4})?\.(jpg|png|webp|gif|avif)$/;

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
};

/** Content type of a servable library file, or null for any other key. */
export function mediaContentType(key: string): string | null {
  const m = MEDIA_FILE.exec(key);
  return m ? CONTENT_TYPES[m[1]] : null;
}

export const incomingKey = (assetId: string) => `incoming/${assetId}`;
