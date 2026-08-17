import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, FeedConfig } from '../config/configuration';

export type FeedAuthResult =
  | { ok: true; clientId: string; mode: 'key' | 'token' }
  | { ok: false; reason: string };

const TOKEN_PREFIX = 'sv1';

/**
 * Authenticates feed clients.
 *
 * Two credential shapes are accepted:
 *
 *   "clientId:secret"                       — a raw API key from FEED_API_KEYS
 *   "sv1.<clientId>.<expiry>.<signature>"   — a short-lived signed token
 *
 * The signed form exists because a mobile binary cannot keep a secret: anyone
 * who unpacks the APK can read a key compiled into it. With signed tokens the
 * raw key lives only on FinCalc's own server, which mints a token per session;
 * a leaked token expires on its own and cannot be minted again. Set
 * FEED_REQUIRE_SIGNED_TOKENS=true once that path is live and raw keys stop
 * being accepted at all.
 */
@Injectable()
export class FeedAuthService {
  private readonly logger = new Logger(FeedAuthService.name);
  private readonly cfg: FeedConfig;
  /** clientId → SHA-256 digest of that client's secret. */
  private readonly keys = new Map<string, Buffer>();

  constructor(config: ConfigService<AppConfig, true>) {
    this.cfg = config.get('feed', { infer: true });
    for (const key of this.cfg.apiKeys) {
      this.keys.set(key.id, Buffer.from(key.hash, 'hex'));
    }
    if (this.cfg.enabled && this.keys.size === 0) {
      this.logger.warn(
        'FEED_ENABLED=true but FEED_API_KEYS is empty — every feed connection will be refused',
      );
    }
    if (this.cfg.requireSignedTokens && !this.cfg.tokenSecret) {
      this.logger.warn(
        'FEED_REQUIRE_SIGNED_TOKENS=true but FEED_TOKEN_SECRET is blank — every feed connection will be refused',
      );
    }
  }

  verify(credential: unknown): FeedAuthResult {
    if (typeof credential !== 'string' || credential.length === 0) {
      return { ok: false, reason: 'missing credential' };
    }
    // Cheap guard against a caller trying to make us do work on a huge string.
    if (credential.length > 512) {
      return { ok: false, reason: 'credential too long' };
    }
    if (credential.startsWith(`${TOKEN_PREFIX}.`)) {
      return this.verifySignedToken(credential);
    }
    if (this.cfg.requireSignedTokens) {
      return { ok: false, reason: 'raw api keys are disabled' };
    }
    return this.verifyApiKey(credential);
  }

  /**
   * Mint a signed token. Exposed for FinCalc's server (which can import the
   * same algorithm) and for operational scripts — this backend deliberately
   * publishes no HTTP endpoint that hands out feed credentials.
   */
  mintToken(clientId: string, ttlSeconds = this.cfg.tokenTtl): string | null {
    if (!this.cfg.tokenSecret || !this.keys.has(clientId)) return null;
    const exp = Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds);
    const body = `${TOKEN_PREFIX}.${clientId}.${exp}`;
    return `${body}.${this.sign(body)}`;
  }

  private verifyApiKey(credential: string): FeedAuthResult {
    const sep = credential.indexOf(':');
    if (sep <= 0 || sep === credential.length - 1) {
      return { ok: false, reason: 'malformed api key' };
    }
    const clientId = credential.slice(0, sep);
    const expected = this.keys.get(clientId);
    // The client id is a public identifier, so an early exit here leaks
    // nothing an attacker could not already guess; the SECRET comparison
    // below is the one that must not vary with the input.
    if (!expected) return { ok: false, reason: 'unknown client' };

    const actual = createHash('sha256')
      .update(credential.slice(sep + 1), 'utf8')
      .digest();
    if (!timingSafeEqual(actual, expected)) {
      return { ok: false, reason: 'bad secret' };
    }
    return { ok: true, clientId, mode: 'key' };
  }

  private verifySignedToken(credential: string): FeedAuthResult {
    if (!this.cfg.tokenSecret) {
      return { ok: false, reason: 'signed tokens not configured' };
    }
    const parts = credential.split('.');
    if (parts.length !== 4) return { ok: false, reason: 'malformed token' };
    const [, clientId, expRaw, signature] = parts;
    if (!this.keys.has(clientId)) {
      return { ok: false, reason: 'unknown client' };
    }

    const expected = this.sign(`${TOKEN_PREFIX}.${clientId}.${expRaw}`);
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: 'bad signature' };
    }
    // Expiry is checked only after the signature verifies, so an attacker
    // cannot use the response to probe which expiry values are interesting.
    const exp = Number.parseInt(expRaw, 10);
    if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) {
      return { ok: false, reason: 'token expired' };
    }
    return { ok: true, clientId, mode: 'token' };
  }

  private sign(body: string): string {
    return createHmac('sha256', this.cfg.tokenSecret)
      .update(body, 'utf8')
      .digest('base64url');
  }
}
