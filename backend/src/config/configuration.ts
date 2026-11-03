import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

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
  /** The website emails link to (privacy notice, terms, contact). */
  siteUrl: string;
  /** Where the email logo and icon live (`logo.png`, `icon.png`). */
  assetsUrl: string;
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

/// Marketing website (stockvirtue.com) integration. `adminKey` identifies the
/// website's Next.js server, which runs the newsroom portal: only with it are
/// the browser IP / user agent it forwards trusted (staff sessions, audit).
/// `contactTo` receives contact-form emails. `revalidateUrl` is where the API
/// asks the website to refresh its news pages after a change (signed with
/// `adminKey`); blank SITE_REVALIDATE_URL = the portal URL's origin +
/// /api/revalidate.
export interface SiteConfig {
  adminKey: string;
  contactTo: string;
  revalidateUrl: string;
}

/// Traffic-monitoring & abuse-detection subsystem. `enabled` is a kill-switch;
/// `sampleRate` = 1-in-N sampling for the raw request log (errors/flagged are
/// always kept); `autoBlock` gates automatic IP blocking (ships OFF so it runs
/// detect-only until thresholds are tuned against real traffic).
export interface MonitoringConfig {
  enabled: boolean;
  sampleRate: number;
  autoBlock: boolean;
  /// Request logs (IP address, user agent) and abuse events are kept this
  /// long, then deleted. The DPDP Rules 2025 (rules 6 and 8(3)) ask for at
  /// least a year, so smaller values are raised to 365.
  logRetentionDays: number;
}

/// Personal data rules (Digital Personal Data Protection Act, 2023).
export interface PrivacySettings {
  /// Accounts unused for this many years are erased after a 48-hour notice
  /// (DPDP Rules 2025, rule 8). 0 = never.
  inactiveYears: number;
  /// New accounts must accept the privacy notice (and confirm 18+) before
  /// they are created. Turn on once nobody uses an app older than 1.4.0.
  requireSignupConsent: boolean;
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
  privacy: PrivacySettings;
  feed: FeedConfig;
  /// Where the app loads company logos from ({symbol} = NSE ticker).
  logoUrlTemplate: string;
  newsroom: NewsroomConfig;
  storage: StorageConfig;
  marketDisplay: MarketDisplayConfig;
  queue: QueueConfig;
}

/// Newsroom staff portal sign-in. Every value is optional-with-default: a
/// missing one must never take the trading API down.
export interface NewsroomConfig {
  /// HMAC key for emailed sign-in codes. Blank = derived from
  /// JWT_ACCESS_SECRET with a newsroom-specific label (see staff-crypto.ts).
  staffAuthSecret: string;
  /// A portal session ends after this long without a request.
  sessionIdleMinutes: number;
  /// …and after this long regardless of activity.
  sessionMaxHours: number;
  /// Lifetime of an emailed sign-in code.
  loginCodeTtlSeconds: number;
  /// Lifetime of an emailed staff invitation link.
  inviteTtlHours: number;
  /// Public URL of the staff portal, used to build invitation links.
  portalUrl: string;
  /// Seals news-source credentials and AI provider keys. Blank = derived
  /// from JWT_ACCESS_SECRET (see common/secret-box.ts).
  secretsKey: string;
  /// Hosts ingestion may fetch although they resolve to private addresses
  /// ("host" or "host:port"). For local testing; empty in production.
  ingestPrivateHosts: string[];
}

/// Prices for the website's ticker and article widgets (curated list, one
/// subscription on the trading app's broker socket). `enabled` false = serve
/// only the last stored prices, e.g. on a machine with no broker session.
export interface MarketDisplayConfig {
  enabled: boolean;
}

/// Media files (article images). The Cloudflare R2 connection is entered in
/// the portal (Media storage), not here; until one is in use, uploads are
/// kept on this server's disk. Either way the API serves them at /media/...
export interface StorageConfig {
  /// Folder for files kept on this server. MEDIA_LOCAL_DIR; relative paths
  /// are inside backend/, and the default is backend/uploads.
  localDir: string;
  /// Public address of /media, e.g. https://api.stockvirtue.com/media
  publicBaseUrl: string;
  maxUploadBytes: number;
  /// The retired R2_* / MEDIA_STORAGE_DRIVER variables are still set.
  legacyEnv: boolean;
}

