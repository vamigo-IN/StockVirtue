import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

/** The signed-in staff member, attached to the request by StaffAuthGuard. */
export interface StaffPrincipal {
  sessionId: string;
  staffId: string;
  userId: string;
  email: string | null;
  displayName: string;
  roles: string[];
  permissions: Set<string>;
  ip: string | null;
  userAgent: string | null;
}

export type StaffRequest = Request & { staff?: StaffPrincipal };

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * The real reader behind a request. The newsroom portal calls the API from the
 * website's Next.js server, so `req.ip` is that server; it forwards the
 * browser's IP and user agent in `x-client-ip` / `x-client-user-agent`. Those
 * headers are trusted ONLY when the call also carries the website's
 * server-to-server key — anyone else could forge them.
 */
export function clientInfo(req: Request, siteAdminKey: string): ClientInfo {
  const key = req.header('x-site-admin-key') ?? '';
  const fromPortal = !!siteAdminKey && safeEqual(key, siteAdminKey);
  const fwdIp = fromPortal ? req.header('x-client-ip') : undefined;
  const fwdUa = fromPortal ? req.header('x-client-user-agent') : undefined;
  return {
    ip: (fwdIp || req.ip || null)?.slice(0, 64) ?? null,
    userAgent:
      (fwdUa || req.header('user-agent') || null)?.slice(0, 500) ?? null,
  };
}
