import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { ADMIN_COOKIE_NAME, readCookie } from './admin-session';

/// Guard for every page under /admin (except /admin/login and the
/// login POST handler). On a missing or invalid session we redirect to
/// the login form rather than throw — admin routes are HTML, not JSON.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AdminAuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const token = readCookie(req.headers.cookie, ADMIN_COOKIE_NAME);
    const payload = this.auth.verifySessionCookie(token);
    if (!payload) {
      // Preserve the requested URL so the post-login redirect lands
      // back where the operator was trying to go.
      const back = encodeURIComponent(req.originalUrl || '/admin');
      res.redirect(`/admin/login?back=${back}`);
      return false;
    }
    // CSRF defence for state-changing requests: a present Origin/Referer must
    // be same-origin. Combined with the SameSite=strict admin cookie (a
    // cross-site POST won't even carry the session), this blocks cross-site
    // form submissions against the panel. We only reject when a source header
    // is present AND mismatched — if both are absent (some privacy setups
    // strip them) we fall back to the SameSite cookie rather than locking out
    // a legitimate operator.
    const method = req.method.toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      const source = req.headers.origin || req.headers.referer;
      if (source && !isSameSite(source, req)) {
        res.status(403).type('html').send('Forbidden (CSRF check failed)');
        return false;
      }
    }

    // Stash for controllers that want to know who's signed in (the sidebar
    // shows the email; the audit log reads this).
    (req as Request & { adminId?: string }).adminId = payload.aid;
    return true;
  }
}

/// True when the Origin/Referer's hostname matches the host this request was
/// served on. We compare HOSTNAMES (ignoring port) and accept either the raw
/// Host header or X-Forwarded-Host, so the check keeps passing behind a
/// TLS-terminating reverse proxy (where the public host — e.g. the prod domain
/// on :443 — differs from the internal host:port the app binds to). A genuine
/// cross-site Origin still fails to match, and the SameSite=strict cookie
/// remains the primary CSRF defence.
function isSameSite(source: string, req: Request): boolean {
  let sourceHost: string;
  try {
    sourceHost = new URL(source).hostname;
  } catch {
    return false;
  }
  const candidates = new Set<string>();
  const add = (value?: string | string[]) => {
    if (!value) return;
    const raw = Array.isArray(value) ? value[0] : value;
    // X-Forwarded-Host can be a comma-separated chain; the first hop is ours.
    const first = raw.split(',')[0].trim();
    if (first) candidates.add(hostnameOf(first));
  };
  add(req.headers['x-forwarded-host']);
  add(req.headers.host);
  return candidates.has(sourceHost);
}

/// Strips the port from a Host header value, IPv6-safe.
function hostnameOf(hostHeader: string): string {
  try {
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    return hostHeader.split(':')[0];
  }
}
