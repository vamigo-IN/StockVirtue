import { promises as dns } from 'node:dns';
import * as http from 'node:http';
import * as https from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import type { Readable } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';

/**
 * The only way ingestion reaches the internet. Source addresses are typed in
 * by staff, so every request is treated as untrusted:
 *  - http(s) only, no credentials in the address;
 *  - every address the host resolves to must be public (no loopback, private,
 *    link-local / cloud-metadata, CGNAT, multicast or reserved ranges), and
 *    the connection is pinned to the address that was checked, so DNS can't
 *    swap in a private one between the check and the connect;
 *  - redirects are followed by hand and each hop is checked again;
 *  - the decoded body is capped, so a compressed bomb can't exhaust memory;
 *  - one deadline covers the whole request, redirects included.
 */

const BLOCKED = new BlockList();
const V4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];
const V6: [string, number][] = [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
];
for (const [net, prefix] of V4) BLOCKED.addSubnet(net, prefix, 'ipv4');
for (const [net, prefix] of V6) BLOCKED.addSubnet(net, prefix, 'ipv6');

/** "::ffff:10.0.0.1" / "::ffff:a00:1" → "10.0.0.1"; anything else → null. */
function mappedV4(address: string): string | null {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (dotted) return dotted[1];
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
  if (!hex) return null;
  const hi = parseInt(hex[1], 16);
  const lo = parseInt(hex[2], 16);
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
}

/** True for any address a source must not point at. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return BLOCKED.check(address, 'ipv4');
  if (family === 6) {
    const v4 = mappedV4(address);
    return v4 ? BLOCKED.check(v4, 'ipv4') : BLOCKED.check(address, 'ipv6');
  }
  return true;
}

export type FetchFailure =
  | 'invalid_url'
  | 'blocked'
  | 'dns'
  | 'timeout'
  | 'network'
  | 'tls'
  | 'too_large'
  | 'redirects';

/** A fetch that failed before an HTTP status came back. Messages are safe to show staff. */
export class SafeFetchError extends Error {
  constructor(
    readonly kind: FetchFailure,
    message: string,
  ) {
    super(message);
  }
}

export interface SafeFetchOptions {
  headers?: Record<string, string>;
  /** Whole request, redirects included. */
  timeoutMs?: number;
  /** Cap on the decoded body. */
  maxBytes?: number;
  maxRedirects?: number;
  /** "host" or "host:port" entries allowed to resolve to private addresses (INGEST_PRIVATE_HOSTS). */
  privateHosts?: readonly string[];
}

export interface SafeResponse {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  /** The address that answered, after redirects. */
  url: string;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<SafeResponse> {
  const deadline = Date.now() + (opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const maxRedirects = opts.maxRedirects ?? 3;
  let url = checkedUrl(rawUrl);
  for (let hop = 0; ; hop++) {
    const res = await requestOnce(url, opts, deadline);
    const location = res.headers.location;
    if (REDIRECTS.has(res.status) && location) {
      if (hop >= maxRedirects) {
        throw new SafeFetchError(
          'redirects',
          'The address redirects too many times.',
        );
      }
      url = checkedUrl(new URL(location, url).toString());
      continue;
    }
    return { ...res, url: url.toString() };
  }
}

export function checkedUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new SafeFetchError('invalid_url', 'That isn’t a valid web address.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new SafeFetchError(
      'invalid_url',
      'Only http:// and https:// addresses can be fetched.',
    );
  }
  if (u.username || u.password) {
    throw new SafeFetchError(
      'invalid_url',
      'Put credentials in the source’s API key field, not in the address.',
    );
  }
  return u;
}

