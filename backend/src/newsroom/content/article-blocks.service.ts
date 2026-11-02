import { Injectable } from '@nestjs/common';
import { MarketWidget, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import {
  CARD_SELECT,
  listedWhere,
  PublicCard,
  toCard,
} from '../public/public-articles';
import {
  normalizeDoc,
  PmNode,
  RenderContext,
  renderBlocks,
  renderHtml,
} from './article-content';
import {
  cleanWidget,
  DISCLAIMERS,
  DisclaimerVariant,
  WidgetConfig,
  WidgetType,
} from './widget-registry';

export const ARTICLE_BASE = '/news';

/**
 * Version of the document the app's native reader gets. Raise it only for a
 * change older apps would draw wrongly; new node or widget types don't need
 * it, because readers show a "read on the website" card for anything unknown.
 */
export const APP_DOC_VERSION = 1;

/** A widget block as readers' apps receive it. */
export interface WidgetBlock {
  type: 'widget';
  widget: WidgetType;
  v: number;
  config: WidgetConfig;
  widgetId?: string;
  /** Server-side extras: disclaimer wording, related-story cards. */
  data?: Record<string, unknown>;
}
export type ReaderBlock = { type: 'html'; html: string } | WidgetBlock;

type Audience = 'public' | 'staff';

interface ArticleRef {
  id: string;
  categoryId: string | null;
  stocks: { exchange: string; symbol: string }[];
}

/**
 * Turns a stored story into what readers get: for the website and the
 * portal preview, sanitised HTML runs with widgets between; for the app, the
 * clean document itself. Either way images and related stories are resolved
 * (public readers see only related stories that are themselves listed),
 * widgets embedding a saved widget show its current version, and the few
 * extras only the server knows are filled in.
 */
@Injectable()
export class ArticleBlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async blocks(
    content: Prisma.JsonValue,
    article: ArticleRef,
    audience: Audience,
  ): Promise<ReaderBlock[]> {
    const p = await this.prepare(content, audience);
    return p ? this.widgetBlocks(p.doc, p.ctx, article, audience) : [];
  }

  /** The blocks, plus the whole story as one HTML string. */
  async reader(
    content: Prisma.JsonValue,
    article: ArticleRef,
    audience: Audience,
  ): Promise<{ blocks: ReaderBlock[]; html: string } | null> {
    const p = await this.prepare(content, audience);
    if (!p) return null;
    return {
      blocks: await this.widgetBlocks(p.doc, p.ctx, article, audience),
      html: renderHtml(p.doc, p.ctx),
    };
  }

  /**
   * The story for the app's native reader: the normalized ProseMirror
   * document (only allowlisted nodes, marks and attributes) with each image's
   * files, each related story's address and title, and each widget's current
   * settings and extras added to its attributes. Images that aren't ready
   * and related stories readers can't see are left out.
   */
  async appDoc(
    content: Prisma.JsonValue,
    article: ArticleRef,
  ): Promise<PmNode | null> {
    const p = await this.prepare(content, 'public');
    if (!p) return null;
    const saved = await this.savedWidgets(
      (p.doc.content ?? []).flatMap((n) =>
        n.type === 'marketWidget' && typeof n.attrs?.widgetId === 'string'
          ? [n.attrs.widgetId]
          : [],
      ),
    );
    const visit = async (node: PmNode): Promise<PmNode | null> => {
      const a = node.attrs ?? {};
      switch (node.type) {
        case 'image': {
          const m = p.ctx.media.get(String(a.mediaId));
          if (!m) return null;
          return {
            type: 'image',
            attrs: {
              ...a,
              src: {
                url: m.url,
                width: m.width,
                height: m.height,
                variants: m.variants,
              },
            },
          };
        }
        case 'relatedArticle': {
          const r = p.ctx.related.get(String(a.articleId));
          if (!r) return null;
          return {
            type: 'relatedArticle',
            attrs: { articleId: a.articleId, slug: r.slug, title: r.title },
          };
        }
        case 'video':
          return { type: 'video', attrs: { ...a, ...videoLinks(a) } };
        case 'marketWidget': {
          const w = await this.resolveWidget(
            {
              widget: a.widget as WidgetType,
              v: Number(a.v) || 1,
              config: (a.config ?? {}) as WidgetConfig,
              ...(typeof a.widgetId === 'string'
                ? { widgetId: a.widgetId }
                : {}),
            },
            saved,
            article,
            'public',
          );
          if (!w) return null;
          return {
            type: 'marketWidget',
            attrs: {
              widget: w.widget,
              v: w.v,
              config: w.config,
              ...(w.widgetId ? { widgetId: w.widgetId } : {}),
              ...(w.data ? { data: w.data } : {}),
            },
          };
        }
      }
      if (!node.content) return node;
      const kids: PmNode[] = [];
      for (const c of node.content) {
        const v = await visit(c);
        if (v) kids.push(v);
      }
      return { ...node, content: kids };
    };
    return visit(p.doc);
  }

  // ── Internals ───────────────────────────────────────────────────────

  /** The clean document and what rendering it needs, or null if it no longer passes the allowlist. */
  private async prepare(
    content: Prisma.JsonValue,
    audience: Audience,
  ): Promise<{ doc: PmNode; ctx: RenderContext } | null> {
    let n: ReturnType<typeof normalizeDoc>;
    try {
      n = normalizeDoc(content);
    } catch {
      // A story that no longer passes the allowlist shows nothing rather
      // than anything unchecked.
      return null;
    }
    const [media, relatedRows] = await Promise.all([
      this.media.renderMap(n.mediaIds).catch(() => new Map()),
      n.relatedIds.length
        ? this.prisma.newsArticle.findMany({
            where: {
              AND: [
                { id: { in: n.relatedIds } },
                // Staff previews may link to stories that aren't out yet.
                audience === 'public' ? listedWhere() : {},
              ],
            },
            select: { id: true, title: true, slug: true },
          })
        : Promise.resolve([]),
    ]);
    return {
      doc: n.doc,
      ctx: {
        media,
        related: new Map(
          relatedRows.map((r) => [r.id, { title: r.title, slug: r.slug }]),
        ),
        articleBase: ARTICLE_BASE,
      },
    };
  }

  private async widgetBlocks(
    doc: PmNode,
    ctx: RenderContext,
    article: ArticleRef,
    audience: Audience,
  ): Promise<ReaderBlock[]> {
    const raw = renderBlocks(doc, ctx);
    const saved = await this.savedWidgets(
      raw.flatMap((b) =>
        b.type === 'widget' && b.widgetId ? [b.widgetId] : [],
      ),
    );
    const out: ReaderBlock[] = [];
    for (const b of raw) {
      if (b.type === 'html') {
        out.push(b);
        continue;
      }
      const w = await this.resolveWidget(b, saved, article, audience);
      if (w) out.push(w);
    }
    return out;
  }

  private async savedWidgets(
    ids: string[],
  ): Promise<Map<string, MarketWidget>> {
    const unique = [...new Set(ids)];
    if (!unique.length) return new Map();
    const rows = await this.prisma.marketWidget.findMany({
      where: { id: { in: unique } },
    });
    return new Map(rows.map((w) => [w.id, w]));
  }

  /** A widget as readers get it, or null when its saved widget is gone or no longer valid. */
  private async resolveWidget(
    b: {
      widget: WidgetType;
      v: number;
      config: WidgetConfig;
      widgetId?: string;
    },
    saved: Map<string, MarketWidget>,
    article: ArticleRef,
    audience: Audience,
  ): Promise<WidgetBlock | null> {
    let block: WidgetBlock = {
      type: 'widget',
      widget: b.widget,
      v: b.v,
      config: b.config,
      ...(b.widgetId ? { widgetId: b.widgetId } : {}),
    };
    if (b.widgetId) {
      const w = saved.get(b.widgetId);
      if (!w) return null;
      try {
        const clean = cleanWidget(w.type, w.config);
        block = {
          type: 'widget',
          widgetId: w.id,
          widget: clean.widget,
          v: clean.v,
          config: clean.config,
        };
      } catch {
        return null;
      }
    }
    return this.enrich(block, article, audience);
  }

  private async enrich(
    b: WidgetBlock,
    article: ArticleRef,
    audience: Audience,
  ): Promise<WidgetBlock> {
    switch (b.widget) {
      case 'risk_disclaimer':
        return {
          ...b,
          data: {
            text:
              DISCLAIMERS[b.config.variant as DisclaimerVariant] ??
              DISCLAIMERS.general,
          },
        };
      case 'related_stocks': {
        const symbols = b.config.symbols as string[];
        if (symbols.length) return b;
        return {
          ...b,
          config: {
            ...b.config,
            symbols: article.stocks
              .filter((s) => s.exchange === 'NSE' || s.exchange === 'BSE')
              .map((s) => `${s.exchange}:${s.symbol}`),
          },
        };
      }
      case 'related_news':
        return {
          ...b,
          data: { cards: await this.relatedCards(b.config, article, audience) },
        };
      default:
        return b;
    }
  }

  private async relatedCards(
    config: WidgetConfig,
    article: { id: string; categoryId: string | null },
    audience: Audience,
  ): Promise<PublicCard[]> {
    const limit = config.limit as number;
    const image = (a: Parameters<MediaService['publicImage']>[0]) =>
      this.media.publicImage(a);
    if (config.mode === 'manual') {
      const ids = config.articleIds as string[];
      const rows = await this.prisma.newsArticle.findMany({
        where: {
          AND: [
            { id: { in: ids } },
            audience === 'public' ? listedWhere() : {},
          ],
        },
        select: CARD_SELECT,
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids
        .map((id) => byId.get(id))
        .filter((r): r is NonNullable<typeof r> => !!r && !!r.publishedAt)
        .slice(0, limit)
        .map((r) => toCard(r, image));
    }
    if (!article.categoryId) return [];
    const rows = await this.prisma.newsArticle.findMany({
      where: {
        AND: [
          listedWhere(),
          { categoryId: article.categoryId },
          { id: { not: article.id } },
        ],
      },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: CARD_SELECT,
    });
    return rows.map((r) => toCard(r, image));
  }
}

/** Where the app sends a reader for a video: the watch page and, for YouTube, a still. */
function videoLinks(a: Record<string, unknown>): {
  url: string;
  thumbnail: string | null;
} {
  const id = encodeURIComponent(typeof a.videoId === 'string' ? a.videoId : '');
  return a.provider === 'vimeo'
    ? { url: `https://vimeo.com/${id}`, thumbnail: null }
    : {
        url: `https://www.youtube.com/watch?v=${id}`,
        thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      };
}
