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
      const host = req.headers.host;
      const source = req.headers.origin || req.headers.referer;
      if (source && (!host || !sameOrigin(source, host))) {
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

function sameOrigin(source: string, host: string): boolean {
  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}
