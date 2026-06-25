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
/// served on. We compare HOSTNAMES (ignoring port) against the raw Host header,
/// X-Forwarded-Host, and an optional PUBLIC_URL.
///
/// Crucially, if EVERY host candidate is a loopback/private address, the
/// reverse proxy obscured our real public host (e.g. it proxies to
/// localhost:3000 without forwarding Host / X-Forwarded-Host) and we can't
/// positively validate the origin — so we fall back to the SameSite=strict
/// session cookie, which already gated this request above (a cross-site POST
/// never carries it). When the public host IS known, a genuine cross-site
/// Origin still fails to match and is rejected.
function isSameSite(source: string, req: Request): boolean {
  const sourceHost = hostFromUrl(source);
  if (!sourceHost) return false;

  const candidates = new Set<string>();
  addHostHeader(req.headers['x-forwarded-host'], candidates);
  addHostHeader(req.headers.host, candidates);
  const publicHost = hostFromUrl(process.env.PUBLIC_URL ?? '');
  if (publicHost) candidates.add(publicHost);

  if (candidates.has(sourceHost)) return true;

  if (candidates.size > 0 && [...candidates].every(isPrivateHost)) {
    return true;
  }
  return false;
}

/// Parses a full URL → hostname; null if not a URL.
function hostFromUrl(value: string): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

/// Adds the hostname from a Host-style header (may carry a port or, for
/// X-Forwarded-Host, a comma-separated chain whose first hop is ours).
function addHostHeader(
  value: string | string[] | undefined,
  out: Set<string>,
): void {
  if (!value) return;
  const raw = Array.isArray(value) ? value[0] : value;
  const first = raw.split(',')[0].trim();
  if (!first) return;
  const host = hostFromUrl(`http://${first}`);
  if (host) out.add(host);
}

/// Loopback / RFC-1918 private hosts a reverse proxy typically uses internally.
function isPrivateHost(h: string): boolean {
  if (h === 'localhost' || h === '0.0.0.0' || h === '::1') return true;
  if (h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (/^127\./.test(h)) return true;
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}
