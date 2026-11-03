import { createHash } from 'node:crypto';
import { Writable, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { MediaAsset, MediaStatus, MediaStore, Prisma } from '@prisma/client';
import { AuditActor, AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientInfo, StaffPrincipal } from '../../staff/staff-request';
import { TooLargeError } from '../../storage/local-store';
import { incomingKey } from '../../storage/media-keys';
import { StorageService } from '../../storage/storage.service';
import { has } from '../articles/article-access';
import { RenderMedia } from '../content/article-content';
import { NewsCache } from '../public/news-cache';
import { PublicImage } from '../public/public-articles';
import { OptimizedImage, optimizeImage } from './image-optimizer';
import { IMAGE_MIME, KIND_BY_MIME, sniffImage } from './image-sniff';

/// Images kept on this server must leave this much disk free (the API and
/// the trading engine share it).
const MIN_FREE_BYTES = 1024 ** 3;
const WEBP = 'image/webp';
/// A news source's "picture" smaller than this is a tracking pixel or an icon.
const MIN_IMPORT_WIDTH = 200;
const MIN_IMPORT_HEIGHT = 100;

interface Variant {
  key: string;
  width: number;
  height: number;
}
type Variants = Record<string, Variant>;

const ASSET_INCLUDE = {
  uploadedBy: { select: { id: true, displayName: true } },
} satisfies Prisma.MediaAssetInclude;
type AssetRow = Prisma.MediaAssetGetPayload<{ include: typeof ASSET_INCLUDE }>;

/**
 * The newsroom media library. An upload comes to this server through the
 * portal and stays in memory: the server checks it really is an image (by its
 * bytes, not its name), turns it into WebP (image-optimizer.ts) and stores
 * only that, with smaller copies for responsive pages, in Cloudflare R2 when
 * it is connected or else on this server. The file as sent is never stored,
 * so camera metadata such as GPS location never is either.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly cache: NewsCache,
  ) {}

  view(a: AssetRow | MediaAsset) {
    const variants = (a.variants ?? {}) as unknown as Variants;
    const small = variants.w480?.key ?? variants.w1200?.key ?? a.storageKey;
    const ready = a.status === MediaStatus.READY;
    return {
      id: a.id,
      url: ready ? this.storage.publicUrl(a.storageKey) : null,
      thumbUrl: ready ? this.storage.publicUrl(small) : null,
      store: a.store,
      mimeType: a.mimeType,
      bytes: a.bytes,
      /** What was uploaded, before it became WebP (null for older images). */
      sourceType: a.sourceType,
      sourceBytes: a.sourceBytes,
      width: a.width,
      height: a.height,
      alt: a.alt,
      caption: a.caption,
      credit: a.credit,
      status: a.status,
      originalName: a.originalName,
      uploadedBy: 'uploadedBy' in a ? a.uploadedBy : null,
      createdAt: a.createdAt,
    };
  }

  /** An image as readers get it; null when it isn't ready. */
  publicImage(a: MediaAsset | null | undefined): PublicImage | null {
    if (!a || a.status !== MediaStatus.READY) return null;
    return {
      url: this.storage.publicUrl(a.storageKey),
      width: a.width,
      height: a.height,
      alt: a.alt,
      credit: a.credit,
      variants: this.variantList(a),
    };
  }

  async list(opts: { q?: string; cursor?: string; limit: number }) {
    const term = opts.q?.trim();
    const where: Prisma.MediaAssetWhereInput = {
      status: MediaStatus.READY,
      ...(term
        ? {
            OR: [
              { alt: { contains: term, mode: 'insensitive' } },
              { caption: { contains: term, mode: 'insensitive' } },
              { originalName: { contains: term, mode: 'insensitive' } },
              { credit: { contains: term, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.mediaAsset.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: opts.limit + 1,
      ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
      include: ASSET_INCLUDE,
    });
    const more = rows.length > opts.limit;
    const items = (more ? rows.slice(0, opts.limit) : rows).map((r) =>
      this.view(r),
    );
    return {
      items,
      nextCursor: more ? items[items.length - 1].id : null,
      /** Where new uploads go right now. */
      store: await this.storage.uploadStore(),
      maxBytes: this.storage.maxUploadBytes,
    };
  }

  /** Step 1: a pending image, and where the portal sends the file. */
  async startUpload(
    actor: StaffPrincipal,
    dto: { filename: string; contentType: string; bytes: number },
  ) {
    const kind = KIND_BY_MIME[dto.contentType.toLowerCase()];
    if (!kind) {
      throw new BadRequestException(
        'Upload a JPEG, PNG, WebP, GIF or AVIF image.',
      );
    }
    if (dto.bytes > this.storage.maxUploadBytes) {
      throw new BadRequestException(
        `Images can be up to ${Math.round(this.storage.maxUploadBytes / 1048576)} MB.`,
      );
    }
    const store = await this.storage.uploadStore();
    const asset = await this.prisma.mediaAsset.create({
      data: {
        storageKey: this.storage.newKey('media', 'webp'),
        store,
        originalName: dto.filename.slice(0, 200),
        mimeType: IMAGE_MIME[kind],
        bytes: dto.bytes,
        status: MediaStatus.PENDING,
        uploadedById: actor.staffId,
      },
      include: ASSET_INCLUDE,
    });
    const upload = this.storage.uploadTarget(IMAGE_MIME[kind]);
    return { asset: this.view(asset), upload };
  }

  /**
   * Step 2: the file itself, via the portal. It is read into memory (never
   * written anywhere as sent), turned into WebP and stored, so the upload is
   * finished when this returns.
   */
  async receive(
    actor: StaffPrincipal,
    id: string,
    body: Readable,
    declaredBytes: number | null,
    client: ClientInfo,
  ) {
    const asset = await this.find(id);
    if (asset.status !== MediaStatus.PENDING) {
      throw new ConflictException(
        'This upload is already finished or was cancelled.',
      );
    }
    this.assertMayChange(actor, asset);
    const max = this.storage.maxUploadBytes;
    const tooLarge = () =>
      new PayloadTooLargeException(
        `Images can be up to ${Math.round(max / 1048576)} MB.`,
      );
    if (declaredBytes !== null && declaredBytes > max) throw tooLarge();
    if (asset.store === MediaStore.LOCAL) {
      // Room for the WebP files, which are smaller than the upload.
      const free = await this.storage.local.freeBytes();
      if (free !== null && free - (declaredBytes ?? max) < MIN_FREE_BYTES) {
        throw new HttpException(
          "This server is nearly out of disk space, so it can't keep more images. Free some space, or connect Cloudflare R2 under Media storage.",
          HttpStatus.INSUFFICIENT_STORAGE,
        );
      }
    }
    let original: Buffer;
    try {
      original = await readBody(body, max);
    } catch (err) {
      if (err instanceof TooLargeError) throw tooLarge();
      throw err;
    }
    if (original.length === 0) {
      await this.discard(asset);
      throw new BadRequestException('That file is empty. Upload it again.');
    }
    return this.finish(actor, asset, original, client);
  }

  /**
   * Step 3: the finished image. Uploads now finish when the file arrives;
   * one sent straight to the bucket before that changed still waits under
   * an "incoming" key, and is turned into WebP here.
   */
  async completeUpload(actor: StaffPrincipal, id: string, client: ClientInfo) {
    const asset = await this.find(id);
    if (asset.status === MediaStatus.READY) return this.view(asset);
    if (asset.status !== MediaStatus.PENDING) {
      throw new BadRequestException(
        'This upload was cancelled. Upload the image again.',
      );
    }
    this.assertMayChange(actor, asset);
    const incoming = incomingKey(asset.id);
    const head = await this.storage.head(asset.store, incoming);
    if (!head) {
      throw new BadRequestException(
        "The file didn't arrive. Try the upload again.",
      );
    }
    const max = this.storage.maxUploadBytes;
    const limit = `Images can be up to ${Math.round(max / 1048576)} MB.`;
    if (head.bytes === 0) {
      await this.discard(asset);
      throw new BadRequestException('That file is empty. Upload it again.');
    }
    if (head.bytes > max) {
      await this.discard(asset);
      throw new BadRequestException(limit);
    }
    let original: Buffer;
    try {
      // Bounded again: the file can be swapped after the size check.
      original = await this.storage.getBytes(asset.store, incoming, max);
    } catch (err) {
      if (!(err instanceof TooLargeError)) throw err;
      await this.discard(asset);
      throw new BadRequestException(limit);
    }
    const view = await this.finish(actor, asset, original, client);
    await this.storage
      .delete(asset.store, incoming)
      .catch((err: Error) =>
        this.logger.warn(`Couldn't delete ${incoming}: ${err.message}`),
      );
    return view;
  }

  /** Checks an upload's bytes, stores its WebP files and marks it ready. */
  private async finish(
    actor: StaffPrincipal,
    asset: AssetRow,
    original: Buffer,
    client: ClientInfo,
  ) {
    const kind = sniffImage(original);
    if (!kind) {
      await this.discard(asset);
      throw new BadRequestException(
        "That file isn't a JPEG, PNG, WebP, GIF or AVIF image.",
      );
    }
    let image: OptimizedImage;
    try {
      image = await optimizeImage(original, kind);
    } catch (err) {
      this.logger.warn(`Image ${asset.id} rejected: ${(err as Error).message}`);
      await this.discard(asset);
      throw new BadRequestException(
        "That image couldn't be read. It may be damaged or too large.",
      );
    }
    const base = asset.storageKey.replace(/\.[a-z0-9]+$/i, '');
    const { storageKey, variants } = await this.writeFiles(
      asset.store,
      base,
      image,
    );
    const id = asset.id;
    let updated: AssetRow;
    try {
      updated = await this.prisma.$transaction(async (tx) => {
        // Only a still-pending upload becomes ready: one deleted meanwhile
        // must stay deleted.
        const { count } = await tx.mediaAsset.updateMany({
          where: { id, status: MediaStatus.PENDING },
          data: {
            storageKey,
            status: MediaStatus.READY,
            mimeType: WEBP,
            bytes: image.data.length,
            sourceType: IMAGE_MIME[kind],
            sourceBytes: original.length,
            width: image.width,
            height: image.height,
            sha256: createHash('sha256').update(image.data).digest('hex'),
            variants: variants as unknown as Prisma.InputJsonValue,
          },
        });
        const row = await tx.mediaAsset.findUniqueOrThrow({
          where: { id },
          include: ASSET_INCLUDE,
        });
        if (count === 0) {
          // Finished by a second request for the same upload: same files.
          if (row.status === MediaStatus.READY) return row;
          throw new ConflictException(
            'This upload was cancelled while it was being processed.',
          );
        }
        await this.audit.record(
          {
            actor: { userId: actor.userId, email: actor.email },
            action: 'media.upload',
            entityType: 'MediaAsset',
            entityId: id,
            after: {
              name: asset.originalName,
              uploaded: IMAGE_MIME[kind],
              uploadedBytes: original.length,
              stored: image.method === 'kept' ? 'WebP as sent' : 'WebP',
              bytes: image.data.length,
              width: image.width,
              height: image.height,
            },
            ...client,
          },
          tx,
        );
        return row;
      });
    } catch (err) {
      if (err instanceof ConflictException) {
        // The files just written belong to nothing now.
        const keys = [storageKey, ...Object.values(variants).map((v) => v.key)];
        for (const key of keys) {
          await this.storage.delete(asset.store, key).catch(() => undefined);
        }
      }
      throw err;
    }
    return this.view(updated);
  }

  /** Writes an image's WebP and its smaller copies; on failure, none. */
  private async writeFiles(
    store: MediaStore,
    base: string,
    image: OptimizedImage,
  ) {
    const storageKey = `${base}.webp`;
    const written: string[] = [];
    try {
      await this.storage.put(store, storageKey, image.data, WEBP);
      written.push(storageKey);
      const variants: Variants = {};
      for (const v of image.variants) {
        const key = `${base}-w${v.width}.webp`;
        await this.storage.put(store, key, v.data, WEBP);
        written.push(key);
        variants[`w${v.target}`] = { key, width: v.width, height: v.height };
      }
      return { storageKey, variants };
    } catch (err) {
      for (const key of written) {
        await this.storage.delete(store, key).catch(() => undefined);
      }
      throw err;
    }
  }

  /** Largest picture a news source may send (the upload limit). */
  get maxImportBytes(): number {
    return this.storage.maxUploadBytes;
  }

  /**
   * A picture from a news source whose licence covers pictures, for a story
   * made from one of its items: checked and cleaned exactly like an upload,
   * credited to the source, and kept wherever uploads go now. The same
   * picture again reuses its asset. Throws when it can't be used.
   */
  async importImage(
    original: Buffer,
    meta: {
      name: string;
      alt: string;
      credit: string;
      /** Who made the story: a person, or the automation. */
      actor: AuditActor;
    },
  ): Promise<MediaAsset> {
    if (!original.length || original.length > this.maxImportBytes) {
      throw new Error('the picture is empty or too large');
    }
    const kind = sniffImage(original);
    if (!kind) {
      throw new Error("the picture isn't a JPEG, PNG, WebP, GIF or AVIF image");
    }
    const image = await optimizeImage(original, kind);
    if (image.width < MIN_IMPORT_WIDTH || image.height < MIN_IMPORT_HEIGHT) {
      throw new Error(
        `the picture is too small (${image.width}×${image.height})`,
      );
    }
    const sha256 = createHash('sha256').update(image.data).digest('hex');
    const known = await this.prisma.mediaAsset.findFirst({
      where: { sha256, status: MediaStatus.READY },
    });
    if (known) return known;
    const store = await this.storage.uploadStore();
    if (store === MediaStore.LOCAL) {
      const free = await this.storage.local.freeBytes();
      if (free !== null && free - image.data.length < MIN_FREE_BYTES) {
        throw new Error('this server is nearly out of disk space');
      }
    }
    const base = this.storage.newKey('media', '');
    const { storageKey, variants } = await this.writeFiles(store, base, image);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const asset = await tx.mediaAsset.create({
          data: {
            storageKey,
            store,
            originalName: meta.name.slice(0, 200),
            mimeType: WEBP,
            bytes: image.data.length,
            sourceType: IMAGE_MIME[kind],
            sourceBytes: original.length,
            width: image.width,
            height: image.height,
            sha256,
            alt: meta.alt.trim().slice(0, 300),
            credit: meta.credit.trim().slice(0, 200) || null,
            variants: variants as unknown as Prisma.InputJsonValue,
            status: MediaStatus.READY,
          },
        });
        await this.audit.record(
          {
            actor: meta.actor,
            action: 'media.import',
            entityType: 'MediaAsset',
            entityId: asset.id,
            after: {
              name: asset.originalName,
              credit: asset.credit,
              mimeType: asset.mimeType,
              width: asset.width,
              height: asset.height,
            },
          },
          tx,
        );
        return asset;
      });
    } catch (err) {
      // Files written for an asset that was never recorded belong to nothing.
      const keys = [storageKey, ...Object.values(variants).map((v) => v.key)];
      for (const key of keys) {
        await this.storage.delete(store, key).catch(() => undefined);
      }
      throw err;
    }
  }

  async update(
    actor: StaffPrincipal,
    id: string,
    dto: { alt?: string; caption?: string; credit?: string },
    client: ClientInfo,
  ) {
    const asset = await this.find(id);
    if (asset.status !== MediaStatus.READY)
      throw new NotFoundException('Image not found.');
    this.assertMayChange(actor, asset);
    const data = {
      ...(dto.alt !== undefined ? { alt: dto.alt.trim() } : {}),
      ...(dto.caption !== undefined
        ? { caption: dto.caption.trim() || null }
        : {}),
      ...(dto.credit !== undefined
        ? { credit: dto.credit.trim() || null }
        : {}),
    };
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.mediaAsset.update({
        where: { id },
        data,
        include: ASSET_INCLUDE,
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'media.update',
          entityType: 'MediaAsset',
          entityId: id,
          before: {
            alt: asset.alt,
            caption: asset.caption,
            credit: asset.credit,
          },
          after: data,
          ...client,
        },
        tx,
      );
      return updated;
    });
    // Alt text and credits show on the public site.
    await this.cache.invalidate('media');
    return this.view(row);
  }

  async remove(actor: StaffPrincipal, id: string, client: ClientInfo) {
    const asset = await this.find(id);
    if (asset.status === MediaStatus.DELETED) return;
    this.assertMayChange(actor, asset);
    const branding = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM site_settings
      WHERE config::text LIKE ${`%${id}%`}`;
    if (Number(branding[0]?.n ?? 0) > 0) {
      throw new ConflictException(
        'This image is the website’s logo, favicon or share image. Pick another one in Site settings first.',
      );
    }
    const uses = await this.usageCount(id);
    if (uses > 0) {
      throw new ConflictException(
        `This image is used in ${uses} article${uses === 1 ? '' : 's'}. Remove it from ${uses === 1 ? 'that article' : 'them'} first.`,
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.mediaAsset.update({
        where: { id },
        data: { status: MediaStatus.DELETED },
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'media.delete',
          entityType: 'MediaAsset',
          entityId: id,
          before: { name: asset.originalName, alt: asset.alt },
          ...client,
        },
        tx,
      );
    });
    await this.deleteObjects(asset);
  }

  /** Ready images by id, for rendering an article; any other id is refused. */
  async renderMap(ids: string[]): Promise<Map<string, RenderMedia>> {
    const map = new Map<string, RenderMedia>();
    if (ids.length === 0) return map;
    const rows = await this.prisma.mediaAsset.findMany({
      where: { id: { in: ids }, status: MediaStatus.READY },
    });
    if (rows.length !== new Set(ids).size) {
      throw new BadRequestException(
        'An image in this article is no longer in the media library. Replace it and save again.',
      );
    }
    for (const r of rows) {
      map.set(r.id, {
        url: this.storage.publicUrl(r.storageKey),
        width: r.width,
        height: r.height,
        variants: this.variantList(r),
      });
    }
    return map;
  }

  /** A ready image for a featured or social-preview slot. */
  async requireReady(id: string) {
    const row = await this.prisma.mediaAsset.findFirst({
      where: { id, status: MediaStatus.READY },
    });
    if (!row) {
      throw new BadRequestException('Pick an image from the media library.');
    }
    return row;
  }

  /** Articles that show this image (featured, social preview or in the body). */
  private async usageCount(id: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM news_articles
      WHERE "featuredImageId" = ${id}::uuid
         OR content::text LIKE ${`%${id}%`}
         OR seo::text LIKE ${`%${id}%`}`;
    return Number(rows[0]?.n ?? 0);
  }

  private async find(id: string): Promise<AssetRow> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id },
      include: ASSET_INCLUDE,
    });
    if (!asset) throw new NotFoundException('Image not found.');
    return asset;
  }

  /** Your own uploads with media.upload; anyone's with media.manage. */
  private assertMayChange(actor: StaffPrincipal, asset: MediaAsset) {
    if (asset.uploadedById === actor.staffId || has(actor, 'media.manage'))
      return;
    throw new ForbiddenException(
      'You can only change images you uploaded (or need the media.manage permission).',
    );
  }

  /** A rejected upload: forget it and remove the bytes. */
  private async discard(asset: MediaAsset) {
    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { status: MediaStatus.DELETED },
    });
    await this.deleteObjects(asset);
  }

  private async deleteObjects(asset: MediaAsset) {
    const keys = [
      asset.storageKey,
      ...Object.values((asset.variants ?? {}) as unknown as Variants).map(
        (v) => v.key,
      ),
      incomingKey(asset.id),
    ];
    for (const key of keys) {
      try {
        await this.storage.delete(asset.store, key);
      } catch (err) {
        this.logger.warn(`Couldn't delete ${key}: ${(err as Error).message}`);
      }
    }
  }

  /** Smaller copies, narrowest first, as public URLs. */
  private variantList(a: MediaAsset) {
    return Object.values((a.variants ?? {}) as unknown as Variants)
      .sort((x, y) => x.width - y.width)
      .map((v) => ({ url: this.storage.publicUrl(v.key), width: v.width }));
  }
}

/** A request body in memory; past maxBytes it throws TooLargeError. */
async function readBody(body: Readable, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  await pipeline(
    body,
    new Writable({
      write(chunk: Buffer, _encoding, done) {
        bytes += chunk.length;
        if (bytes > maxBytes) return done(new TooLargeError());
        chunks.push(chunk);
        done();
      },
    }),
  );
  return Buffer.concat(chunks, bytes);
}
