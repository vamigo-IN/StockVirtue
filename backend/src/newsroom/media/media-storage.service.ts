import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  MediaStatus,
  MediaStorageSettings,
  MediaStore,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { SecretBoxService } from '../../common/secret-box';
import { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientInfo, StaffPrincipal } from '../../staff/staff-request';
import { incomingKey } from '../../storage/media-keys';
import {
  R2Connection,
  r2Endpoint,
  R2Store,
  s3Status,
} from '../../storage/r2-store';
import {
  completeConnection,
  MEDIA_STORAGE_ID,
  StorageService,
} from '../../storage/storage.service';
import type {
  MediaStorageConnectionDto,
  MediaStorageSaveDto,
} from './media-storage.dto';

export type CheckStepKey = 'connect' | 'write' | 'read' | 'delete';

export interface CheckStep {
  key: CheckStepKey;
  label: string;
  /** null = not run, because an earlier step failed. */
  ok: boolean | null;
  detail?: string;
}

export interface CheckResult {
  ok: boolean;
  steps: CheckStep[];
  checkedAt: string;
}

const STEPS: Record<CheckStepKey, string> = {
  connect: 'Connect to the bucket',
  write: 'Write a test file',
  read: 'Read it back',
  delete: 'Delete the test file',
};
const STEP_TIMEOUT_MS = 10_000;

const ACCOUNT_ID = /^[a-f0-9]{32}$/;
const BUCKET = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/;
const NEEDS_ALL =
  'Fill in the account ID, bucket, access key ID and secret access key first.';

/** The connection being saved or checked: typed values over saved ones. */
interface Draft extends R2Connection {
  /** A secret typed just now; null = the saved one is kept. */
  newSecret: string | null;
  /** Differs from what is saved. */
  changed: boolean;
  /** A secret is saved but can't be opened (the secrets key changed). */
  savedSecretUnreadable: boolean;
}

/** A failed check step in words staff can act on (never with any secret). */
export function explainFailure(
  key: CheckStepKey,
  err: unknown,
  at: { endpoint: string; bucket: string },
): string {
  const e = err as
    | (Error & {
        code?: string;
        cause?: { code?: string };
        errors?: { code?: string }[];
      })
    | null;
  if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
    return `No answer from ${at.endpoint} within ${STEP_TIMEOUT_MS / 1000} seconds.`;
  }
  // Node reports one code, or one per address tried (AggregateError).
  const code = e?.code ?? e?.cause?.code ?? e?.errors?.[0]?.code;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return `${new URL(at.endpoint).hostname} wasn't found. Check the account ID.`;
  }
  if (code === 'ECONNREFUSED' || code === 'ECONNRESET') {
    return `${at.endpoint} refused the connection.`;
  }
  if (key === 'read' && e?.message === 'mismatch') {
    return 'The file read back differs from the one written.';
  }
  const status = s3Status(err);
  if (status === 404 || e?.name === 'NoSuchBucket') {
    return `There's no bucket named "${at.bucket}" in this account.`;
  }
  if (status === 401 || status === 403) {
    return key === 'connect'
      ? 'Cloudflare refused these keys. Check the access key ID and secret, and that the API token covers this bucket.'
      : 'These keys may not do that. Give the API token "Object Read & Write" on this bucket.';
  }
  const what = e?.name && e.name !== 'Error' ? `${e.name}: ` : '';
  return `${what}${e?.message || String(err)}`.slice(0, 300);
}

/** The S3 API address as Cloudflare shows it, taken apart. */
export function parseR2Address(text: string) {
  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  const m = /^([a-f0-9]{32})\.([a-z0-9-]+\.)?r2\.cloudflarestorage\.com$/.exec(
    url.hostname,
  );
  if (!m) return null;
  return {
    accountId: m[1],
    // EU and other jurisdictions have their own address.
    endpoint: m[2] ? `https://${url.hostname}` : '',
    bucket: url.pathname.split('/').filter(Boolean)[0] ?? '',
  };
}

const visible = (r: {
  accountId: string;
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  uploadToR2: boolean;
}) => ({
  accountId: r.accountId,
  endpoint: r.endpoint,
  bucket: r.bucket,
  accessKeyId: r.accessKeyId,
  uploadToR2: r.uploadToR2,
});

