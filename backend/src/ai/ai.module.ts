import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SecretBoxService } from '../common/secret-box';
import { NewsroomModule } from '../newsroom/newsroom.module';
import { QueueModule, QUEUES } from '../queue/queue.module';
import { StaffModule } from '../staff/staff.module';
import { AiAutoDraftService } from './ai-auto-draft.service';
import { AiJobsService } from './ai-jobs.service';
import { AiQueue } from './ai-queue';
import { AiSettingsService } from './ai-settings.service';
import { AiController } from './ai.controller';

/**
 * The AI assistant's API side: settings, providers, requests and history.
 * Requests run in the newsroom worker (AiRunner), never in the API process.
 */
@Module({
  imports: [
    StaffModule,
    NewsroomModule,
    QueueModule,
    BullModule.registerQueue({ name: QUEUES.ai }),
  ],
  controllers: [AiController],
  providers: [
    SecretBoxService,
    AiSettingsService,
    AiQueue,
    AiJobsService,
    AiAutoDraftService,
  ],
  exports: [AiSettingsService, AiAutoDraftService],
})
export class AiModule {}
