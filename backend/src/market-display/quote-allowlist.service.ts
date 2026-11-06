import { Injectable } from '@nestjs/common';
import { CAP_LISTS } from '../market/cap-segments';
import { constituentsFor } from '../market/index-constituents';
import { listedWhere } from '../newsroom/public/public-articles';
import { PrismaService } from '../prisma/prisma.service';
import { MarketClock } from './market-clock';

const YES_FOR_MS = 60_000;
const NO_FOR_MS = 15_000;

/** The indices whose members the website's heatmap shows. */
const HEATMAP_INDICES = ['NIFTY', 'BANKNIFTY', 'SENSEX'] as const;

/**
 * The stocks the website lists by name, as "NSE:SYMBOL" refs: every stock in
 * the movers' large, mid and small cap lists, and every member of the Nifty
 * 50, Bank Nifty and Sensex (the heatmaps). Their stock pages always have a
 * price. Built from those lists at start-up, so it follows them; a stock on
 * two lists (CONCOR) counts once.
 */
export const TRACKED_STOCK_REFS: ReadonlySet<string> = new Set([
  ...Object.values(CAP_LISTS)
    .flat()
    .map((symbol) => `NSE:${symbol.toUpperCase()}`),
  ...HEATMAP_INDICES.flatMap((index) => {
    const set = constituentsFor(index);
    return set
      ? set.members.map((m) => `${set.exchange}:${m.symbol.toUpperCase()}`)
      : [];
  }),
]);

/**
 * Which listed stocks the PUBLIC market API may quote: the curated list, the
 * stocks the website lists by name (TRACKED_STOCK_REFS), plus stocks that
 * published stories reference (related stocks, or widgets in the story or in
 * a saved widget it embeds). Editors' previews use the staff API instead.
 * This keeps the public API from becoming a free price feed for the whole
 * exchange.
 */
@Injectable()
export class QuoteAllowlistService {
  private readonly memo = new Map<string, { ok: boolean; until: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: MarketClock,
  ) {}

  /** The subset of `refs` ("NSE:INFY") the public may see. */
  async allowed(refs: string[]): Promise<Set<string>> {
    const now = this.clock.now();
    const out = new Set<string>();
    const unknown: string[] = [];
    for (const ref of refs) {
      // Tracked stocks need no query (and take no room in the memo).
      if (TRACKED_STOCK_REFS.has(ref)) {
        out.add(ref);
        continue;
      }
      const hit = this.memo.get(ref);
      if (hit && hit.until > now) {
        if (hit.ok) out.add(ref);
      } else {
        unknown.push(ref);
      }
    }
    if (unknown.length) {
      const found = await this.lookup(unknown);
      for (const ref of unknown) {
        const ok = found.has(ref);
        this.memo.set(ref, { ok, until: now + (ok ? YES_FOR_MS : NO_FOR_MS) });
        if (ok) out.add(ref);
      }
      if (this.memo.size > 5_000) this.memo.clear();
    }
    return out;
  }

  private async lookup(refs: string[]): Promise<Set<string>> {
    const pairs = refs.map((r) => {
      const [exchange, symbol] = r.split(':');
      return { exchange, symbol };
    });
    const listed = listedWhere();
    const [curated, stocks, inline, saved] = await Promise.all([
      this.prisma.marketInstrument.findMany({
        where: { isEnabled: true, OR: pairs },
        select: { exchange: true, symbol: true },
      }),
      this.prisma.newsArticleStock.findMany({
        where: { OR: pairs, article: listed },
        select: { exchange: true, symbol: true },
      }),
      this.prisma.newsWidgetInstance.findMany({
        where: { symbols: { hasSome: refs }, article: listed },
        select: { symbols: true },
      }),
      this.prisma.marketWidget.findMany({
        where: {
          symbols: { hasSome: refs },
          instances: { some: { article: listed } },
        },
        select: { symbols: true },
      }),
    ]);
    const found = new Set<string>();
    for (const r of [...curated, ...stocks])
      found.add(`${r.exchange}:${r.symbol}`);
    for (const r of [...inline, ...saved])
      r.symbols.forEach((s) => found.add(s));
    return found;
  }
}
