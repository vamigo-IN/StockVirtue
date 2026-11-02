import type { Readable } from 'node:stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface R2Connection {
  accountId: string;
  /** Blank = https://<accountId>.r2.cloudflarestorage.com */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface R2Object {
  body: Readable;
  bytes: number | null;
  etag: string | null;
  modifiedAt: Date | null;
}

/// Keys are unique per file, so any cache may keep them forever.
const IMMUTABLE = 'public, max-age=31536000, immutable';

export function r2Endpoint(
  c: Pick<R2Connection, 'accountId' | 'endpoint'>,
): string {
  return c.endpoint || `https://${c.accountId}.r2.cloudflarestorage.com`;
}

/** HTTP status of a failed S3 call, when it got that far. */
export function s3Status(err: unknown): number | undefined {
  return (err as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata
    ?.httpStatusCode;
}

/**
 * One Cloudflare R2 bucket through its S3-compatible API. The bucket stays
 * private: browsers upload with short-lived signed PUT links (which need the
 * bucket's CORS rule), and readers get files through our own /media route.
 */
export class R2Store {
  readonly bucket: string;
  readonly endpoint: string;
  private readonly client: S3Client;

  constructor(conn: R2Connection) {
    this.bucket = conn.bucket;
    this.endpoint = r2Endpoint(conn);
    this.client = new S3Client({
      region: 'auto',
      endpoint: this.endpoint,
      // Bucket in the path (as Bulava does): no per-bucket host names.
      forcePathStyle: true,
      // SDK v3 otherwise signs a checksum of the (empty) body into presigned
      // PUT URLs, so the browser's real upload fails with BadDigest.
      // Cloudflare's R2 docs ask for exactly these two settings.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
      maxAttempts: 2,
      credentials: {
        accessKeyId: conn.accessKeyId,
        secretAccessKey: conn.secretAccessKey,
      },
    });
  }

  presignPut(
    key: string,
    contentType: string,
    ttlSeconds: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: ttlSeconds },
    );
  }

  /** Size of a stored object, or null when it isn't there. */
  async head(
    key: string,
    signal?: AbortSignal,
  ): Promise<{ bytes: number; etag: string | null } | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
        { abortSignal: signal },
      );
      return { bytes: res.ContentLength ?? 0, etag: res.ETag ?? null };
    } catch (err) {
      if (s3Status(err) === 404) return null;
      throw err;
    }
  }

  /** Whole object as bytes (callers bound the size with head() first). */
  async getBytes(key: string, signal?: AbortSignal): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { abortSignal: signal },
    );
    if (!res.Body) return Buffer.alloc(0);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  /** An object as a stream; null when it isn't there. */
  async open(
    key: string,
    opts: { ifNoneMatch?: string } = {},
  ): Promise<R2Object | 'not-modified' | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          IfNoneMatch: opts.ifNoneMatch,
        }),
      );
      if (!res.Body) return null;
      return {
        body: res.Body as Readable,
        bytes: res.ContentLength ?? null,
        etag: res.ETag ?? null,
        modifiedAt: res.LastModified ?? null,
      };
    } catch (err) {
      const status = s3Status(err);
      if (status === 304) return 'not-modified';
      if (status === 404) return null;
      throw err;
    }
  }

  async put(
    key: string,
    body: Buffer | string,
    contentType: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: IMMUTABLE,
      }),
      { abortSignal: signal },
    );
  }

  async delete(key: string, signal?: AbortSignal): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      { abortSignal: signal },
    );
  }

  /**
   * Signs in and finds the bucket. A listing, not HeadBucket: a token scoped
   * to "Object Read & Write" on one bucket may list it but not inspect it.
   */
  async ping(signal?: AbortSignal): Promise<void> {
    await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: 'health/',
        MaxKeys: 1,
      }),
      { abortSignal: signal },
    );
  }

  /** Closes the connections of a store nothing else uses (a one-off check). */
  destroy(): void {
    this.client.destroy();
  }
}
