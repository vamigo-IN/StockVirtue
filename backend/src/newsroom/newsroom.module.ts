import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SecretBoxService } from '../common/secret-box';
import { MarketModule } from '../market/market.module';
import { QueueModule, QUEUES } from '../queue/queue.module';
import { StaffModule } from '../staff/staff.module';
import { ArticleCollabController } from './articles/article-collab.controller';
import { ArticleCollabService } from './articles/article-collab.service';
import { ArticleWorkflowService } from './articles/article-workflow.service';
import { ArticlesController } from './articles/articles.controller';
import { ArticlesService } from './articles/articles.service';
import { StockSearchController } from './articles/stock-search.controller';
import { ArticleBlocksService } from './content/article-blocks.service';
import { WidgetValidation } from './content/widget-validation.service';
import { HomepageController } from './homepage/homepage.controller';
import { HomepageService } from './homepage/homepage.service';
import { MediaController } from './media/media.controller';
import { MediaService } from './media/media.service';
import { MediaStorageController } from './media/media-storage.controller';
import { MediaStorageService } from './media/media-storage.service';
import { NewsCache } from './public/news-cache';
import { PublicNewsController } from './public/public-news.controller';
import { PublicNewsService } from './public/public-news.service';
import { SiteRevalidator } from './public/site-revalidator';
import { NewsAlertsService } from './readers/news-alerts.service';
import { NewsBookmarksService } from './readers/news-bookmarks.service';
import { NewsReaderController } from './readers/news-reader.controller';
import { PublishingQueue } from './publishing/publishing.queue';
import { TaxonomyController } from './taxonomy/taxonomy.controller';
import { TaxonomyService } from './taxonomy/taxonomy.service';

/**
 * The editorial newsroom (API side): articles and their workflow, comments
 * and assignments, categories, tags, bylines and the media library, plus the
 * public news API (/api/v1/news) and the homepage layout. Prisma, Audit,
 * Redis and Storage are global; StaffModule provides @StaffOnly; MarketModule
 * supplies the in-memory stock list for related stocks. Scheduled articles
 * are published by the worker (see publishing/).
 */
@Module({
  imports: [
    StaffModule,
    MarketModule,
    QueueModule,
    BullModule.registerQueue({ name: QUEUES.publishing }),
  ],
  controllers: [
    ArticlesController,
    ArticleCollabController,
    TaxonomyController,
    MediaController,
    MediaStorageController,
    StockSearchController,
    HomepageController,
    // Before PublicNewsController: /news/bookmarks is not an article address.
    NewsReaderController,
    PublicNewsController,
  ],
  providers: [
    ArticlesService,
    ArticleWorkflowService,
    ArticleCollabService,
    TaxonomyService,
    MediaService,
    MediaStorageService,
    SecretBoxService,
    PublishingQueue,
    NewsCache,
    SiteRevalidator,
    HomepageService,
    PublicNewsService,
    WidgetValidation,
    ArticleBlocksService,
    NewsBookmarksService,
    NewsAlertsService,
  ],
  exports: [ArticlesService, NewsCache, SiteRevalidator, WidgetValidation],
})
export class NewsroomModule {}
