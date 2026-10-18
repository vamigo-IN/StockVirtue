import { createHash } from 'node:crypto';

export type NodeEnv = 'development' | 'test' | 'production';

export interface SmartApiConfig {
  apiKey: string;
  secret: string;
  clientCode: string;
  pin: string;
  totpSecret: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password: string;
}

export interface DatabaseConfig {
  url: string;
}

export interface JwtConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtl: number;
  refreshTtl: number;
}

export interface FcmConfig {
  projectId: string;
  serviceAccount: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/// Admin Shield — the hardened second-factor login for the admin panel.
/// See admin-shield.crypto.ts for the OTP transform + passcode derivation.
export interface AdminShieldConfig {
  /// Kill switch. When false the panel falls back to password-only login,
  /// without a redeploy — the break-glass path if SMTP fails.
  enabled: boolean;
  /// OTP + passcode validity, seconds.
  otpTtl: number;
  /// Idle-session timeout, seconds (absolute lifetime is `sessionTtl`).
  idleTimeout: number;
  deviceBlockMinutes: number;
  deviceFailThreshold: number;
  /// Recipient for security notifications.
  alertEmail: string;
}

export interface AdminConfig {
  email: string;
  password: string;
  sessionSecret: string;
  sessionTtl: number;
  shield: AdminShieldConfig;
}

/// Marketing website (stockvirtue.com) integration. `adminKey` authenticates
/// the website's Next.js server when it saves site settings (server-to-server);
/// blank disables the write endpoint. `contactTo` receives contact-form emails.
export interface SiteConfig {
  adminKey: string;
  contactTo: string;
}

/// Traffic-monitoring & abuse-detection subsystem. `enabled` is a kill-switch;
/// `sampleRate` = 1-in-N sampling for the raw request log (errors/flagged are
/// always kept); `autoBlock` gates automatic IP blocking (ships OFF so it runs
/// detect-only until thresholds are tuned against real traffic).
export interface MonitoringConfig {
  enabled: boolean;
  sampleRate: number;
  autoBlock: boolean;
}

/// A consuming application's credential for the public market feed. The
/// plaintext secret is hashed at boot and discarded, so a heap dump or an
/// accidental config log can never leak a working key, and verification stays
/// constant-time on fixed-length digests whatever a caller sends.
export interface FeedApiKey {
  /// Public client identifier, e.g. "fincalc-android". Safe to log.
  id: string;
  /// Hex SHA-256 of the shared secret.
  hash: string;
}

/// Public market-data feed (the `/fincalc` WebSocket namespace) — a fixed set
/// of indices + MCX commodities streamed to sibling apps such as FinCalc. It
/// carries no user data and authenticates with its own API keys, entirely
/// separate from the mobile app's JWT auth.
export interface FeedConfig {
  /// Kill switch. When false the namespace refuses every connection, without
  /// touching the trading app's own tick gateway.
  enabled: boolean;
  apiKeys: FeedApiKey[];
  /// HMAC key for short-lived signed tokens. Blank disables signed tokens.
  tokenSecret: string;
  /// Signed-token lifetime, seconds — used by the minting side.
  tokenTtl: number;
  /// When true a raw API key is rejected and only signed tokens are accepted.
  requireSignedTokens: boolean;
  /// Browser origins allowed to connect. Empty = no Origin check (native
  /// mobile clients send no Origin header, so they are unaffected either way).
  allowedOrigins: string[];
  /// How often changed prices are flushed to clients, ms.
  broadcastMs: number;
  /// REST re-seed interval, ms — keeps prevClose/OHLC right across the daily
  /// rollover and gives clients real values outside market hours.
  snapshotRefreshMs: number;
  /// How often the front-month commodity contracts are re-resolved, ms.
  universeRefreshMs: number;
  maxConnections: number;
  maxConnectionsPerIp: number;
}

/// Public company-logo CDN (Financial Modeling Prep) — covers most
/// NSE-listed companies; brand-new listings fall back to the app's monogram.
export const DEFAULT_LOGO_URL_TEMPLATE =
  'https://images.financialmodelingprep.com/symbol/{symbol}.NS.png';

export interface AppConfig {
  nodeEnv: NodeEnv;
  host: string;
  port: number;
  database: DatabaseConfig;
  redis: RedisConfig;
  smartapi: SmartApiConfig;
  jwt: JwtConfig;
  fcm: FcmConfig;
  smtp: SmtpConfig;
  admin: AdminConfig;
  site: SiteConfig;
  monitoring: MonitoringConfig;
  feed: FeedConfig;
  /// Where the app loads company logos from ({symbol} = NSE ticker).
  logoUrlTemplate: string;
}

/// Parse `FEED_API_KEYS` — a comma-separated list of "clientId:secret" pairs.
/// Malformed entries are dropped rather than thrown: this runs inside the
/// global ConfigModule factory, so raising here would take the WHOLE API down
/// over an optional side-feature. A dropped key surfaces as a refused feed
/// connection, which is loud in the right place and harmless everywhere else.
function parseFeedApiKeys(raw: string): FeedApiKey[] {
  const out: FeedApiKey[] = [];
  const seen = new Set<string>();
  for (const entry of raw.split(',').map((s) => s.trim())) {
    if (!entry) continue;
    const sep = entry.indexOf(':');
    if (sep <= 0 || sep === entry.length - 1) continue;
    const id = entry.slice(0, sep).trim();
    const secret = entry.slice(sep + 1).trim();
    if (!id || !secret || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      hash: createHash('sha256').update(secret, 'utf8').digest('hex'),
    });
  }
  return out;
}

