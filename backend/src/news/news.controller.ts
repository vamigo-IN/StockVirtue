import { Controller, Get, Query } from '@nestjs/common';
import { NewsService } from './news.service';

@Controller('news')
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get()
  async list(
    @Query('symbol') symbol?: string,
    @Query('limit') limitRaw = '20',
  ) {
    const limit = parseInt(limitRaw, 10) || 20;
    const items = await this.news.getNews({ symbol, limit });
    return { items, fetchedAt: new Date().toISOString() };
  }
}
