/**
 * The staff session cookie. It holds the opaque newsroom session token and is
 * readable only by this Next.js server (httpOnly), which forwards it to the
 * API; the browser's JavaScript never sees it. SameSite=Strict keeps other
 * sites from riding on it, and in production the __Host- prefix pins it to
 * this exact host over HTTPS.
 */
const PROD = process.env.NODE_ENV === 'production';

export const STAFF_COOKIE = PROD ? '__Host-sv_staff' : 'sv_staff';

export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: PROD,
    sameSite: 'strict' as const,
    path: '/',
    expires,
  };
}

/**
 * Error codes the API sends when a staff session can't be used any more. The
 * portal clears the cookie and sends the person back to sign in.
 */
export const SESSION_END_CODES = [
  'staff_session_required',
  'staff_session_expired',
  'staff_session_idle',
  'staff_session_revoked',
  'staff_suspended',
  'staff_blocked',
  'staff_no_access',
] as const;

export type SessionEndCode = (typeof SESSION_END_CODES)[number];

export function isSessionEnd(code: unknown): code is SessionEndCode {
  return (
    typeof code === 'string' &&
    (SESSION_END_CODES as readonly string[]).includes(code)
  );
}

/** What the sign-in page says after a session ended. */
export const SESSION_END_MESSAGES: Record<SessionEndCode, string> = {
  staff_session_required: 'Sign in to the newsroom to continue.',
  staff_session_expired: 'Your session reached its time limit. Sign in again.',
  staff_session_idle:
    'You were signed out after a period of inactivity. Sign in again.',
  staff_session_revoked:
    'Your session was ended by a newsroom admin or from another of your devices. Sign in again.',
  staff_suspended:
    'Your newsroom access is suspended. Ask a newsroom admin to restore it.',
  staff_blocked: 'This account is blocked.',
  staff_no_access: "This account doesn't have access to the newsroom.",
};

/** Only same-portal paths may be used as a post-sign-in destination. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/admin') || next.startsWith('//')) {
    return '/admin';
  }
  if (/^\/admin\/(login|invite|api)(\/|$|\?)/.test(next)) return '/admin';
  return next;
}