/// Background jobs (BullMQ on the existing Redis).
export interface QueueConfig {
  /// Key prefix so queue data never collides with other Redis keys.
  prefix: string;
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

/** The website: the newsroom portal's origin (stockvirtue.com). */
function websiteOrigin(): string {
  try {
    return new URL(
      process.env.NEWSROOM_PORTAL_URL || 'https://stockvirtue.com/admin',
    ).origin;
  } catch {
    return 'https://stockvirtue.com';
  }
}

/** Where to ask the website to refresh news pages (see SiteConfig). */
function siteRevalidateUrl(): string {
  const explicit = (process.env.SITE_REVALIDATE_URL ?? '').trim();
  if (explicit) return explicit;
  try {
    return new URL(
      '/api/revalidate',
      process.env.NEWSROOM_PORTAL_URL || 'https://stockvirtue.com/admin',
    ).toString();
  } catch {
    return '';
  }
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
    siteUrl: websiteOrigin(),
    // The website serves them from web/public/email (MAIL_ASSETS_URL: a CDN).
    assetsUrl: (
      process.env.MAIL_ASSETS_URL || `${websiteOrigin()}/email`
    ).replace(/\/+$/, ''),
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
    revalidateUrl: siteRevalidateUrl(),
  },
  monitoring: {
    enabled: (process.env.MONITORING_ENABLED ?? 'true') !== 'false',
    sampleRate: Math.max(
      1,
      parseInt(process.env.MONITORING_SAMPLE_RATE ?? '50', 10),
    ),
    autoBlock: (process.env.MONITORING_AUTO_BLOCK ?? 'false') === 'true',
    logRetentionDays: Math.max(
      365,
      parseInt(process.env.MONITORING_LOG_RETENTION_DAYS ?? '365', 10) || 365,
    ),
  },
  privacy: {
    inactiveYears: Math.max(
      0,
      parseInt(process.env.PRIVACY_INACTIVE_YEARS ?? '3', 10) || 0,
    ),
    requireSignupConsent:
      (process.env.PRIVACY_REQUIRE_SIGNUP_CONSENT ?? 'false') === 'true',
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
  newsroom: {
    staffAuthSecret: process.env.STAFF_AUTH_SECRET ?? '',
    sessionIdleMinutes: Math.max(
      5,
      parseInt(process.env.STAFF_SESSION_IDLE_MINUTES ?? '60', 10),
    ),
    sessionMaxHours: Math.max(
      1,
      parseInt(process.env.STAFF_SESSION_MAX_HOURS ?? '12', 10),
    ),
    loginCodeTtlSeconds: Math.max(
      60,
      parseInt(process.env.STAFF_LOGIN_CODE_TTL ?? '300', 10),
    ),
    inviteTtlHours: Math.max(
      1,
      parseInt(process.env.STAFF_INVITE_TTL_HOURS ?? '72', 10),
    ),
    portalUrl: (
      process.env.NEWSROOM_PORTAL_URL || 'https://stockvirtue.com/admin'
    ).replace(/\/+$/, ''),
    secretsKey: process.env.NEWSROOM_SECRETS_KEY ?? '',
    ingestPrivateHosts: (process.env.INGEST_PRIVATE_HOSTS ?? '')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  },
  marketDisplay: {
    enabled: (process.env.MARKET_DISPLAY_ENABLED ?? 'true') !== 'false',
  },
  storage: {
    // Resolved from this file, not the working directory, so the API and the
    // worker find the same folder however pm2 starts them.
    localDir: resolve(
      __dirname,
      '../..',
      process.env.MEDIA_LOCAL_DIR || 'uploads',
    ),
    publicBaseUrl: `${(
      process.env.API_PUBLIC_URL || 'https://api.stockvirtue.com'
    )
      .replace(/\/+$/, '')
      .replace(/\/api$/, '')}/media`,
    legacyEnv: !!(
      process.env.MEDIA_STORAGE_DRIVER === 'r2' || process.env.R2_BUCKET
    ),
    maxUploadBytes:
      Math.max(1, parseInt(process.env.MEDIA_MAX_UPLOAD_MB ?? '10', 10)) *
      1024 *
      1024,
  },
  queue: {
    prefix: process.env.QUEUE_PREFIX || 'sv',
  },
});