async function resolveHost(
  u: URL,
  privateHosts: readonly string[],
): Promise<{ address: string; family: 4 | 6 }> {
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const port = u.port || (u.protocol === 'https:' ? '443' : '80');
  const trusted =
    privateHosts.includes(host) || privateHosts.includes(`${host}:${port}`);
  const literal = isIP(host);
  let found: { address: string; family: number }[];
  if (literal) {
    found = [{ address: host, family: literal }];
  } else {
    try {
      found = await dns.lookup(host, { all: true, verbatim: true });
    } catch {
      found = [];
    }
    if (found.length === 0) {
      throw new SafeFetchError('dns', `Couldn’t find a server called ${host}.`);
    }
  }
  if (!trusted && found.some((a) => isBlockedAddress(a.address))) {
    throw new SafeFetchError(
      'blocked',
      `${host} points to a private or reserved network address, which news sources can’t use.`,
    );
  }
  return { address: found[0].address, family: found[0].family === 6 ? 6 : 4 };
}

function networkMessage(err: NodeJS.ErrnoException): SafeFetchError {
  const code = err.code ?? '';
  if (code === 'ECONNREFUSED') {
    return new SafeFetchError('network', 'The server refused the connection.');
  }
  if (code === 'ECONNRESET' || code === 'EPIPE') {
    return new SafeFetchError('network', 'The server closed the connection.');
  }
  if (code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT') {
    return new SafeFetchError('timeout', 'The server took too long to answer.');
  }
  if (/CERT|SSL|TLS|SELF_SIGNED|ALTNAME/i.test(code + err.message)) {
    return new SafeFetchError(
      'tls',
      'The server’s security certificate isn’t valid.',
    );
  }
  return new SafeFetchError('network', 'Couldn’t connect to the server.');
}

async function requestOnce(
  u: URL,
  opts: SafeFetchOptions,
  deadline: number,
): Promise<Omit<SafeResponse, 'url'>> {
  const target = await resolveHost(u, opts.privateHosts ?? []);
  const remaining = deadline - Date.now();
  if (remaining <= 0) {
    throw new SafeFetchError('timeout', 'The server took too long to answer.');
  }
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  // Connect to the address checked above, whatever DNS says now.
  const lookup = ((_host, options, callback) => {
    if (options.all) {
      callback(null, [{ address: target.address, family: target.family }]);
    } else {
      callback(null, target.address, target.family);
    }
  }) as LookupFunction;
  const lib = u.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err: SafeFetchError) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.destroy();
      reject(err);
    };
    const req = lib.request(
      u,
      {
        method: 'GET',
        headers: { 'accept-encoding': 'gzip, deflate, br', ...opts.headers },
        lookup,
        timeout: remaining,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (REDIRECTS.has(status)) {
          res.resume();
          settled = true;
          clearTimeout(timer);
          resolve({ status, headers: res.headers, body: Buffer.alloc(0) });
          return;
        }
        const declared = Number(res.headers['content-length'] ?? 0);
        if (declared > maxBytes) {
          fail(new SafeFetchError('too_large', 'The response is too large.'));
          return;
        }
        const encoding = String(res.headers['content-encoding'] ?? '')
          .trim()
          .toLowerCase();
        let body: Readable = res;
        if (encoding === 'gzip' || encoding === 'x-gzip') {
          body = res.pipe(createGunzip());
        } else if (encoding === 'deflate') {
          body = res.pipe(createInflate());
        } else if (encoding === 'br') {
          body = res.pipe(createBrotliDecompress());
        }
        const chunks: Buffer[] = [];
        let size = 0;
        body.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            fail(new SafeFetchError('too_large', 'The response is too large.'));
            return;
          }
          chunks.push(chunk);
        });
        body.on('end', () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve({
            status,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
        body.on('error', () =>
          fail(new SafeFetchError('network', 'The response couldn’t be read.')),
        );
      },
    );
    const timer = setTimeout(
      () =>
        fail(
          new SafeFetchError('timeout', 'The server took too long to answer.'),
        ),
      remaining,
    );
    req.on('timeout', () =>
      fail(
        new SafeFetchError('timeout', 'The server took too long to answer.'),
      ),
    );
    req.on('error', (err) =>
      fail(err instanceof SafeFetchError ? err : networkMessage(err)),
    );
    req.end();
  });
}
