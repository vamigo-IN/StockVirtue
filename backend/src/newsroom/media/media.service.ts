import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MediaAsset, MediaStatus, Prisma } from '@prisma/client';
import sharp from 'sharp';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientInfo, StaffPrincipal } from '../../staff/staff-request';
import { StorageService } from '../../storage/storage.service';
import { has } from '../articles/article-access';
import { RenderMedia } from '../content/article-content';
import {
  IMAGE_EXT,
  IMAGE_MIME,
  ImageKind,
  KIND_BY_MIME,
  sniffImage,
} from './image-sniff';

/** Smaller WebP copies for responsive pages and the library grid. */
const VARIANT_WIDTHS = [480, 1200] as const;
/// ~60 megapixels: far beyond any news photo, and stops decompression bombs.
const MAX_PIXELS = 60_000_000;

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
 * The newsroom media library. Browsers upload straight to object storage with
 * a short-lived signed URL; on "complete" the server checks the file really is
 * an image (by its bytes, not its name), re-encodes it so camera metadata such
 * as GPS location is gone, and makes smaller copies for responsive pages.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  view(a: AssetRow | MediaAsset) {
    const variants = (a.variants ?? {}) as unknown as Variants;
    const small = variants.w480?.key ?? variants.w1200?.key ?? a.storageKey;
    const url = this.storage.enabled
      ? this.storage.publicUrl(a.storageKey)
      : null;
    return {
      id: a.id,
      url,
      thumbUrl: this.storage.enabled ? this.storage.publicUrl(small) : null,
      mimeType: a.mimeType,
      bytes: a.bytes,
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
      enabled: this.storage.enabled,
      maxBytes: this.storage.maxUploadBytes,
    };
  }

  /** Step 1: a signed URL the browser uploads the file to. */
  async startUpload(
    actor: StaffPrincipal,
    dto: { filename: string; contentType: string; bytes: number },
  ) {
    if (!this.storage.enabled) {
      throw new ServiceUnavailableException(
        "Media uploads aren't set up yet. Ask an admin to configure Cloudflare R2.",
      );
    }
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
    const asset = await this.prisma.mediaAsset.create({
      data: {
        storageKey: this.storage.newKey('media', IMAGE_EXT[kind]),
        originalName: dto.filename.slice(0, 200),
        mimeType: IMAGE_MIME[kind],
        bytes: dto.bytes,
        status: MediaStatus.PENDING,
        uploadedById: actor.staffId,
      },
      include: ASSET_INCLUDE,
    });
    const upload = await this.storage.presignUpload(
      asset.storageKey,
      IMAGE_MIME[kind],
    );
    return { asset: this.view(asset), upload };
  }

  /** Step 2: verify, clean and resize the uploaded file. */
  async completeUpload(actor: StaffPrincipal, id: string, client: ClientInfo) {
    const asset = await this.find(id);
    if (asset.status === MediaStatus.READY) return this.view(asset);
    if (asset.status !== MediaStatus.PENDING) {
      throw new BadRequestException(
        'This upload was cancelled. Upload the image again.',
      );
    }
    this.assertMayChange(actor, asset);
    const head = await this.storage.head(asset.storageKey);
    if (!head) {
      throw new BadRequestException(
        "The file didn't arrive. Try the upload again.",
      );
    }
    if (head.bytes > this.storage.maxUploadBytes) {
      await this.discard(asset);
      throw new BadRequestException(
        `Images can be up to ${Math.round(this.storage.maxUploadBytes / 1048576)} MB.`,
      );
    }
    const original = await this.storage.getBytes(asset.storageKey);
    const kind = sniffImage(original);
    if (!kind) {
      await this.discard(asset);
      throw new BadRequestException(
        "That file isn't a JPEG, PNG, WebP, GIF or AVIF image.",
      );
    }
    let processed: Awaited<ReturnType<MediaService['processImage']>>;
    try {
      processed = await this.processImage(original, kind);
    } catch (err) {
      this.logger.warn(`Image ${id} rejected: ${(err as Error).message}`);
      await this.discard(asset);
      throw new BadRequestException(
        "That image couldn't be read. It may be damaged or too large.",
      );
    }
    await this.storage.putBytes(
      asset.storageKey,
      processed.data,
      IMAGE_MIME[kind],
    );
    const variants: Variants = {};
    const base = asset.storageKey.replace(/\.[a-z0-9]+$/i, '');
    for (const v of processed.variants) {
      const key = `${base}-w${v.width}.webp`;
      await this.storage.putBytes(key, v.data, 'image/webp');
      variants[`w${v.target}`] = { key, width: v.width, height: v.height };
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.mediaAsset.update({
        where: { id },
        data: {
          status: MediaStatus.READY,
          mimeType: IMAGE_MIME[kind],
          bytes: processed.data.length,
          width: processed.width,
          height: processed.height,
          sha256: createHash('sha256').update(processed.data).digest('hex'),
          variants: variants as unknown as Prisma.InputJsonValue,
        },
        include: ASSET_INCLUDE,
      });
      await this.audit.record(
        {
          actor: { userId: actor.userId, email: actor.email },
          action: 'media.upload',
          entityType: 'MediaAsset',
          entityId: id,
          after: {
            name: asset.originalName,
            mimeType: IMAGE_MIME[kind],
            width: processed.width,
            height: processed.height,
          },
          ...client,
        },
        tx,
      );
      return row;
    });
    return this.view(updated);
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
    return this.view(row);
  }

  async remove(actor: StaffPrincipal, id: string, client: ClientInfo) {
    const asset = await this.find(id);
    if (asset.status === MediaStatus.DELETED) return;
    this.assertMayChange(actor, asset);
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
      const variants = Object.values((r.variants ?? {}) as unknown as Variants)
        .sort((a, b) => a.width - b.width)
        .map((v) => ({ url: this.storage.publicUrl(v.key), width: v.width }));
      map.set(r.id, {
        url: this.storage.publicUrl(r.storageKey),
        width: r.width,
        height: r.height,
        variants,
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

  private async processImage(input: Buffer, kind: ImageKind) {
    const opts = {
      limitInputPixels: MAX_PIXELS,
      animated: true,
      failOn: 'error' as const,
    };
    const meta = await sharp(input, opts).metadata();
    const animated = (meta.pages ?? 1) > 1;
    // Re-encoding drops EXIF (GPS, camera serials), XMP and comments: sharp
    // writes no metadata unless asked to. rotate() applies EXIF orientation.
    let image = sharp(input, opts);
    if (!animated) image = image.rotate();
    switch (kind) {
      case 'jpeg':
        image = image.jpeg({ quality: 85, mozjpeg: true });
        break;
      case 'png':
        image = image.png({ compressionLevel: 9 });
        break;
      case 'webp':
        image = image.webp({ quality: 85 });
        break;
      case 'gif':
        image = image.gif();
        break;
      case 'avif':
        image = image.avif({ quality: 60 });
        break;
    }
    const { data, info } = await image.toBuffer({ resolveWithObject: true });
    const width = info.width;
    const height = animated ? (meta.pageHeight ?? info.height) : info.height;
    const variants: {
      target: number;
      width: number;
      height: number;
      data: Buffer;
    }[] = [];
    if (!animated) {
      for (const target of VARIANT_WIDTHS) {
        if (target >= width) continue;
        const v = await sharp(input, opts)
          .rotate()
          .resize({ width: target, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer({ resolveWithObject: true });
        variants.push({
          target,
          width: v.info.width,
          height: v.info.height,
          data: v.data,
        });
      }
    }
    return { data, width, height, variants };
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
    ];
    for (const key of keys) {
      try {
        await this.storage.delete(key);
      } catch (err) {
        this.logger.warn(`Couldn't delete ${key}: ${(err as Error).message}`);
      }
    }
  }
}
