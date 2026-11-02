import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SecretBoxService } from '../common/secret-box';
import { MarketModule } from '../market/market.module';
import { NewsroomModule } from '../newsroom/newsroom.module';
import { QueueModule, QUEUES } from '../queue/queue.module';
import { StaffModule } from '../staff/staff.module';
import { EditorAlertsService } from './editor-alerts.service';
import { IngestQueue } from './ingest.queue';
import { IngestService } from './ingest.service';
import {
  SimilarStoriesController,
  SourceItemsController,
  SourcesController,
  StockMappingController,
} from './ingestion.controllers';
import { SourceItemsService } from './source-items.service';
import { SourcesService } from './sources.service';
import { StockMappingService } from './stock-mapping.service';
import { StockMatcherService } from './stock-matcher.service';

/**
 * News ingestion's API side: sources, the Incoming news list, stock mapping.
 * Polling and fetching run in the newsroom worker (IngestProcessor); the API
 * only tests sources and queues Fetch now / Retry.
 */
@Module({
  imports: [
    StaffModule,
    NewsroomModule,
    MarketModule,
    AiModule,
    QueueModule,
    BullModule.registerQueue({ name: QUEUES.ingest }),
  ],
  controllers: [
    SourcesController,
    SourceItemsController,
    SimilarStoriesController,
    StockMappingController,
  ],
  providers: [
    SecretBoxService,
    StockMatcherService,
    EditorAlertsService,
    IngestService,
    IngestQueue,
    SourcesService,
    SourceItemsService,
    StockMappingService,
  ],
  exports: [SourcesService],
})
export class IngestionModule {}
