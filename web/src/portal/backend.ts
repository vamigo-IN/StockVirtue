import 'server-only';

/**
 * Server-to-server access to the newsroom API. The portal's browser code only
 * ever talks to this Next.js server (/admin/api/...); this module adds the
 * session token, the website's server key and the browser's real IP / user
 * agent (which the API trusts only alongside that key).
 */

const API_BASE = (() => {
  const raw = (process.env.API_BASE || 'https://api.stockvirtue.com').replace(
    /\/+$/,
    '',
  );
  return /\/api$/.test(raw) ? raw : `${raw}/api`;
})();

export const API_V1 = `${API_BASE}/v1`;

export interface ClientInfo {
  ip: string | null;
  userAgent: string | null;
}

/**
 * The browser behind a request. nginx sets X-Real-IP; failing that, the last
 * X-Forwarded-For hop is the one our own proxy appended (earlier hops are
 * whatever the client claimed).
 */
export function clientFromHeaders(h: Headers): ClientInfo {
  const real = h.get('x-real-ip')?.trim();
  const hops = (h.get('x-forwarded-for') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    ip: real || hops[hops.length - 1] || null,
    userAgent: h.get('user-agent'),
  };
}

export function backendHeaders(
  token: string | undefined,
  client: ClientInfo,
  json: boolean,
): Record<string, string> {
  const h: Record<string, string> = {
    accept: 'application/json',
    'x-site-admin-key': process.env.SITE_ADMIN_KEY ?? '',
  };
  if (json) h['content-type'] = 'application/json';
  if (token) h['x-staff-session'] = token;
  if (client.ip) h['x-client-ip'] = client.ip.slice(0, 64);
  if (client.userAgent) {
    h['x-client-user-agent'] = client.userAgent.slice(0, 500);
  }
  return h;
}
