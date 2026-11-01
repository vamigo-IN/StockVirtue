import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QueueModule, QUEUES } from '../queue/queue.module';
import { StaffModule } from '../staff/staff.module';
import { ArticleCollabController } from './articles/article-collab.controller';
import { ArticleCollabService } from './articles/article-collab.service';
import { ArticleWorkflowService } from './articles/article-workflow.service';
import { ArticlesController } from './articles/articles.controller';
import { ArticlesService } from './articles/articles.service';
import { MediaController } from './media/media.controller';
import { MediaService } from './media/media.service';
import { PublishingQueue } from './publishing/publishing.queue';
import { TaxonomyController } from './taxonomy/taxonomy.controller';
import { TaxonomyService } from './taxonomy/taxonomy.service';

/**
 * The editorial newsroom (API side): articles and their workflow, comments
 * and assignments, categories, tags, bylines and the media library. Prisma,
 * Audit and Storage are global; StaffModule provides @StaffOnly. Scheduled
 * articles are published by the worker (see publishing/).
 */
@Module({
  imports: [
    StaffModule,
    QueueModule,
    BullModule.registerQueue({ name: QUEUES.publishing }),
  ],
  controllers: [
    ArticlesController,
    ArticleCollabController,
    TaxonomyController,
    MediaController,
  ],
  providers: [
    ArticlesService,
    ArticleWorkflowService,
    ArticleCollabService,
    TaxonomyService,
    MediaService,
    PublishingQueue,
  ],
  exports: [ArticlesService],
})
export class NewsroomModule {}
