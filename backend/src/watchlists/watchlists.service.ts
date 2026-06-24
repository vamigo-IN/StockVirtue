import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Exchange } from '../common/exchange';
import { ScripMasterService } from '../market/scrip-master.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmartApiService } from '../smartapi/smartapi.service';

const MAX_WATCHLISTS_PER_USER = 20;
const MAX_ITEMS_PER_WATCHLIST = 50;
const PRISMA_UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class WatchlistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scripMaster: ScripMasterService,
    private readonly smartapi: SmartApiService,
  ) {}

  list(userId: string) {
    return this.prisma.watchlist.findMany({
      where: { userId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      include: { items: { orderBy: { position: 'asc' } } },
    });
  }

  async create(userId: string, rawName: string) {
    const name = rawName.trim();
    const count = await this.prisma.watchlist.count({ where: { userId } });
    if (count >= MAX_WATCHLISTS_PER_USER) {
      throw new BadRequestException(
        `Max ${MAX_WATCHLISTS_PER_USER} watchlists per user`,
      );
    }
    try {
      return await this.prisma.watchlist.create({
        data: { userId, name, position: count },
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new BadRequestException(`Watchlist "${name}" already exists`);
      }
      throw err;
    }
  }

  async rename(userId: string, watchlistId: string, rawName: string) {
    const name = rawName.trim();
    await this.assertOwnership(userId, watchlistId);
    try {
      return await this.prisma.watchlist.update({
        where: { id: watchlistId },
        data: { name },
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new BadRequestException(`Watchlist "${name}" already exists`);
      }
      throw err;
    }
  }

  async remove(userId: string, watchlistId: string) {
    await this.assertOwnership(userId, watchlistId);
    await this.prisma.watchlist.delete({ where: { id: watchlistId } });
    return { ok: true };
  }

  async addItem(
    userId: string,
    watchlistId: string,
    symbol: string,
    exchange: Exchange = 'NSE',
  ) {
    await this.assertOwnership(userId, watchlistId);
    const inst = this.scripMaster.getInstrument(symbol, exchange);
    if (!inst) {
      throw new NotFoundException(
        `Symbol "${symbol}" not found on ${exchange}`,
      );
    }
    const count = await this.prisma.watchlistItem.count({
      where: { watchlistId },
    });
    if (count >= MAX_ITEMS_PER_WATCHLIST) {
      throw new BadRequestException(
        `Max ${MAX_ITEMS_PER_WATCHLIST} items per watchlist`,
      );
    }
    try {
      return await this.prisma.watchlistItem.create({
        data: {
          watchlistId,
          symbol: inst.name,
          tradingsymbol: inst.symbol,
          symboltoken: inst.token,
          exchange: inst.exchange,
          position: count,
        },
      });
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        throw new BadRequestException(
          `${inst.name} (${inst.exchange}) is already in this watchlist`,
        );
      }
      throw err;
    }
  }

  /// Updates each item's `position` to match its index in the supplied
   /// `itemIds` array. We require the array to cover the watchlist's full
   /// item set so a client can't accidentally orphan an item by omitting
   /// it from the new order. Runs as one transaction so a partial failure
   /// can't leave the list in a half-reordered state.
   async reorderItems(
     userId: string,
     watchlistId: string,
     itemIds: string[],
   ) {
     await this.assertOwnership(userId, watchlistId);
     const items = await this.prisma.watchlistItem.findMany({
       where: { watchlistId },
       select: { id: true },
     });
     const existing = new Set(items.map((i) => i.id));
     if (itemIds.length !== existing.size) {
       throw new BadRequestException(
         `Reorder requires all ${existing.size} item ids; got ${itemIds.length}`,
       );
     }
     for (const id of itemIds) {
       if (!existing.has(id)) {
         throw new BadRequestException(`Item ${id} not in this watchlist`);
       }
     }
     await this.prisma.$transaction(
       itemIds.map((id, i) =>
         this.prisma.watchlistItem.update({
           where: { id },
           data: { position: i },
         }),
       ),
     );
     return { ok: true, count: itemIds.length };
   }

  async removeItem(userId: string, watchlistId: string, itemId: string) {
    await this.assertOwnership(userId, watchlistId);
    const item = await this.prisma.watchlistItem.findUnique({
      where: { id: itemId },
    });
    if (!item || item.watchlistId !== watchlistId) {
      throw new NotFoundException('Item not found in this watchlist');
    }
    await this.prisma.watchlistItem.delete({ where: { id: itemId } });
    return { ok: true };
  }

  async quotes(userId: string, watchlistId: string) {
    await this.assertOwnership(userId, watchlistId);
    const items = await this.prisma.watchlistItem.findMany({
      where: { watchlistId },
      orderBy: { position: 'asc' },
    });
    if (items.length === 0) {
      return { watchlistId, items: [], fetchedAt: new Date().toISOString() };
    }
    const byExchange: Record<string, string[]> = {};
    for (const it of items) {
      (byExchange[it.exchange] ??= []).push(it.symboltoken);
    }
    const fetched = await this.smartapi.getMultiQuote(byExchange, 'OHLC');
    const quoteIndex = new Map(
      fetched.map((q) => [`${q.exchange}:${q.symbolToken}`, q]),
    );
    return {
      watchlistId,
      fetchedAt: new Date().toISOString(),
      items: items.map((it) => {
        const q = quoteIndex.get(`${it.exchange}:${it.symboltoken}`);
        return {
          id: it.id,
          symbol: it.symbol,
          tradingsymbol: it.tradingsymbol,
          symboltoken: it.symboltoken,
          exchange: it.exchange,
          quote: q
            ? {
                ltp: q.ltp,
                open: q.open,
                high: q.high,
                low: q.low,
                close: q.close,
              }
            : null,
        };
      }),
    };
  }

  private async assertOwnership(userId: string, watchlistId: string) {
    const wl = await this.prisma.watchlist.findUnique({
      where: { id: watchlistId },
      select: { userId: true },
    });
    if (!wl || wl.userId !== userId) {
      throw new NotFoundException('Watchlist not found');
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === PRISMA_UNIQUE_VIOLATION
    );
  }
}
