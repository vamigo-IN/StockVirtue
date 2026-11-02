import { createHash, createHmac, randomBytes } from 'node:crypto';

/**
 * HMAC key for emailed sign-in codes. Uses STAFF_AUTH_SECRET when set;
 * otherwise derives a newsroom-specific key from the JWT access secret (always
 * present and ≥32 chars), so a fresh deploy needs no new secret while the two
 * uses stay cryptographically separated.
 */
export function staffCodeSecret(
  configured: string,
  jwtAccessSecret: string,
): string {
  if (configured) return configured;
  return createHmac('sha256', jwtAccessSecret)
    .update('stockvirtue:newsroom:login-code:v1')
    .digest('hex');
}

/** 256-bit random bearer token, URL-safe. */
export function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Session and invitation tokens are stored only as this digest. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** "priya@example.com" → "p••••a@example.com", for "code sent to …" copy. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '••••';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return `${local[0]}••••${domain}`;
  return `${local[0]}••••${local[local.length - 1]}${domain}`;
}
