import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import configuration from '../config/configuration';
import { validationSchema } from '../config/validation.schema';
import { ArticlePublisher } from '../newsroom/publishing/article-publisher';
import {
  PublishingProcessor,
  PublishingScheduler,
} from '../newsroom/publishing/publishing.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { QueueModule, QUEUES } from '../queue/queue.module';
import {
  MaintenanceProcessor,
  MaintenanceScheduler,
} from './maintenance.processor';

/**
 * The newsroom worker process (src/worker.ts). It must load ONLY newsroom
 * modules: the trading engine's timers (settlement, auto square-off,
 * snapshots, room lifecycle) live in the API process and assume they run
 * exactly once, and the worker must never open its own Angel One connection.
 * worker.module.spec.ts enforces this.
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
    QueueModule,
    BullModule.registerQueue({ name: QUEUES.maintenance }),
    BullModule.registerQueue({ name: QUEUES.publishing }),
  ],
  providers: [
    MaintenanceProcessor,
    MaintenanceScheduler,
    ArticlePublisher,
    PublishingProcessor,
    PublishingScheduler,
  ],
})
export class WorkerModule {}
