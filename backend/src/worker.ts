import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module';

// Same timezone rule as the API (see main.ts): logs read in IST.
process.env.TZ = process.env.TZ || 'Asia/Kolkata';

/**
 * Newsroom background worker: `node dist/worker.js`, run as its own pm2 app
 * next to the API. No HTTP server — it only consumes BullMQ queues.
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  new Logger('Worker').log('StockVirtue newsroom worker started');
}
void bootstrap();
