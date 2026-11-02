import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

/** Exchanges whose holdings and watchlist entries count as following a company. */
export const FOLLOW_EXCHANGES = ['NSE', 'BSE', 'NFO', 'BFO'];

export interface NewsAlerts {
  breaking: boolean;
  followedStocks: boolean;
}

const DEFAULTS: NewsAlerts = { breaking: true, followedStocks: true };

/**
 * A reader's news pushes: breaking news, and stories about the stocks they
 * follow (anything in their watchlists or portfolio). Both are on until the
 * reader turns them off; the worker reads these when it sends.
 */
@Injectable()
export class NewsAlertsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async get(userId: string) {
    const [row, followed] = await Promise.all([
      this.prisma.newsAlertPreference.findUnique({ where: { userId } }),
      this.followedSymbols(userId),
    ]);
    return {
      breaking: row?.breaking ?? DEFAULTS.breaking,
      followedStocks: row?.followedStocks ?? DEFAULTS.followedStocks,
      followedCount: followed,
    };
  }

  async set(userId: string, patch: Partial<NewsAlerts>) {
    await this.prisma.newsAlertPreference.upsert({
      where: { userId },
      create: { userId, ...DEFAULTS, ...patch },
      update: patch,
    });
    return this.get(userId);
  }

  /**
   * A reader opened a news push: counted once per reader and push, and only
   * for readers it was sent to (the worker's record of who got the story).
   */
  async opened(userId: string, campaignId: string) {
    const campaign = await this.prisma.notificationCampaign.findUnique({
      where: { id: campaignId },
      select: { articleId: true },
    });
    if (!campaign?.articleId) return;
    try {
      const sent = await this.redis.client.sismember(
        `news:push:sent:${campaign.articleId}`,
        userId,
      );
      if (!sent) return;
      const first = await this.redis.client.set(
        `news:push:open:${campaignId}:${userId}`,
        '1',
        'EX',
        7 * 86_400,
        'NX',
      );
      if (first !== 'OK') return;
    } catch {
      return;
    }
    await this.prisma.notificationCampaign.updateMany({
      where: { id: campaignId },
      data: { opens: { increment: 1 } },
    });
  }

  /** How many companies the reader follows through watchlists and holdings. */
  private async followedSymbols(userId: string): Promise<number> {
    const [{ n }] = await this.prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM (
        SELECT wi.symbol FROM watchlist_items wi
          JOIN watchlists w ON w.id = wi."watchlistId"
         WHERE w."userId" = ${userId} AND wi.exchange = ANY(${FOLLOW_EXCHANGES})
        UNION
        SELECT p.symbol FROM positions p
         WHERE p."userId" = ${userId} AND p.quantity <> 0
           AND p.exchange = ANY(${FOLLOW_EXCHANGES})
      ) s`;
    return Number(n);
  }
}
