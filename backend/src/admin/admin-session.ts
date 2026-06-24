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
  iat: number;
  exp: number;
  /// Random 96-bit nonce so two same-second logins produce different
  /// tokens — handy for the audit log we'll eventually wire up.
  nonce: string;
}

export const ADMIN_COOKIE_NAME = 'stockvirtue_admin_session';

export function signAdminSession(
  adminId: string,
  ttlSeconds: number,
  secret: string,
): { token: string; payload: AdminSessionPayload } {
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET (or JWT_REFRESH_SECRET) not set');
  }
  const now = Math.floor(Date.now() / 1000);
  const payload: AdminSessionPayload = {
    aid: adminId,
    iat: now,
    exp: now + ttlSeconds,
    nonce: randomBytes(12).toString('base64url'),
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return { token: `${payloadB64}.${sig}`, payload };
}

export function verifyAdminSession(
  token: string | null | undefined,
  secret: string,
): AdminSessionPayload | null {
  if (!token || !secret) return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  let expectedSig: Buffer;
  let actualSig: Buffer;
  try {
    expectedSig = createHmac('sha256', secret)
      .update(payloadB64)
      .digest();
    actualSig = Buffer.from(sigPart, 'base64url');
  } catch {
    return null;
  }
  if (
    expectedSig.length !== actualSig.length ||
    !timingSafeEqual(expectedSig, actualSig)
  ) {
    return null;
  }
  let payload: AdminSessionPayload;
  try {
    payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8'),
    ) as AdminSessionPayload;
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;
  return payload;
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
