import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { AdminAuthService } from './admin-auth.service';
import { attachCsrfInjection, csrfToken, verifyCsrf } from './admin-csrf';
import { ADMIN_COOKIE_NAME, readCookie } from './admin-session';

/// Request-time gate for every page under /admin except the login and
/// second-factor routes. On a missing/invalid/revoked session we redirect to
/// the login form rather than throw — admin routes render HTML, not JSON.
///
/// This is now ASYNC and DB-backed: the cookie alone is no longer trusted. The
/// session row is consulted on every request, which is what makes "one active
/// session only", the idle timeout, and hijack response actually enforceable.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly auth: AdminAuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const token = readCookie(req.headers.cookie, ADMIN_COOKIE_NAME);
    const payload = this.auth.verifySessionCookie(token);
    if (!payload?.sid) {
      // Cookies minted before Admin Shield carry no `sid` and fail closed here.
      return this.bounce(req, res);
    }

    const session = await this.auth.findSession(payload.sid);
    if (!session || session.adminId !== payload.aid) {
      return this.bounce(req, res);
    }

    // Revoked / expired / idled-out (spec §16).
    const expiry = this.auth.sessionExpiryReason(session);
    if (expiry) {
      await this.auth.revokeSession(session.id, expiry);
      return this.bounce(req, res);
    }

    // Session-hijack detection (spec §24). The fingerprint is derived from the
    // User-Agent plus client signals; a changed UA on a live session means the
    // cookie moved to a different client. The IP is deliberately NOT part of
    // this check — mobile networks and CGNAT re-address constantly, and
    // bouncing the operator on every IP change would be a self-DoS.
    const ua = (req.headers['user-agent'] ?? '').slice(0, 400);
    if (session.userAgent && ua && session.userAgent !== ua) {
      await this.auth.revokeSession(
        session.id,
        'user-agent changed mid-session',
      );
      return this.bounce(req, res);
    }

    // CSRF (spec §22). SameSite=Strict on the cookie is the first line — a
    // cross-site POST arrives without it and dies at the session check above.
    // Synchroniser tokens are defence in depth for state-changing methods.
    // Origin/Referer checking is deliberately NOT used: behind the TLS-
    // terminating proxy those headers produced false rejections for
    // legitimate same-site actions.
    if (STATE_CHANGING.has(req.method)) {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const submitted =
        typeof body._csrf === 'string'
          ? body._csrf
          : (req.headers['x-csrf-token'] as string | undefined);
      if (!verifyCsrf(submitted, session.id, this.auth.sessionSecret)) {
        res.status(403).type('html');
        res.setHeader('Cache-Control', 'no-store, max-age=0');
        res.send(
          '<p>Security check failed. Reload the admin page and try again.</p>',
        );
        return false;
      }
    }

    // Idle-timeout bookkeeping. Fire-and-forget: a write failure must not
    // fail an otherwise valid request.
    void this.auth.touchSession(session.id);

    // Every POST form this response renders gets the matching CSRF field, so
    // the check above can be enforced without threading a token through every
    // view call site.
    const csrf = csrfToken(session.id, this.auth.sessionSecret);
    attachCsrfInjection(res, csrf);

    // Authenticated admin HTML must never be cached: it carries session state,
    // and a back-button or shared-proxy replay would be a disclosure. Set here
    // rather than per-handler so no protected route can forget it.
    res.setHeader('Cache-Control', 'no-store, max-age=0');

    const r = req as Request & {
      adminId?: string;
      adminSessionId?: string;
      adminCsrf?: string;
    };
    r.adminId = payload.aid;
    r.adminSessionId = session.id;
    r.adminCsrf = csrf;
    return true;
  }

  /// Writes the redirect itself and returns false. AllExceptionsFilter has an
  /// explicit `headersSent` guard precisely because of this contract.
  private bounce(req: Request, res: Response): boolean {
    const back = encodeURIComponent(req.originalUrl || '/admin');
    res.redirect(`/admin/login?back=${back}`);
    return false;
  }
}

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
