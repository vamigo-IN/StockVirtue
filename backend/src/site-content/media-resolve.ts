import { Injectable } from '@nestjs/common';
import { MediaStatus } from '@prisma/client';
import { MediaService } from '../newsroom/media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import type { Db } from './db';

/** A screen as the website gets it (a `Screen` for DeviceFrame). */
export interface ServedScreen {
  src: string;
  width: number;
  height: number;
  srcSet?: string;
  alt: string;
  captured: string;
  theme: 'light' | 'dark';
}
/** A photo as the website gets it (the w480 copy). */
export interface ServedPhoto {
  src: string;
  width: number | null;
  height: number | null;
  srcSet?: string;
  alt: string;
}

interface Asset {
  url: string;
  width: number | null;
  height: number | null;
  variants: { url: string; width: number }[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isScreen = (o: Record<string, unknown>) => typeof o.mediaId === 'string' && o.noPersonalData === true;
const isPhoto = (o: Record<string, unknown>) =>
  typeof o.mediaId === 'string' && 'alt' in o && !('type' in o) && !('noPersonalData' in o);
const isImageNode = (o: Record<string, unknown>) =>
  o.type === 'image' && isObj(o.attrs) && typeof o.attrs.mediaId === 'string';

function srcSet(a: Asset): string | undefined {
  const parts = a.variants.map((v) => `${v.url} ${v.width}w`);
  if (a.width) parts.push(`${a.url} ${a.width}w`);
  return parts.length ? parts.join(', ') : undefined;
}

/**
 * Turns stored media ids into what readers get, at read time (W7 addendum
 * §3.1, §7.1): content stores ids only, never URLs. A missing or deleted
 * asset becomes null (a document image keeps its node with `src: null`), so
 * the slot falls back to its text-only layout; never an error.
 */
@Injectable()
export class MediaResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  /** Every media id in a stored content (screens, photos, document images). */
  static idsOf(content: unknown): string[] {
    const out = new Set<string>();
    const walk = (v: unknown) => {
      if (Array.isArray(v)) return v.forEach(walk);
      if (!isObj(v)) return;
      if (isScreen(v) || isPhoto(v)) out.add(String(v.mediaId).toLowerCase());
      if (isImageNode(v)) out.add(String((v.attrs as Record<string, unknown>).mediaId).toLowerCase());
      for (const k of Object.keys(v)) walk(v[k]);
    };
    walk(content);
    return [...out];
  }

  async assets(ids: readonly string[], db: Db = this.prisma): Promise<Map<string, Asset>> {
    const map = new Map<string, Asset>();
    if (ids.length === 0) return map;
    const rows = await db.mediaAsset.findMany({
      where: { id: { in: [...ids] }, status: MediaStatus.READY },
    });
    for (const r of rows) {
      const img = this.media.publicImage(r);
      if (img) map.set(r.id, { url: img.url, width: img.width, height: img.height, variants: img.variants });
    }
    return map;
  }

  /** READY ids among these (for the save-time check). */
  async readyIds(ids: readonly string[], db: Db = this.prisma): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await db.mediaAsset.findMany({
      where: { id: { in: [...ids] }, status: MediaStatus.READY },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  /** A copy of the content with every media reference resolved. */
  async resolve<T>(content: T): Promise<T> {
    const map = await this.assets(MediaResolver.idsOf(content));
    return MediaResolver.apply(content, map) as T;
  }

  static apply(v: unknown, map: Map<string, Asset>): unknown {
    if (Array.isArray(v)) return v.map((x) => MediaResolver.apply(x, map));
    if (!isObj(v)) return v;
    if (isScreen(v)) {
      const a = map.get(String(v.mediaId).toLowerCase());
      if (!a || !a.width || !a.height) return null;
      const s: ServedScreen = {
        src: a.url,
        width: a.width,
        height: a.height,
        alt: String(v.alt ?? ''),
        captured: String(v.captured ?? ''),
        theme: v.theme === 'dark' ? 'dark' : 'light',
      };
      const set = srcSet(a);
      if (set) s.srcSet = set;
      return s;
    }
    if (isPhoto(v)) {
      const a = map.get(String(v.mediaId).toLowerCase());
      if (!a) return null;
      const small = a.variants.find((x) => x.width === 480) ?? a.variants[0];
      const width = small ? small.width : a.width;
      const height =
        small && a.width && a.height ? Math.round((small.width * a.height) / a.width) : a.height;
      const p: ServedPhoto = { src: small ? small.url : a.url, width, height, alt: String(v.alt ?? '') };
      const set = srcSet(a);
      if (set) p.srcSet = set;
      return p;
    }
    if (isImageNode(v)) {
      const attrs = v.attrs as Record<string, unknown>;
      const a = map.get(String(attrs.mediaId).toLowerCase());
      return {
        ...v,
        attrs: {
          ...attrs,
          src: a ? a.url : null,
          width: a?.width ?? null,
          height: a?.height ?? null,
          srcSet: a ? (srcSet(a) ?? null) : null,
        },
      };
    }
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v)) out[k] = MediaResolver.apply(v[k], map);
    return out;
  }
}
