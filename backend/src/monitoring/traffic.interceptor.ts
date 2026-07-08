import { randomUUID } from 'node:crypto';
import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';
import { MonitoringService } from './monitoring.service';

/// Express request enriched by our guards: passport sets `user`, AdminGuard
/// sets `adminId`. (`req.route` is already on Express's Request, typed loosely.)
interface AuthedRequest extends Request {
  user?: { id?: string };
  adminId?: string;
}

/// Collapses long/opaque path segments (ids, cuids, tokens, numbers) to ":id"
/// so unmatched routes still bucket cleanly instead of exploding the label set.
function normalizePath(path: string): string {
  return (
    path
      .split('/')
      .map((seg) => {
        if (!seg) return seg;
        if (/^\d+$/.test(seg)) return ':id';
        if (/^c[a-z0-9]{20,}$/.test(seg)) return ':id'; // cuid
        if (seg.length >= 24) return ':id'; // long token
        return seg;
      })
      .slice(0, 8)
      .join('/') || '/'
  );
}

/// Global interceptor that records every request into the monitoring
/// subsystem. All work is post-response and fire-and-forget — it never awaits
/// the record and never throws into the request path.
@Injectable()
export class TrafficInterceptor implements NestInterceptor {
  constructor(private readonly monitoring: MonitoringService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http' || !this.monitoring.isEnabled()) {
      return next.handle();
    }
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const start = Date.now();

    // Correlation id: echo an inbound one or mint a fresh id.
    const requestId =
      (req.headers['x-request-id'] as string | undefined) || randomUUID();
    res.setHeader('x-request-id', requestId);

    const finish = (status: number) => {
      const routeTemplate = (req.route as { path?: string } | undefined)?.path;
      const base = req.baseUrl || '';
      const route = routeTemplate
        ? `${base}${routeTemplate}`
        : normalizePath(req.path || req.originalUrl || '/');
      const userId = req.user?.id ?? req.adminId ?? null;
      void this.monitoring.record({
        method: req.method,
        route,
        status,
        latencyMs: Date.now() - start,
        userId,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        requestId,
      });
    };

    return next.handle().pipe(
      tap({
        next: () => finish(res.statusCode),
        // On error the filter hasn't set the status yet — derive it from the
        // thrown exception.
        error: (err: unknown) =>
          finish(err instanceof HttpException ? err.getStatus() : 500),
      }),
    );
  }
}
