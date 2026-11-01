import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import {
  CARD_SELECT,
  listedWhere,
  PublicCard,
  toCard,
} from '../public/public-articles';
import { normalizeDoc, PmNode, renderBlocks } from './article-content';
import {
  cleanWidget,
  DISCLAIMERS,
  DisclaimerVariant,
  WidgetConfig,
  WidgetType,
} from './widget-registry';

export const ARTICLE_BASE = '/news';

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

/**
 * Turns a stored story into the blocks the website, the app and the portal
 * preview draw: sanitised HTML runs, and widgets with their saved settings
 * resolved (a story embedding a saved widget always shows its current
 * version) and the few extras only the server knows.
 */
@Injectable()
export class ArticleBlocksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  async blocks(
    content: Prisma.JsonValue,
    article: {
      id: string;
      categoryId: string | null;
      stocks: { exchange: string; symbol: string }[];
    },
    audience: 'public' | 'staff',
  ): Promise<ReaderBlock[]> {
    let doc: PmNode;
    let mediaIds: string[];
    let relatedIds: string[];
    try {
      const n = normalizeDoc(content);
      doc = n.doc;
      mediaIds = n.mediaIds;
      relatedIds = n.relatedIds;
    } catch {
      // A story that no longer passes the allowlist shows nothing rather
      // than anything unchecked.
      return [];
    }
    const [media, relatedRows] = await Promise.all([
      this.media.renderMap(mediaIds).catch(() => new Map()),
      relatedIds.length
        ? this.prisma.newsArticle.findMany({
            where: { id: { in: relatedIds } },
            select: { id: true, title: true, slug: true },
          })
        : Promise.resolve([]),
    ]);
    const raw = renderBlocks(doc, {
      media,
      related: new Map(
        relatedRows.map((r) => [r.id, { title: r.title, slug: r.slug }]),
      ),
      articleBase: ARTICLE_BASE,
    });

    const savedIds = [
      ...new Set(
        raw.flatMap((b) =>
          b.type === 'widget' && b.widgetId ? [b.widgetId] : [],
        ),
      ),
    ];
    const saved = new Map(
      (savedIds.length
        ? await this.prisma.marketWidget.findMany({
            where: { id: { in: savedIds } },
          })
        : []
      ).map((w) => [w.id, w]),
    );

    const out: ReaderBlock[] = [];
    for (const b of raw) {
      if (b.type === 'html') {
        out.push(b);
        continue;
      }
      let block: WidgetBlock = { ...b };
      if (b.widgetId) {
        const w = saved.get(b.widgetId);
        if (!w) continue;
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
          continue;
        }
      }
      out.push(await this.enrich(block, article, audience));
    }
    return out;
  }

  private async enrich(
    b: WidgetBlock,
    article: {
      id: string;
      categoryId: string | null;
      stocks: { exchange: string; symbol: string }[];
    },
    audience: 'public' | 'staff',
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
    audience: 'public' | 'staff',
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
