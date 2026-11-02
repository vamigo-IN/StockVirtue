import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiAutoDraftService } from '../ai/ai-auto-draft.service';
import { AiQueue } from '../ai/ai-queue';
import { AiRunner } from '../ai/ai-runner.service';
import { AiSettingsService } from '../ai/ai-settings.service';
import { AiProcessor, AiScheduler } from '../ai/ai.processor';
import { AuditModule } from '../audit/audit.module';
import { SecretBoxService } from '../common/secret-box';
import configuration from '../config/configuration';
import { validationSchema } from '../config/validation.schema';
import { EditorAlertsService } from '../ingestion/editor-alerts.service';
import {
  IngestProcessor,
  IngestScheduler,
} from '../ingestion/ingest.processor';
import { IngestService } from '../ingestion/ingest.service';
import { StockMatcherService } from '../ingestion/stock-matcher.service';
import { MailModule } from '../mail/mail.module';
import { CompanyDirectoryService } from '../market/company-directory.service';
import { NewsCache } from '../newsroom/public/news-cache';
import { SiteRevalidator } from '../newsroom/public/site-revalidator';
import { ArticlePublisher } from '../newsroom/publishing/article-publisher';
import {
  PublishingProcessor,
  PublishingScheduler,
} from '../newsroom/publishing/publishing.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule, QUEUES } from '../queue/queue.module';
import { RedisModule } from '../redis/redis.module';
import {
  MaintenanceProcessor,
  MaintenanceScheduler,
} from './maintenance.processor';

/**
 * The newsroom worker process (src/worker.ts). It must load ONLY newsroom
 * modules: the trading engine's timers (settlement, auto square-off,
 * snapshots, room lifecycle) live in the API process and assume they run
 * exactly once, and the worker must never open its own Angel One connection.
 * worker.module.spec.ts enforces this. The company directory (NSE's list of
 * company names, for stock mapping) is provided on its own: it has no broker
 * dependencies and reads the API's cached copy.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: { abortEarly: false },
      cache: true,
    }),
    PrismaModule,
    AuditModule,
    RedisModule,
    MailModule,
    QueueModule,
    BullModule.registerQueue({ name: QUEUES.maintenance }),
    BullModule.registerQueue({ name: QUEUES.publishing }),
    BullModule.registerQueue({ name: QUEUES.ingest }),
    BullModule.registerQueue({ name: QUEUES.ai }),
  ],
  providers: [
    MaintenanceProcessor,
    MaintenanceScheduler,
    ArticlePublisher,
    NewsCache,
    SiteRevalidator,
    PublishingProcessor,
    PublishingScheduler,
    // News ingestion
    SecretBoxService,
    CompanyDirectoryService,
    StockMatcherService,
    EditorAlertsService,
    IngestService,
    IngestProcessor,
    IngestScheduler,
    // AI assistant
    AiSettingsService,
    AiQueue,
    AiAutoDraftService,
    AiRunner,
    AiProcessor,
    AiScheduler,
  ],
})
export class WorkerModule {}
