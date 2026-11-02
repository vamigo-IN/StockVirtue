import { Controller, Get, Query } from '@nestjs/common';
import { MarketService } from '../../market/market.service';
import { StaffOnly } from '../../staff/staff-auth.guard';
import { StockSearchQueryDto } from './articles.dto';

/**
 * Listed companies for an article's "Related stocks". Served from the
 * in-memory scrip master and NSE company list: no broker call is made.
 */
@Controller({ path: 'staff/stocks', version: '1' })
export class StockSearchController {
  constructor(private readonly market: MarketService) {}

  @StaffOnly('news.read')
  @Get('search')
  search(@Query() q: StockSearchQueryDto) {
    const term = q.q?.trim() ?? '';
    if (!term) return { results: [] };
    const results = this.market
      .search(term, 'NSE', 30)
      .filter((r) => r.type === 'EQUITY')
      .slice(0, 10)
      .map((r) => ({
        symbol: r.symbol,
        exchange: r.exchange,
        name: r.companyName,
      }));
    return { results };
  }
}
