import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MediaAsset } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import {
  CARD_SELECT,
  PublicCard,
  publicWhere,
  toCard,
} from '../public/public-articles';

/// Saved stories per reader, at most.
export const MAX_BOOKMARKS = 1000;
const PAGE_SIZE = 20;

export interface BookmarkCard extends PublicCard {
  bookmarkedAt: Date;
  /** Retracted since it was saved: still readable, with the notice. */
  retracted: boolean;
}

/**
 * A reader's saved stories, one list per account for the app and the
 * website. Only stories readers can see can be saved, and only those are
 * listed; a story that comes down keeps its bookmark and reappears if it
 * goes back up.
 */
@Injectable()
export class NewsBookmarksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
  ) {}

  private readonly image = (a: MediaAsset | null) => this.media.publicImage(a);

  async add(userId: string, articleId: string) {
    const live = await this.prisma.newsArticle.findFirst({
      where: { AND: [publicWhere(), { id: articleId }] },
      select: { id: true },
    });
    if (!live) throw new NotFoundException('Article not found.');
    const existing = await this.prisma.newsBookmark.findUnique({
      where: { userId_articleId: { userId, articleId } },
      select: { id: true },
    });
    if (existing) return { bookmarked: true };
    const count = await this.prisma.newsBookmark.count({ where: { userId } });
    if (count >= MAX_BOOKMARKS) {
      throw new BadRequestException(
        `You can save up to ${MAX_BOOKMARKS.toLocaleString('en-IN')} stories. Remove some first.`,
      );
    }
    await this.prisma.newsBookmark.createMany({
      data: [{ userId, articleId }],
      skipDuplicates: true,
    });
    return { bookmarked: true };
  }

  async remove(userId: string, articleId: string) {
    await this.prisma.newsBookmark.deleteMany({ where: { userId, articleId } });
    return { bookmarked: false };
  }

  /** Ids of every saved story readers can see, newest first: for marking cards. */
  async ids(userId: string) {
    const rows = await this.prisma.newsBookmark.findMany({
      where: { userId, article: publicWhere() },
      orderBy: { createdAt: 'desc' },
      take: MAX_BOOKMARKS,
      select: { articleId: true },
    });
    return { ids: rows.map((r) => r.articleId) };
  }

  /** Saved stories, most recently saved first. */
  async list(userId: string, page = 1, limit = PAGE_SIZE) {
    const size = Math.min(Math.max(limit, 1), 50);
    const where = { userId, article: publicWhere() };
    const [total, rows] = await Promise.all([
      this.prisma.newsBookmark.count({ where }),
      this.prisma.newsBookmark.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * size,
        take: size,
        select: {
          createdAt: true,
          article: { select: { ...CARD_SELECT, retractedAt: true } },
        },
      }),
    ]);
    const items: BookmarkCard[] = rows.map((r) => ({
      ...toCard(r.article, this.image),
      bookmarkedAt: r.createdAt,
      retracted: r.article.retractedAt !== null,
    }));
    return {
      items,
      page,
      pageSize: size,
      total,
      totalPages: Math.max(1, Math.ceil(total / size)),
    };
  }
}
