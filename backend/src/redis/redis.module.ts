import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisService } from './redis.service';
import { AppConfig } from '../config/configuration';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const cfg = config.get('redis', { infer: true });
        const logger = new Logger('RedisClient');
        const client = new Redis({
          host: cfg.host,
          port: cfg.port,
          password: cfg.password || undefined,
          lazyConnect: false,
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
        });
        client.on('connect', () => logger.log(`connecting to ${cfg.host}:${cfg.port}`));
        client.on('ready', () => logger.log('ready'));
        client.on('error', (err) => logger.error(`error: ${err.message}`));
        client.on('end', () => logger.warn('connection closed'));
        return client;
      },
    },
    RedisService,
  ],
  exports: [RedisService, REDIS_CLIENT],
})
export class RedisModule {}
