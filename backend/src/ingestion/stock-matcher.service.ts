import { Injectable } from '@nestjs/common';
import { CompanyDirectoryService } from '../market/company-directory.service';
import { PrismaService } from '../prisma/prisma.service';
import { StockMatch, StockMatcher } from './stock-matcher';

/** Rebuilt at most this often, and whenever the directory or aliases change. */
const MIN_AGE_MS = 30_000;

/**
 * The stock matcher over NSE's company directory plus the newsroom's aliases
 * (Stock mapping in the portal). Shared by ingestion in the worker and the
 * portal's tester in the API.
 */
@Injectable()
export class StockMatcherService {
  private cached: {
    matcher: StockMatcher;
    stamp: string;
    builtAt: number;
  } | null = null;
  private building: Promise<StockMatcher> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly directory: CompanyDirectoryService,
  ) {}

  async match(text: string, max = 8): Promise<StockMatch[]> {
    return (await this.matcher()).match(text, max);
  }

  async nameOf(symbol: string): Promise<string | null> {
    return (await this.matcher()).nameOf(symbol);
  }

  /** Drop the cached matcher after an alias change. */
  invalidate(): void {
    this.cached = null;
  }

  async matcher(): Promise<StockMatcher> {
    const c = this.cached;
    if (c && Date.now() - c.builtAt < MIN_AGE_MS) return c.matcher;
    this.building ??= this.build().finally(() => (this.building = null));
    return this.building;
  }

  private async build(): Promise<StockMatcher> {
    const snap = this.directory.snapshot();
    const agg = await this.prisma.newsStockAlias.aggregate({
      _count: { _all: true },
      _max: { createdAt: true },
    });
    const stamp = `${snap.version}:${snap.count}:${agg._count._all}:${agg._max.createdAt?.getTime() ?? 0}`;
    if (this.cached?.stamp === stamp) {
      this.cached.builtAt = Date.now();
      return this.cached.matcher;
    }
    const aliases = await this.prisma.newsStockAlias.findMany({
      select: { alias: true, symbol: true },
    });
    const matcher = new StockMatcher(Object.entries(snap.names), aliases);
    this.cached = { matcher, stamp, builtAt: Date.now() };
    return matcher;
  }
}
