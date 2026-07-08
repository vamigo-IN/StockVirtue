import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { MonitoringService } from './monitoring.service';

/// Global guard that rejects requests from IPs on the monitoring blocklist.
/// The check is an O(1) in-memory Set lookup (the blocklist is refreshed from
/// Redis every ~10s by MonitoringService), so it adds no per-request Redis
/// round-trip. IPs are added manually from the admin panel, or automatically
/// only when MONITORING_AUTO_BLOCK is enabled.
@Injectable()
export class IpBlockGuard implements CanActivate {
  constructor(private readonly monitoring: MonitoringService) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    if (this.monitoring.isIpBlocked(req.ip)) {
      throw new ForbiddenException('Access denied.');
    }
    return true;
  }
}
