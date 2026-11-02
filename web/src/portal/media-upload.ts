import { api, ApiError, apiUpload } from './api';
import type { MediaAsset } from './types';

/** Where the API says to send the bytes. */
type UploadTarget =
  | {
      target: 'r2';
      method: 'PUT';
      url: string;
      headers: Record<string, string>;
    }
  | { target: 'server'; method: 'PUT'; headers: Record<string, string> };

export const IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];

/**
 * Uploads one image to the media library. With Cloudflare R2 connected the
 * API hands out a short-lived signed URL and the browser sends the file
 * straight to the bucket; otherwise the file goes to our server through the
 * portal. The API then checks the bytes, strips metadata and makes resized
 * copies.
 */
export async function uploadImage(file: File): Promise<MediaAsset> {
  if (!IMAGE_TYPES.includes(file.type)) {
    throw new ApiError(
      400,
      `"${file.name}" isn't a JPEG, PNG, WebP, GIF or AVIF image.`,
    );
  }
  const start = await api<{ asset: MediaAsset; upload: UploadTarget }>(
    'staff/media/uploads',
    {
      method: 'POST',
      body: { filename: file.name, contentType: file.type, bytes: file.size },
    },
  );
  const { upload } = start;
  if (upload.target === 'server') {
    await apiUpload(
      `staff/media/${start.asset.id}/content`,
      file,
      upload.headers['Content-Type'],
    );
  } else {
    let put: Response;
    try {
      put = await fetch(upload.url, {
        method: upload.method,
        headers: upload.headers,
        body: file,
      });
    } catch {
      // Also what a bucket without the portal's CORS rule looks like.
      throw new ApiError(
        0,
        `"${file.name}" couldn't be sent to Cloudflare R2. Check your connection; if it keeps failing, an admin can run the check under Media storage.`,
      );
    }
    if (!put.ok) {
      throw new ApiError(
        put.status,
        `Cloudflare R2 refused "${file.name}". Try again in a minute.`,
      );
    }
  }
  return api<MediaAsset>(`staff/media/${start.asset.id}/complete`, {
    method: 'POST',
  });
}
