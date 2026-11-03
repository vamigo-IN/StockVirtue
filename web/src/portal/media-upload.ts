import { api, ApiError, apiUpload } from './api';
import { formatBytes } from './format';
import type { MediaAsset } from './types';

export const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];

const FORMAT: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
  'image/avif': 'AVIF',
};

/**
 * Uploads one image to the media library. The file goes to our server
 * through the portal, which checks it and stores only a WebP made from it (a
 * WebP is kept as sent, minus hidden metadata), with smaller copies, in
 * Cloudflare R2 or on the server. The file as sent is never stored.
 */
export async function uploadImage(file: File): Promise<MediaAsset> {
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new ApiError(
      400,
      `"${file.name}" isn't a JPEG, PNG, WebP, GIF or AVIF image.`,
    );
  }
  const start = await api<{ asset: MediaAsset }>('staff/media/uploads', {
    method: 'POST',
    body: { filename: file.name, contentType: file.type, bytes: file.size },
  });
  const sent = await apiUpload<Partial<MediaAsset> | null>(
    `staff/media/${start.asset.id}/content`,
    file,
    file.type,
  );
  // The upload is finished when the file arrives; older APIs need a nudge.
  if (sent?.status === 'READY') return sent as MediaAsset;
  return api<MediaAsset>(`staff/media/${start.asset.id}/complete`, {
    method: 'POST',
  });
}

/** "PNG 3.2 MB → WebP 410 KB (87% smaller)" for an image stored as WebP. */
export function optimisationNote(a: MediaAsset): string | null {
  if (!a.sourceType || !a.sourceBytes) return null;
  const saved = Math.round((1 - a.bytes / a.sourceBytes) * 100);
  if (a.sourceType === 'image/webp' && saved <= 0) {
    return `WebP, stored as uploaded (${formatBytes(a.bytes)})`;
  }
  const from = FORMAT[a.sourceType] ?? a.sourceType;
  return `${from} ${formatBytes(a.sourceBytes)} → WebP ${formatBytes(a.bytes)}${saved > 0 ? ` (${saved}% smaller)` : ''}`;
}

/** What to tell someone whose upload just finished. */
export function uploadedMessage(done: MediaAsset[]): string {
  const what = `Uploaded ${done.length} image${done.length === 1 ? '' : 's'}`;
  if (done.length === 1) {
    const note = optimisationNote(done[0]);
    return note ? `${what}: ${note}.` : `${what}.`;
  }
  const from = done.reduce((t, a) => t + (a.sourceBytes ?? a.bytes), 0);
  const to = done.reduce((t, a) => t + a.bytes, 0);
  const saved = Math.round((1 - to / from) * 100);
  return saved > 0
    ? `${what} as WebP: ${formatBytes(from)} → ${formatBytes(to)} (${saved}% smaller).`
    : `${what}.`;
}
