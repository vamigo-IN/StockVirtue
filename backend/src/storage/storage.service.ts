import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, StorageConfig } from '../config/configuration';

export interface PresignedUpload {
  method: 'PUT';
  url: string;
  /** Headers the uploader must send exactly as given (they are signed). */
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface StoredObject {
  bytes: number;
  contentType: string | null;
}

/// Short on purpose: the URL is a bearer credential for one upload.
const DEFAULT_UPLOAD_TTL_SEC = 300;

/**
 * Media files in Cloudflare R2 through its S3-compatible API. Browsers upload
 * straight to the bucket with a short-lived signed PUT, so file bytes never
 * pass through the API server; files are then served from the CDN at
 * MEDIA_PUBLIC_BASE_URL. With storage unconfigured the API still boots and
 * upload calls answer "not set up yet".
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly cfg: StorageConfig;
  private readonly client: S3Client | null;

  constructor(config: ConfigService<AppConfig, true>) {
    this.cfg = config.get('storage', { infer: true });
    this.client = this.createClient();
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  get maxUploadBytes(): number {
    return this.cfg.maxUploadBytes;
  }

  /** "media/2026/11/<uuid>.webp" — unguessable, date-bucketed. */
  newKey(prefix: string, extension: string): string {
    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const ext = extension.replace(/[^a-z0-9]/gi, '').toLowerCase();
    return `${prefix}/${now.getUTCFullYear()}/${month}/${randomUUID()}${ext ? `.${ext}` : ''}`;
  }

  async presignUpload(
    key: string,
    contentType: string,
    ttlSeconds = DEFAULT_UPLOAD_TTL_SEC,
  ): Promise<PresignedUpload> {
    const client = this.requireClient();
    const command = new PutObjectCommand({
      Bucket: this.cfg.r2Bucket,
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(client, command, { expiresIn: ttlSeconds });
    return {
      method: 'PUT',
      url,
      headers: { 'Content-Type': contentType },
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }

  /** Size and type of an uploaded object, or null when it isn't there. */
  async head(key: string): Promise<StoredObject | null> {
    const client = this.requireClient();
    try {
      const res = await client.send(
        new HeadObjectCommand({ Bucket: this.cfg.r2Bucket, Key: key }),
      );
      return {
        bytes: res.ContentLength ?? 0,
        contentType: res.ContentType ?? null,
      };
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 404) return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const client = this.requireClient();
    await client.send(
      new DeleteObjectCommand({ Bucket: this.cfg.r2Bucket, Key: key }),
    );
  }

  /** Public CDN URL for a stored object. */
  publicUrl(key: string): string {
    const path = key.split('/').map(encodeURIComponent).join('/');
    return `${this.cfg.publicBaseUrl}/${path}`;
  }

  private requireClient(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException(
        "Media uploads aren't set up yet. Ask an admin to configure Cloudflare R2.",
      );
    }
    return this.client;
  }

  private createClient(): S3Client | null {
    const c = this.cfg;
    if (c.driver !== 'r2') {
      this.logger.log('Media storage disabled (MEDIA_STORAGE_DRIVER=none).');
      return null;
    }
    const missing = (
      [
        ['R2_ACCOUNT_ID', c.r2AccountId],
        ['R2_ACCESS_KEY_ID', c.r2AccessKeyId],
        ['R2_SECRET_ACCESS_KEY', c.r2SecretAccessKey],
        ['R2_BUCKET', c.r2Bucket],
        ['MEDIA_PUBLIC_BASE_URL', c.publicBaseUrl],
      ] as const
    )
      .filter(([, v]) => !v)
      .map(([k]) => k);
    if (missing.length > 0) {
      this.logger.warn(
        `MEDIA_STORAGE_DRIVER=r2 but ${missing.join(', ')} not set — media uploads disabled.`,
      );
      return null;
    }
    return new S3Client({
      region: 'auto',
      endpoint: `https://${c.r2AccountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: c.r2AccessKeyId,
        secretAccessKey: c.r2SecretAccessKey,
      },
    });
  }
}
