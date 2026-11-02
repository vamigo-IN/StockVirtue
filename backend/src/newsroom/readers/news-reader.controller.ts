import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { IsBoolean, IsOptional } from 'class-validator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PageQueryDto } from '../public/public-news.dto';
import { NewsAlertsService } from './news-alerts.service';
import { NewsBookmarksService } from './news-bookmarks.service';

class NewsAlertsDto {
  @IsOptional()
  @IsBoolean()
  breaking?: boolean;

  @IsOptional()
  @IsBoolean()
  followedStocks?: boolean;
}

/**
 * What a signed-in reader keeps: saved stories and news alerts. Same
 * accounts as the app (and the website, once readers sign in there), so a
 * story saved on one shows on the other. Registered before the public news
 * controller, so /news/bookmarks is never read as an article address.
 */
@Controller({ path: 'news', version: '1' })
@UseGuards(JwtAuthGuard)
export class NewsReaderController {
  constructor(
    private readonly bookmarks: NewsBookmarksService,
    private readonly alerts: NewsAlertsService,
  ) {}

  @Get('bookmarks')
  list(@CurrentUser() user: User, @Query() q: PageQueryDto) {
    return this.bookmarks.list(user.id, q.page, q.limit);
  }

  @Get('bookmarks/ids')
  ids(@CurrentUser() user: User) {
    return this.bookmarks.ids(user.id);
  }

  @Post(':id/bookmark')
  @HttpCode(200)
  add(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookmarks.add(user.id, id);
  }

  @Delete(':id/bookmark')
  remove(@CurrentUser() user: User, @Param('id', ParseUUIDPipe) id: string) {
    return this.bookmarks.remove(user.id, id);
  }

  @Get('me/alerts')
  getAlerts(@CurrentUser() user: User) {
    return this.alerts.get(user.id);
  }

  @Put('me/alerts')
  setAlerts(@CurrentUser() user: User, @Body() dto: NewsAlertsDto) {
    // @IsOptional lets null through; only true/false change a setting.
    return this.alerts.set(user.id, {
      ...(typeof dto.breaking === 'boolean' ? { breaking: dto.breaking } : {}),
      ...(typeof dto.followedStocks === 'boolean'
        ? { followedStocks: dto.followedStocks }
        : {}),
    });
  }

  /** The app reports a tapped news push, for the campaign's open count. */
  @Post('push/:campaignId/opened')
  @HttpCode(202)
  async opened(
    @CurrentUser() user: User,
    @Param('campaignId', ParseUUIDPipe) campaignId: string,
  ) {
    await this.alerts.opened(user.id, campaignId);
    return { ok: true };
  }
}