export default (): AppConfig => ({
  nodeEnv: (process.env.NODE_ENV as NodeEnv) ?? 'development',
  host: process.env.HOST ?? '0.0.0.0',
  port: parseInt(process.env.PORT ?? '3000', 10),
  database: {
    url: process.env.DATABASE_URL as string,
  },
  redis: {
    host: process.env.REDIS_HOST as string,
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD ?? '',
  },
  smartapi: {
    apiKey: process.env.SMARTAPI_KEY as string,
    secret: process.env.SMARTAPI_SECRET as string,
    clientCode: process.env.SMARTAPI_CLIENT_CODE as string,
    pin: process.env.SMARTAPI_PIN ?? '',
    totpSecret: process.env.SMARTAPI_TOTP_SECRET as string,
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET as string,
    refreshSecret: process.env.JWT_REFRESH_SECRET as string,
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshTtl: parseInt(process.env.JWT_REFRESH_TTL ?? '2592000', 10),
  },
  fcm: {
    projectId: process.env.FCM_PROJECT_ID ?? '',
    serviceAccount: process.env.FCM_SERVICE_ACCOUNT ?? '',
  },
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    secure: (process.env.SMTP_SECURE ?? 'false') === 'true',
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? 'StockVirtue <no-reply@stockvirtue.com>',
  },
  admin: {
    email: process.env.ADMIN_EMAIL ?? 'admin@stockvirtue.local',
    password: process.env.ADMIN_PASSWORD ?? '',
    // Admin session-cookie HMAC key. Validated as required + distinct in
    // production (see validation.schema). Only dev falls back to the refresh
    // secret for zero-config local runs — never in production, so a leak of
    // one secret can't forge the other.
    sessionSecret:
      process.env.ADMIN_SESSION_SECRET ||
      (process.env.NODE_ENV === 'production'
        ? ''
        : (process.env.JWT_REFRESH_SECRET ?? '')),
    // 8 hours — a working shift. Re-login required after that.
    sessionTtl: parseInt(process.env.ADMIN_SESSION_TTL ?? '28800', 10),

    // ─── Admin Shield ───────────────────────────────────────────────────
    // Second-factor login (transformed OTP + time passcode), device
    // fingerprint blocking, single active session, security emails.
    shield: {
      // Kill switch. ON by default (hard cutover). Set ADMIN_SHIELD=false to
      // fall back to password-only login WITHOUT a redeploy — the break-glass
      // path if SMTP dies and the OTP email can't reach you.
      enabled: (process.env.ADMIN_SHIELD ?? 'true') !== 'false',
      // OTP + passcode validity: 5 minutes. Long enough to absorb mail-provider
      // delivery lag and the mental decode, short enough that an intercepted
      // code is worthless by the time it is read.
      otpTtl: parseInt(process.env.ADMIN_OTP_TTL ?? '300', 10),
      // Idle timeout (30 min) — absolute lifetime is `sessionTtl` above (8h).
      idleTimeout: parseInt(process.env.ADMIN_IDLE_TIMEOUT ?? '1800', 10),
      // How long a device fingerprint stays blocked after repeated failures.
      deviceBlockMinutes: parseInt(
        process.env.ADMIN_DEVICE_BLOCK_MINUTES ?? '30',
        10,
      ),
      // Failed login sessions from one fingerprint before it is blocked.
      deviceFailThreshold: parseInt(
        process.env.ADMIN_DEVICE_FAIL_THRESHOLD ?? '5',
        10,
      ),
      // Where security notifications go. Defaults to the admin's own address.
      alertEmail:
        process.env.ADMIN_ALERT_EMAIL ||
        process.env.ADMIN_EMAIL ||
        'admin@stockvirtue.local',
    },
  },
  site: {
    adminKey: process.env.SITE_ADMIN_KEY ?? '',
    contactTo:
      process.env.SITE_CONTACT_TO ||
      process.env.ADMIN_EMAIL ||
      'admin@stockvirtue.local',
  },
  monitoring: {
    enabled: (process.env.MONITORING_ENABLED ?? 'true') !== 'false',
    sampleRate: Math.max(
      1,
      parseInt(process.env.MONITORING_SAMPLE_RATE ?? '50', 10),
    ),
    autoBlock: (process.env.MONITORING_AUTO_BLOCK ?? 'false') === 'true',
  },
  logoUrlTemplate: process.env.LOGO_URL_TEMPLATE || DEFAULT_LOGO_URL_TEMPLATE,
  feed: {
    // Ships OFF. With no keys configured the namespace would refuse everyone
    // anyway; an explicit flag makes "is the FinCalc feed live?" answerable
    // from the environment alone, and gives ops a one-line kill switch.
    enabled: (process.env.FEED_ENABLED ?? 'false') === 'true',
    apiKeys: parseFeedApiKeys(process.env.FEED_API_KEYS ?? ''),
    tokenSecret: process.env.FEED_TOKEN_SECRET ?? '',
    tokenTtl: parseInt(process.env.FEED_TOKEN_TTL ?? '900', 10),
    requireSignedTokens:
      (process.env.FEED_REQUIRE_SIGNED_TOKENS ?? 'false') === 'true',
    allowedOrigins: (process.env.FEED_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim().toLowerCase())
      .filter(Boolean),
    // 1s. Ticks arrive far faster; they are coalesced so one instrument sends
    // at most one frame per window — smooth enough to read, cheap on battery.
    broadcastMs: Math.max(
      250,
      parseInt(process.env.FEED_BROADCAST_MS ?? '1000', 10),
    ),
    snapshotRefreshMs: Math.max(
      10_000,
      parseInt(process.env.FEED_SNAPSHOT_REFRESH_MS ?? '60000', 10),
    ),
    // 6h — well under a day, so a front-month commodity future that rolls is
    // picked up the same session.
    universeRefreshMs: Math.max(
      60_000,
      parseInt(process.env.FEED_UNIVERSE_REFRESH_MS ?? '21600000', 10),
    ),
    maxConnections: parseInt(process.env.FEED_MAX_CONNECTIONS ?? '5000', 10),
    maxConnectionsPerIp: parseInt(
      process.env.FEED_MAX_CONNECTIONS_PER_IP ?? '20',
      10,
    ),
  },
});
