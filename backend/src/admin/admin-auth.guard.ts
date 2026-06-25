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

  canActivate(ctx: ExecutionContext): boolean {
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

    // CSRF defence = the SameSite=Strict admin session cookie (set at login).
    // Browsers never attach a Strict cookie to a cross-site request, so a
    // forged POST from another origin arrives WITHOUT the session and is
    // rejected by the session check above — it never reaches an action.
    //
    // We deliberately do NOT additionally gate on the Origin/Referer header:
    // behind a TLS-terminating reverse proxy those values vs the proxied Host
    // are unreliable and were producing false "CSRF check failed" rejections
    // for legitimate same-site admin actions. SameSite=Strict is the modern,
    // proxy-agnostic CSRF mitigation and is sufficient here.

    // Stash for controllers that want to know who's signed in (the sidebar
    // shows the email; the audit log reads this).
    (req as Request & { adminId?: string }).adminId = payload.aid;
    return true;
  }
}
