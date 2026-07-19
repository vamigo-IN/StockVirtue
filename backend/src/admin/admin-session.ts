import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/// Self-contained signed-cookie sessions for the admin dashboard. We
/// deliberately don't reuse the user JWT secrets here — admin auth is a
/// separate threat model (one credential, no refresh flow) and keeping
/// the keys distinct means a leak of either secret doesn't escalate to
/// the other.
///
/// Token shape (urlsafe base64 throughout, dot-separated):
///   `<payload>.<sig>` where
///   payload = base64url(JSON({ aid: <adminId>, iat, exp, nonce }))
///   sig     = HMAC-SHA256(payload, sessionSecret)

export interface AdminSessionPayload {
  aid: string;
  /// AdminSession row id. The cookie alone is no longer sufficient: the guard
  /// looks this row up on every request, which is what makes a session
  /// revocable server-side (single-active-session, idle timeout, hijack
  /// response). Cookies minted before Admin Shield lack it and fail closed.
  sid: string;
  iat: number;
  exp: number;
  /// Random 96-bit nonce so two same-second logins produce different tokens.
  nonce: string;
}

/// Short-lived token identifying an in-progress login that has cleared the
/// password stage but not yet OTP + passcode. It is NOT an auth cookie and
/// grants nothing except the right to submit factors for one login session.
export interface AdminPendingPayload {
  /// AdminLoginSession row id.
  lsid: string;
  iat: number;
  exp: number;
  nonce: string;
}

export const ADMIN_COOKIE_NAME = 'stockvirtue_admin_session';
export const ADMIN_PENDING_COOKIE_NAME = 'stockvirtue_admin_pending';

/// HMAC-signs an arbitrary payload object into `<payloadB64>.<sig>`.
function sign<T extends object>(payload: T, secret: string): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

/// Verifies the signature and expiry of a token produced by [sign].
function verify<T extends { exp: number }>(
  token: string | null | undefined,
  secret: string,
): T | null {
  if (!token || !secret) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  const expectedSig = createHmac('sha256', secret).update(payloadB64).digest();
  // NOTE: Buffer.from(x,'base64url') never throws — it silently drops invalid
  // characters — so the length guard below, not a try/catch, is what keeps
  // timingSafeEqual from throwing on a malformed signature.
  const actualSig = Buffer.from(sigPart, 'base64url');
  if (
    expectedSig.length !== actualSig.length ||
    !timingSafeEqual(expectedSig, actualSig)
  ) {
    return null;
  }
  let payload: T;
  try {
    payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8'),
    ) as T;
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number') return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function signAdminSession(
  adminId: string,
  sessionId: string,
  ttlSeconds: number,
  secret: string,
): { token: string; payload: AdminSessionPayload } {
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET (or JWT_REFRESH_SECRET) not set');
  }
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    aid: adminId,
    sid: sessionId,
    iat: now,
    exp: now + ttlSeconds,
    nonce: randomBytes(12).toString('base64url'),
  };
  return { token: sign(payload, secret), payload };
}

export function verifyAdminSession(
  token: string | null | undefined,
  secret: string,
): AdminSessionPayload | null {
  const p = verify<AdminSessionPayload>(token, secret);
  if (!p || typeof p.aid !== 'string' || !p.aid) return null;
  return p;
}

export function signPendingLogin(
  loginSessionId: string,
  ttlSeconds: number,
  secret: string,
): string {
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET (or JWT_REFRESH_SECRET) not set');
  }
  const now = Math.floor(Date.now() / 1000);
  return sign<AdminPendingPayload>(
    {
      lsid: loginSessionId,
      iat: now,
      exp: now + ttlSeconds,
      nonce: randomBytes(12).toString('base64url'),
    },
    secret,
  );
}

export function verifyPendingLogin(
  token: string | null | undefined,
  secret: string,
): AdminPendingPayload | null {
  const p = verify<AdminPendingPayload>(token, secret);
  if (!p || typeof p.lsid !== 'string' || !p.lsid) return null;
  return p;
}

/// Parses the first occurrence of [name] out of a raw `Cookie:` header
/// value. Returns null if the header is missing or doesn't include the
/// cookie. We avoid `cookie-parser` so the admin module can stay
/// self-contained.
export function readCookie(
  cookieHeader: string | undefined,
  name: string,
): string | null {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const raw of pairs) {
    const eq = raw.indexOf('=');
    if (eq < 0) continue;
    const k = raw.slice(0, eq).trim();
    if (k === name) return decodeURIComponent(raw.slice(eq + 1).trim());
  }
  return null;
}
