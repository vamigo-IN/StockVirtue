import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaStorageSettings, MediaStore } from '@prisma/client';
import { SecretBoxService, SecretUnreadableError } from '../common/secret-box';
import { AppConfig, StorageConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { LocalStore, TooLargeError } from './local-store';
import { incomingKey } from './media-keys';
import { R2Connection, R2Store } from './r2-store';

export const MEDIA_STORAGE_ID = 'default';

/// Short on purpose: the URL is a bearer credential for one upload.
const UPLOAD_TTL_SEC = 300;
/// How long a process trusts its copy of the saved connection. A save applies
/// at once in the process that made it; others catch up within this.
const SETTINGS_TTL_MS = 30_000;

export interface StoredObject {
  bytes: number;
}

/** How the browser sends an upload's bytes. */
export type UploadTarget =
  | {
      /** Straight to the bucket with a signed link (needs its CORS rule). */
      target: 'r2';
      method: 'PUT';
      url: string;
      /** Headers the uploader must send exactly as given (they are signed). */
      headers: Record<string, string>;
      expiresAt: Date;
    }
  | {
      /** To this server through the portal: PUT staff/media/:id/content. */
      target: 'server';
      method: 'PUT';
      headers: Record<string, string>;
    };

export interface SavedConnection {
  row: MediaStorageSettings | null;
  /** The saved R2 bucket, ready to use; null when there is none. */
  r2: R2Store | null;
  /** Why a saved connection can't be used (e.g. its secret is unreadable). */
  problem: string | null;
}

/** The connection when every value it needs is filled in, else null. */
export function completeConnection(
  c: Partial<R2Connection>,
): R2Connection | null {
  const conn = {
    accountId: c.accountId ?? '',
    endpoint: c.endpoint ?? '',
    bucket: c.bucket ?? '',
    accessKeyId: c.accessKeyId ?? '',
    secretAccessKey: c.secretAccessKey ?? '',
  };
  const ok =
    (conn.accountId || conn.endpoint) &&
    conn.bucket &&
    conn.accessKeyId &&
    conn.secretAccessKey;
  return ok ? conn : null;
}

/**
 * Where media files live. Each file stays in the store it was uploaded to:
 * Cloudflare R2 while a connection saved in the portal is switched on for
 * uploads, otherwise this server's disk. Both are served by our own /media
 * route (media-files.ts), so links look alike and never expire.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly cfg: StorageConfig;
  readonly local: LocalStore;
  private cached: { at: number; value: Promise<SavedConnection> } | null = null;
  private client: { fingerprint: string; store: R2Store } | null = null;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBoxService,
  ) {
    this.cfg = config.get('storage', { infer: true });
    this.local = new LocalStore(this.cfg.localDir);
  }

  onModuleInit(): void {
    if (this.cfg.legacyEnv) {
      this.logger.warn(
        `R2_* and MEDIA_STORAGE_DRIVER are no longer read: connect Cloudflare R2 in the newsroom portal (Media storage). Until then uploads are kept in ${this.local.root}.`,
      );
    }
  }

  get maxUploadBytes(): number {
    return this.cfg.maxUploadBytes;
  }

  /** Public address of /media, e.g. https://api.stockvirtue.com/media */
  get publicBaseUrl(): string {
    return this.cfg.publicBaseUrl;
  }

  /** "media/2026/11/<uuid>.webp" — unguessable, date-bucketed. */
  newKey(prefix: string, extension: string): string {
    const now = new Date();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const ext = extension.replace(/[^a-z0-9]/gi, '').toLowerCase();
    return `${prefix}/${now.getUTCFullYear()}/${month}/${randomUUID()}${ext ? `.${ext}` : ''}`;
  }

  /** "media/2026/11/x.jpg" → <public base>/2026/11/x.jpg */
  publicUrl(key: string): string {
    const path = key
      .replace(/^media\//, '')
      .split('/')
      .map(encodeURIComponent)
      .join('/');
    return `${this.cfg.publicBaseUrl}/${path}`;
  }

  /** The saved connection, cached briefly. */
  connection(): Promise<SavedConnection> {
    const now = Date.now();
    if (!this.cached || now - this.cached.at > SETTINGS_TTL_MS) {
      const value = this.load();
      this.cached = { at: now, value };
      // A failed read must not stick for the whole TTL.
      value.catch(() => {
        if (this.cached?.value === value) this.cached = null;
      });
    }
    return this.cached.value;
  }

  /** Forget the cached connection (after a save in this process). */
  invalidate(): void {
    this.cached = null;
  }

  /** Where a new upload goes: R2 when it is connected and switched on. */
  async uploadStore(): Promise<MediaStore> {
    const c = await this.connection();
    return c.r2 && c.row?.uploadToR2 ? MediaStore.R2 : MediaStore.LOCAL;
  }

  async uploadTarget(
    store: MediaStore,
    assetId: string,
    contentType: string,
  ): Promise<UploadTarget> {
    const headers = { 'Content-Type': contentType };
    if (store === MediaStore.LOCAL) {
      return { target: 'server', method: 'PUT', headers };
    }
    const r2 = await this.r2();
    const url = await r2.presignPut(
      incomingKey(assetId),
      contentType,
      UPLOAD_TTL_SEC,
    );
    return {
      target: 'r2',
      method: 'PUT',
      url,
      headers,
      expiresAt: new Date(Date.now() + UPLOAD_TTL_SEC * 1000),
    };
  }

  /** A server upload's bytes, written while they arrive (LOCAL only). */
  receive(assetId: string, body: Readable, maxBytes: number): Promise<number> {
    return this.local.putStream(incomingKey(assetId), body, maxBytes);
  }

  async head(store: MediaStore, key: string): Promise<StoredObject | null> {
    if (store === MediaStore.LOCAL) {
      const f = await this.local.stat(key);
      return f && { bytes: f.bytes };
    }
    const h = await (await this.r2()).head(key);
    return h && { bytes: h.bytes };
  }

  /** Bytes of a stored file; over maxBytes throws TooLargeError. */
  async getBytes(
    store: MediaStore,
    key: string,
    maxBytes?: number,
  ): Promise<Buffer> {
    const bytes =
      store === MediaStore.LOCAL
        ? await this.local.getBytes(key)
        : await (await this.r2()).getBytes(key, { maxBytes });
    if (maxBytes !== undefined && bytes.length > maxBytes) {
      throw new TooLargeError();
    }
    return bytes;
  }

  async put(
    store: MediaStore,
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    if (store === MediaStore.LOCAL) return this.local.put(key, body);
    await (await this.r2()).put(key, body, contentType);
  }

  async delete(store: MediaStore, key: string): Promise<void> {
    if (store === MediaStore.LOCAL) return this.local.delete(key);
    await (await this.r2()).delete(key);
  }

  private async r2(): Promise<R2Store> {
    const c = await this.connection();
    if (!c.r2) {
      throw new ServiceUnavailableException(
        c.problem ??
          "Cloudflare R2 isn't connected. Connect it again in Media storage.",
      );
    }
    return c.r2;
  }

  private async load(): Promise<SavedConnection> {
    const row = await this.prisma.mediaStorageSettings.findUnique({
      where: { id: MEDIA_STORAGE_ID },
    });
    if (!row?.secretAccessKey) return { row, r2: null, problem: null };
    let secret: string;
    try {
      secret = this.secrets.open(row.secretAccessKey, 'media-storage');
    } catch (err) {
      const why =
        err instanceof SecretUnreadableError
          ? err.message
          : 'The saved secret key can’t be read. Enter it again.';
      return { row, r2: null, problem: `Cloudflare R2: ${why}` };
    }
    const conn = completeConnection({ ...row, secretAccessKey: secret });
    if (!conn) return { row, r2: null, problem: null };
    // Reuse the client (and its open connections) until the settings change.
    const fingerprint = [
      conn.endpoint,
      conn.accountId,
      conn.bucket,
      conn.accessKeyId,
      row.secretAccessKey,
    ].join('|');
    if (this.client?.fingerprint !== fingerprint) {
      this.client = { fingerprint, store: new R2Store(conn) };
    }
    return { row, r2: this.client.store, problem: null };
  }
}
