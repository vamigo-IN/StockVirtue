import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { IpBlockGuard } from './ip-block.guard';
import { MonitoringJobsService } from './monitoring-jobs.service';
import { MonitoringService } from './monitoring.service';
import { TrafficInterceptor } from './traffic.interceptor';

/// Traffic monitoring & data-misuse detection. Global so the request-logging
/// interceptor and IP-block guard cover every route (/api/* and /admin/*).
/// PrismaModule + RedisModule are already @Global, so nothing extra is needed.
/// MonitoringService is exported for the admin dashboard's Traffic page.
@Global()
@Module({
  providers: [
    MonitoringService,
    MonitoringJobsService,
    { provide: APP_INTERCEPTOR, useClass: TrafficInterceptor },
    { provide: APP_GUARD, useClass: IpBlockGuard },
  ],
  exports: [MonitoringService],
})
export class MonitoringModule {}
