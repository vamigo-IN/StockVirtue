import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ScripMasterService } from '../../market/scrip-master.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WidgetConfig, WidgetType, widgetRefs } from './widget-registry';

export interface WidgetUse {
  widget: WidgetType;
  config: WidgetConfig;
  widgetId?: string;
}

/**
 * Checks that the instruments a widget names exist: listed stocks against
 * the scrip master, indices / commodities / currencies against the curated
 * market list, saved widgets against the library. Shared by articles and
 * the saved-widget library.
 */
@Injectable()
export class WidgetValidation {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scripMaster: ScripMasterService,
  ) {}

  /** Every instrument a widget quotes, as "EX:SYMBOL". */
  symbolsOf(w: Pick<WidgetUse, 'widget' | 'config'>): string[] {
    const refs = widgetRefs(w.widget, w.config);
    return [...new Set([...refs.stocks, ...refs.curated])];
  }

  async check(widgets: WidgetUse[]): Promise<void> {
    if (widgets.length === 0) return;
    // A ref is a listed stock, a curated instrument, or, in chart fields,
    // either (NSE:NIFTY is a curated index; NSE:INFY may be any stock).
    const stocks = new Set<string>();
    const curated = new Set<string>();
    const either = new Set<string>();
    const savedIds = new Set<string>();
    for (const w of widgets) {
      const refs = widgetRefs(w.widget, w.config);
      for (const r of refs.stocks) {
        (refs.curated.includes(r) ? either : stocks).add(r);
      }
      for (const r of refs.curated) {
        if (!refs.stocks.includes(r)) curated.add(r);
      }
      if (w.widgetId) savedIds.add(w.widgetId);
    }

    const have = await this.curatedRefs([...curated, ...either]);
    const eitherStocks = [...either].filter((r) => !have.has(r));

    if (stocks.size || eitherStocks.length) {
      if (!this.scripMaster.isReady()) {
        throw new ServiceUnavailableException(
          'The stock list is still loading. Try again in a minute.',
        );
      }
      for (const ref of stocks) {
        const [exchange, symbol] = ref.split(':') as ['NSE' | 'BSE', string];
        if (!this.scripMaster.getEquity(symbol, exchange)) {
          throw new BadRequestException(
            `${symbol} isn’t a listed ${exchange} stock.`,
          );
        }
      }
      for (const ref of eitherStocks) {
        const [exchange, symbol] = ref.split(':') as ['NSE' | 'BSE', string];
        if (!this.scripMaster.getEquity(symbol, exchange)) {
          throw new BadRequestException(
            `${symbol} isn’t a listed ${exchange} stock or on the market list.`,
          );
        }
      }
    }

    if (curated.size) {
      const absent = [...curated].find((r) => !have.has(r));
      if (absent) {
        throw new BadRequestException(
          `${absent.split(':')[1]} isn’t on the market list. Add it under Market data first.`,
        );
      }
    }

    if (savedIds.size) {
      const n = await this.prisma.marketWidget.count({
        where: { id: { in: [...savedIds] } },
      });
      if (n !== savedIds.size) {
        throw new BadRequestException(
          'A saved widget in this story no longer exists. Remove it and save again.',
        );
      }
    }
  }

  /** Which of `refs` are on the curated market list (on or off). */
  private async curatedRefs(refs: string[]): Promise<Set<string>> {
    if (refs.length === 0) return new Set();
    const pairs = refs.map((r) => {
      const i = r.indexOf(':');
      return { exchange: r.slice(0, i), symbol: r.slice(i + 1) };
    });
    const found = await this.prisma.marketInstrument.findMany({
      where: { OR: pairs },
      select: { exchange: true, symbol: true },
    });
    return new Set(found.map((f) => `${f.exchange}:${f.symbol}`));
  }
}