/**
 * Media storage settings (portal: Media storage, media.storage). The R2
 * connection is checked the way Bulava's storage check works (sign in, write
 * a file, read it back, delete it) and the secret key is sealed before it is stored. A connection
 * that R2-stored images still load through can't be removed or broken.
 */
@Injectable()
export class MediaStorageService {
  private readonly production: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly secrets: SecretBoxService,
    private readonly audit: AuditService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.production = config.get('nodeEnv', { infer: true }) === 'production';
  }

  async view() {
    const [row, conn, server, groups] = await Promise.all([
      this.row(),
      this.storage.connection(),
      this.storage.local.status(),
      this.prisma.mediaAsset.groupBy({
        by: ['store'],
        where: { status: MediaStatus.READY },
        _count: { _all: true },
      }),
    ]);
    const count = (s: MediaStore) =>
      groups.find((g) => g.store === s)?._count._all ?? 0;
    return {
      /** Where new uploads go right now. */
      uploadsTo: conn.r2 && row?.uploadToR2 ? MediaStore.R2 : MediaStore.LOCAL,
      r2: {
        accountId: row?.accountId ?? '',
        endpoint: row?.endpoint ?? '',
        bucket: row?.bucket ?? '',
        accessKeyId: row?.accessKeyId ?? '',
        hasSecret: !!row?.secretAccessKey,
        uploadToR2: row?.uploadToR2 ?? false,
        /** A complete, readable connection is saved. */
        connected: !!conn.r2,
        problem: conn.problem,
      },
      lastCheck:
        row?.lastCheckAt && row.lastCheck
          ? {
              at: row.lastCheckAt,
              ok: row.lastCheckOk === true,
              steps: row.lastCheck as unknown as CheckStep[],
            }
          : null,
      server,
      images: { r2: count(MediaStore.R2), server: count(MediaStore.LOCAL) },
      publicBaseUrl: this.storage.publicBaseUrl,
      maxUploadBytes: this.storage.maxUploadBytes,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy ?? null,
    };
  }

  /** Tests a connection without saving it (blank fields = the saved ones). */
  async check(input: MediaStorageConnectionDto): Promise<CheckResult> {
    const row = await this.row();
    const draft = this.draft(row, input);
    const conn = completeConnection(draft);
    if (!conn) throw new BadRequestException(this.incomplete(draft));
    const result = await this.runCheck(conn);
    // The result of checking the saved connection is shown on the page.
    if (row && !draft.changed) {
      await this.prisma.mediaStorageSettings.update({
        where: { id: MEDIA_STORAGE_ID },
        data: this.checkFields(result),
      });
    }
    return result;
  }

  async save(
    actor: StaffPrincipal,
    input: MediaStorageSaveDto,
    client: ClientInfo,
  ) {
    const row = await this.row();
    const draft = this.draft(row, input);
    const conn = completeConnection(draft);
    if (!conn && input.uploadToR2) {
      throw new BadRequestException(this.incomplete(draft));
    }
    // A different account, endpoint or bucket (or none at all) is a new place.
    const moved =
      !!row?.bucket &&
      (!conn ||
        draft.bucket !== row.bucket ||
        r2Endpoint(draft) !== r2Endpoint(row));
    if (moved && draft.changed) {
      // Images in R2 load from the saved bucket: it can't change under them.
      const inR2 = await this.imagesInR2();
      if (inR2 > 0) {
        throw new ConflictException(
          `${inR2} image${inR2 === 1 ? ' is' : 's are'} stored in the bucket "${row.bucket}" and load from it, so its account, endpoint and bucket can't change. You can still replace the access keys.`,
        );
      }
    }
    // Any new connection, and switching uploads to R2, must pass first.
    let check: CheckResult | null = null;
    if (conn && (draft.changed || input.uploadToR2)) {
      check = await this.runCheck(conn);
      const failed = check.steps.find((s) => s.ok === false);
      if (failed) {
        throw new BadRequestException({
          message: `Not saved. ${failed.label}: ${failed.detail}`,
          check,
        });
      }
    }
    const fields = {
      accountId: draft.accountId,
      endpoint: draft.endpoint,
      bucket: draft.bucket,
      accessKeyId: draft.accessKeyId,
      uploadToR2: input.uploadToR2 && !!conn,
    };
    const data: Prisma.MediaStorageSettingsUncheckedUpdateInput = {
      ...fields,
      ...(draft.newSecret
        ? {
            secretAccessKey: this.secrets.seal(
              draft.newSecret,
              'media-storage',
            ),
          }
        : {}),
      ...(check
        ? this.checkFields(check)
        : draft.changed
          ? { lastCheckAt: null, lastCheckOk: null, lastCheck: Prisma.DbNull }
          : {}),
      updatedBy: actor.displayName,
    };
    // Unfinished uploads went to the old bucket; they can't complete now.
    if (moved && draft.changed) await this.dropPendingR2();
    await this.prisma.$transaction(async (tx) => {
      await tx.mediaStorageSettings.upsert({
        where: { id: MEDIA_STORAGE_ID },
        create: {
          ...(data as Prisma.MediaStorageSettingsUncheckedCreateInput),
          id: MEDIA_STORAGE_ID,
        },
        update: data,
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'media.storage.update',
          entityType: 'MediaStorageSettings',
          entityId: MEDIA_STORAGE_ID,
          before: row ? visible(row) : {},
          after: { ...fields, secretChanged: !!draft.newSecret },
          ...client,
        },
        tx,
      );
    });
    this.storage.invalidate();
    return { settings: await this.view(), check };
  }

  /** Forgets the R2 connection; refused while images are stored in R2. */
  async disconnect(actor: StaffPrincipal, client: ClientInfo) {
    const row = await this.row();
    if (row) {
      const inR2 = await this.imagesInR2();
      if (inR2 > 0) {
        throw new ConflictException(
          `${inR2} image${inR2 === 1 ? ' is' : 's are'} stored in R2 and load through this connection, so it can't be removed. Turn off "Use R2 for new uploads" instead.`,
        );
      }
      await this.dropPendingR2();
      await this.prisma.$transaction(async (tx) => {
        await tx.mediaStorageSettings.delete({
          where: { id: MEDIA_STORAGE_ID },
        });
        await this.audit.record(
          {
            actor: { userId: actor.userId, email: actor.email },
            action: 'media.storage.disconnect',
            entityType: 'MediaStorageSettings',
            entityId: MEDIA_STORAGE_ID,
            before: visible(row),
            ...client,
          },
          tx,
        );
      });
      this.storage.invalidate();
    }
    return this.view();
  }

  private row(): Promise<MediaStorageSettings | null> {
    return this.prisma.mediaStorageSettings.findUnique({
      where: { id: MEDIA_STORAGE_ID },
    });
  }

  private imagesInR2(): Promise<number> {
    return this.prisma.mediaAsset.count({
      where: { store: MediaStore.R2, status: MediaStatus.READY },
    });
  }

  /** R2 uploads never completed: their files go with the connection. */
  private async dropPendingR2() {
    const pending = await this.prisma.mediaAsset.findMany({
      where: { store: MediaStore.R2, status: MediaStatus.PENDING },
      select: { id: true },
    });
    if (pending.length === 0) return;
    for (const p of pending) {
      await this.storage
        .delete(MediaStore.R2, incomingKey(p.id))
        .catch(() => undefined);
    }
    await this.prisma.mediaAsset.updateMany({
      where: { id: { in: pending.map((p) => p.id) } },
      data: { status: MediaStatus.DELETED },
    });
  }

  private incomplete(d: Draft): string {
    return d.savedSecretUnreadable && !d.newSecret
      ? 'Enter the secret access key again: the saved one can’t be read (the encryption key changed).'
      : NEEDS_ALL;
  }

  private checkFields(c: CheckResult) {
    return {
      lastCheckAt: new Date(c.checkedAt),
      lastCheckOk: c.ok,
      lastCheck: c.steps as unknown as Prisma.InputJsonValue,
    };
  }

  /** What was typed, tidied and validated, over the saved values. */
  private draft(
    row: MediaStorageSettings | null,
    input: MediaStorageConnectionDto,
  ): Draft {
    const pick = (typed: string | undefined, saved: string | undefined) =>
      typed === undefined ? (saved ?? '') : typed.trim();
    let accountId = pick(input.accountId, row?.accountId).toLowerCase();
    let endpoint = pick(input.endpoint, row?.endpoint).replace(/\/+$/, '');
    let bucket = pick(input.bucket, row?.bucket).toLowerCase();
    const accessKeyId = pick(input.accessKeyId, row?.accessKeyId);
    if (accountId.includes('r2.cloudflarestorage.com')) {
      const pasted = parseR2Address(accountId);
      if (!pasted) {
        throw new BadRequestException(
          "That address isn't an R2 S3 API address (https://<account id>.r2.cloudflarestorage.com).",
        );
      }
      accountId = pasted.accountId;
      endpoint ||= pasted.endpoint;
      bucket ||= pasted.bucket;
    }
    if (accountId && !ACCOUNT_ID.test(accountId)) {
      throw new BadRequestException(
        'The account ID is the 32-character code on the R2 overview page. You can also paste the S3 API address.',
      );
    }
    if (endpoint) this.assertEndpoint(endpoint);
    if (bucket && !BUCKET.test(bucket)) {
      throw new BadRequestException(
        'Bucket names use lowercase letters, numbers and hyphens (3 to 63 characters).',
      );
    }
    if (accessKeyId && !/^\S{4,128}$/.test(accessKeyId)) {
      throw new BadRequestException("The access key ID can't contain spaces.");
    }
    const typed = input.secretAccessKey?.trim() || null;
    if (typed && !/^\S{8,256}$/.test(typed)) {
      throw new BadRequestException(
        "The secret access key can't contain spaces.",
      );
    }
    let saved = '';
    let savedSecretUnreadable = false;
    if (row?.secretAccessKey) {
      try {
        saved = this.secrets.open(row.secretAccessKey, 'media-storage');
      } catch {
        savedSecretUnreadable = true;
      }
    }
    const newSecret = typed && typed !== saved ? typed : null;
    const changed =
      !row ||
      row.accountId !== accountId ||
      row.endpoint !== endpoint ||
      row.bucket !== bucket ||
      row.accessKeyId !== accessKeyId ||
      newSecret !== null;
    return {
      accountId,
      endpoint,
      bucket,
      accessKeyId,
      secretAccessKey: newSecret ?? saved,
      newSecret,
      changed,
      savedSecretUnreadable,
    };
  }

  /**
   * R2's own addresses only (any jurisdiction); outside production also a
   * local S3-compatible server for testing. The check makes this server
   * connect to the address, so it can't be pointed anywhere else.
   */
  private assertEndpoint(endpoint: string) {
    let url: URL | null = null;
    try {
      url = new URL(endpoint);
    } catch {
      // Reported below.
    }
    const r2 =
      url?.protocol === 'https:' &&
      /\.r2\.cloudflarestorage\.com$/.test(url.hostname) &&
      url.pathname === '/';
    const local =
      !this.production &&
      !!url &&
      /^https?:$/.test(url.protocol) &&
      ['localhost', '127.0.0.1'].includes(url.hostname);
    if (!r2 && !local) {
      throw new BadRequestException(
        'The endpoint must be an R2 address like https://<account id>.r2.cloudflarestorage.com. Leave it blank to use your account ID.',
      );
    }
  }

  private async runCheck(conn: R2Connection): Promise<CheckResult> {
    const store = new R2Store(conn);
    const steps: CheckStep[] = (Object.keys(STEPS) as CheckStepKey[]).map(
      (key) => ({ key, label: STEPS[key], ok: null }),
    );
    const attempt = async (
      key: CheckStepKey,
      run: (signal: AbortSignal) => Promise<unknown>,
    ) => {
      const step = steps.find((s) => s.key === key)!;
      try {
        await run(AbortSignal.timeout(STEP_TIMEOUT_MS));
        step.ok = true;
      } catch (err) {
        step.ok = false;
        step.detail = explainFailure(key, err, {
          endpoint: store.endpoint,
          bucket: store.bucket,
        });
      }
      return step.ok;
    };
    const probe = `health/probe-${randomUUID()}.txt`;
    const text = `StockVirtue storage check ${new Date().toISOString()}`;
    try {
      if (
        (await attempt('connect', (signal) => store.ping(signal))) &&
        (await attempt('write', (signal) =>
          store.put(probe, text, 'text/plain', signal),
        ))
      ) {
        await attempt('read', async (signal) => {
          const back = (await store.getBytes(probe, { signal })).toString(
            'utf8',
          );
          if (back !== text) throw new Error('mismatch');
        });
        await attempt('delete', (signal) => store.delete(probe, signal));
      }
    } finally {
      store.destroy();
    }
    return {
      ok: steps.every((s) => s.ok === true),
      steps,
      checkedAt: new Date().toISOString(),
    };
  }
}
