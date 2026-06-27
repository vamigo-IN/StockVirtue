import 'server-only';
import { cookies } from 'next/headers';
import crypto from 'crypto';

/**
 * Minimal, self-contained admin session for the website's settings panel.
 * The cookie holds a SHA-256 derived from ADMIN_PASSWORD (a server-only
 * secret), so it can't be forged without knowing the password. All checks are
 * constant-time. This is independent of the app's backend admin auth and never
 * exposes any backend credential to the browser.
 */

const COOKIE = 'sv_admin';
const MAX_AGE = 60 * 60 * 8; // 8 hours

function sessionToken(): string {
  const pw = process.env.ADMIN_PASSWORD || '';
  return crypto.createHash('sha256').update(`stockvirtue:${pw}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export async function isAuthed(): Promise<boolean> {
  if (!process.env.ADMIN_PASSWORD) return false;
  const store = await cookies();
  const val = store.get(COOKIE)?.value;
  return !!val && safeEqual(val, sessionToken());
}

export async function login(password: string): Promise<boolean> {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw || !safeEqual(password, pw)) return false;
  const store = await cookies();
  store.set(COOKIE, sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
  return true;
}

export async function logout(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE);
}
