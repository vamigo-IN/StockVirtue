import { createHmac, timingSafeEqual } from 'node:crypto';

/// Synchroniser-token CSRF for the admin panel (Admin Shield spec §22).
///
/// The token is an HMAC of the active session id under the admin session
/// secret. That means:
///   * no server-side token store is needed,
///   * it is bound to one session, so it can't be replayed across logins,
///   * revoking the session invalidates every outstanding token for free.
///
/// This complements — it does not replace — `SameSite=Strict` on the auth
/// cookie. Origin/Referer checking is deliberately NOT reintroduced: it was
/// removed earlier because the production reverse proxy produced false
/// positives (see the comment block in admin-auth.guard.ts).
export function csrfToken(sessionId: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`csrf:${sessionId}`)
    .digest('base64url');
}

/// Constant-time check of a submitted CSRF token against the session.
/// Fails closed on anything missing or malformed.
export function verifyCsrf(
  token: string | null | undefined,
  sessionId: string | null | undefined,
  secret: string,
): boolean {
  if (!token || !sessionId || !secret) return false;
  const expected = Buffer.from(csrfToken(sessionId, secret));
  const actual = Buffer.from(token);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

/// Hidden form input carrying the token. Nothing needs escaping — the token is
/// base64url, so it is already attribute-safe.
export function csrfInput(token: string): string {
  return `<input type="hidden" name="_csrf" value="${token}" />`;
}

const POST_FORM_RE = /<form\b[^>]*\bmethod\s*=\s*["']post["'][^>]*>/gi;

/// Adds the hidden CSRF field to every `method="post"` form in an HTML string.
export function injectCsrf(html: string, token: string): string {
  if (!token || !html.includes('<form')) return html;
  return html.replace(POST_FORM_RE, (open) => `${open}${csrfInput(token)}`);
}

/// Wraps `res.send` so any HTML this response emits gets the CSRF field added
/// to its POST forms automatically.
///
/// Done here, once, rather than threading a token through ~35 `layout()` call
/// sites in the controller: that would be 35 chances to forget one, and a
/// forgotten token is a form that silently 403s in production. The admin panel
/// is server-rendered HTML with no client framework, so response rewriting is
/// the natural seam. Non-string bodies (redirects, JSON) pass through
/// untouched.
export function attachCsrfInjection(
  res: { send: (body: unknown) => unknown },
  token: string,
): void {
  const original = res.send.bind(res);
  res.send = (body: unknown) => {
    if (typeof body === 'string') return original(injectCsrf(body, token));
    return original(body);
  };
}
