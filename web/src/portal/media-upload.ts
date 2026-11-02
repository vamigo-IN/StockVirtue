import { api, ApiError } from './api';
import type { MediaAsset } from './types';

export const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];

/**
 * Uploads one image to the media library: the API hands out a short-lived
 * signed URL, the browser sends the file straight to storage, and the API
 * then checks the bytes, strips metadata and makes resized copies.
 */
export async function uploadImage(file: File): Promise<MediaAsset> {
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new ApiError(
      400,
      `"${file.name}" isn't a JPEG, PNG, WebP, GIF or AVIF image.`,
    );
  }
  const start = await api<{
    asset: MediaAsset;
    upload: { url: string; method: 'PUT'; headers: Record<string, string> };
  }>('staff/media/uploads', {
    method: 'POST',
    body: { filename: file.name, contentType: file.type, bytes: file.size },
  });
  let put: Response;
  try {
    put = await fetch(start.upload.url, {
      method: start.upload.method,
      headers: start.upload.headers,
      body: file,
    });
  } catch {
    throw new ApiError(
      0,
      `"${file.name}" couldn't be uploaded. Check your connection and try again.`,
    );
  }
  if (!put.ok) {
    throw new ApiError(
      put.status,
      `Storage refused "${file.name}". Try again in a minute.`,
    );
  }
  return api<MediaAsset>(`staff/media/${start.asset.id}/complete`, {
    method: 'POST',
  });
}
