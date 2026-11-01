import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';

/** Queue names. One per kind of newsroom work, so each can scale and fail alone. */
export const QUEUES = {
  maintenance: 'newsroom-maintenance',
  /** Scheduled article publishing (delayed jobs plus a one-minute sweep). */
  publishing: 'newsroom-publishing',
} as const;

/**
 * BullMQ on the existing Redis. Import this module, then
 * `BullModule.registerQueue({ name: QUEUES.x })` where a queue is used.
 * Queue keys live under QUEUE_PREFIX so they never collide with the API's
 * own Redis keys.
 */
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const redis = config.get('redis', { infer: true });
        return {
          prefix: config.get('queue', { infer: true }).prefix,
          connection: {
            host: redis.host,
            port: redis.port,
            password: redis.password || undefined,
          },
        };
      },
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
