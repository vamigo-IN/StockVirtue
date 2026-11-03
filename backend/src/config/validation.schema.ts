import * as Joi from 'joi';

/// A string that is optional (blank-allowed) in dev/test but REQUIRED and
/// non-empty in production, so a prod deploy refuses to boot with a missing
/// critical secret instead of silently degrading.
function prodRequiredString() {
  return Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.required(),
    otherwise: Joi.string().allow('').default(''),
  });
}

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  HOST: Joi.string().default('0.0.0.0'),
  PORT: Joi.number().default(3000),

  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgresql', 'postgres'] })
    .required(),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').default(''),

  SMARTAPI_KEY: Joi.string().required(),
  SMARTAPI_SECRET: Joi.string().required(),
  SMARTAPI_CLIENT_CODE: Joi.string().required(),
  SMARTAPI_TOTP_SECRET: Joi.string().required(),
  SMARTAPI_PIN: Joi.string().allow('').default(''),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL: Joi.number().default(900),
  JWT_REFRESH_TTL: Joi.number().default(2592000),

  // Firebase Admin (Google/Phone login + FCM push). REQUIRED in production —
  // without it /auth/firebase/login rejects every Google/Phone sign-in.
  FCM_PROJECT_ID: prodRequiredString(),
  FCM_SERVICE_ACCOUNT: prodRequiredString(),

  // SMTP for transactional email (OTP, password reset). REQUIRED in production
  // so OTP codes are emailed, never logged to the server console.
  SMTP_HOST: prodRequiredString(),
  SMTP_PORT: Joi.number().default(587),
  SMTP_SECURE: Joi.string().valid('true', 'false').default('false'),
  SMTP_USER: prodRequiredString(),
  SMTP_PASS: prodRequiredString(),
  MAIL_ASSETS_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .default(''),
  SMTP_FROM: Joi.string()
    .allow('')
    .default('StockVirtue <no-reply@stockvirtue.com>'),

  // The admin ACCOUNT no longer comes from env — it lives only in the
  // `admins` table and rotated from Settings in the panel. ADMIN_EMAIL is
  // retained solely as the default recipient for site contact-form mail;
  // ADMIN_PASSWORD is no longer read by anything and should be deleted from
  // .env (a stale copy is a credential sitting in a file for no reason).
  ADMIN_EMAIL: Joi.string().email().default('admin@stockvirtue.local'),
  ADMIN_PASSWORD: Joi.string().allow('').default(''),
  ADMIN_SESSION_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    // Must be strong AND distinct from the JWT secrets so a leak of one key
    // can't forge the other (the config comment promised this; now enforced).
    then: Joi.string()
      .min(32)
      .invalid(Joi.ref('JWT_ACCESS_SECRET'), Joi.ref('JWT_REFRESH_SECRET'))
      .required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  ADMIN_SESSION_TTL: Joi.number().default(28800),

  // ─── Admin Shield ─────────────────────────────────────────────────────
  // Deliberately optional-with-default, NOT prod-required: ConfigModule
  // validation runs at boot for the WHOLE app, so a `.required()` here would
  // take the entire API down (not just /admin) if the value were missing on
  // deploy. A blank ADMIN_OTP_KEY degrades to "no transform" and is warned
  // about at boot instead.
  ADMIN_SHIELD: Joi.string().valid('true', 'false').default('true'),
  ADMIN_OTP_TTL: Joi.number().min(30).max(900).default(300),
  ADMIN_IDLE_TIMEOUT: Joi.number().min(60).default(1800),
  ADMIN_DEVICE_BLOCK_MINUTES: Joi.number().min(1).default(30),
  ADMIN_DEVICE_FAIL_THRESHOLD: Joi.number().min(2).default(5),
  ADMIN_ALERT_EMAIL: Joi.string().email().allow('').default(''),

  // Marketing website (stockvirtue.com). SITE_ADMIN_KEY identifies the
  // website server that runs the newsroom portal (its forwarded client IPs are
  // trusted only with it). SITE_CONTACT_TO receives contact-form emails
  // (defaults to ADMIN_EMAIL). Both optional so the backend boots without it.
  SITE_ADMIN_KEY: Joi.string().allow('').default(''),
  // Where the API asks the website to refresh news pages (blank = derived).
  SITE_REVALIDATE_URL: Joi.string().allow('').default(''),
  SITE_CONTACT_TO: Joi.string().email().allow('').default(''),

  // Traffic monitoring / abuse detection. Defaults: on, 1-in-50 raw-log
  // sampling, auto-block OFF (detect-only until thresholds are tuned).
  MONITORING_ENABLED: Joi.string().valid('true', 'false').default('true'),
  MONITORING_SAMPLE_RATE: Joi.number().min(1).default(50),
  MONITORING_AUTO_BLOCK: Joi.string().valid('true', 'false').default('false'),
  // At least a year (DPDP Rules 2025); smaller values are raised to 365.
  MONITORING_LOG_RETENTION_DAYS: Joi.number().min(1).default(365),

  // Personal data (DPDP Act): erase accounts unused for N years (0 = never);
  // require the privacy notice before an account is created.
  PRIVACY_INACTIVE_YEARS: Joi.number().min(0).max(20).default(3),
  PRIVACY_REQUIRE_SIGNUP_CONSENT: Joi.string()
    .valid('true', 'false')
    .default('false'),

  // ─── Public market feed (the /fincalc WebSocket namespace) ─────────────
  // Every value is optional-with-default, deliberately: ConfigModule
  // validation runs at boot for the WHOLE app, so a `.required()` here would
  // take the trading API down if a value were missing on deploy. A
  // misconfigured feed refuses feed connections and nothing else.
  FEED_ENABLED: Joi.string().valid('true', 'false').default('false'),
  // Company-logo URL template for the app ({symbol} = NSE ticker). Empty =
  // the built-in public CDN default (see market.controller.ts); a value
  // without {symbol} (e.g. "none") turns logos off in the app.
  LOGO_URL_TEMPLATE: Joi.string().allow('').default(''),
  FEED_API_KEYS: Joi.string().allow('').default(''),
  FEED_TOKEN_SECRET: Joi.string().allow('').min(32).default(''),
  FEED_TOKEN_TTL: Joi.number().min(60).max(86400).default(900),
  FEED_REQUIRE_SIGNED_TOKENS: Joi.string()
    .valid('true', 'false')
    .default('false'),
  FEED_ALLOWED_ORIGINS: Joi.string().allow('').default(''),
  FEED_BROADCAST_MS: Joi.number().min(250).max(60000).default(1000),
  FEED_SNAPSHOT_REFRESH_MS: Joi.number().min(10000).default(60000),
  FEED_UNIVERSE_REFRESH_MS: Joi.number().min(60000).default(21600000),
  FEED_MAX_CONNECTIONS: Joi.number().min(1).default(5000),
  FEED_MAX_CONNECTIONS_PER_IP: Joi.number().min(1).default(20),

  // ─── Newsroom ─────────────────────────────────────────────────────────
  // All optional-with-default for the same reason as the feed block above:
  // a missing newsroom value must never stop the trading API from booting.
  // Blank STAFF_AUTH_SECRET = derived from JWT_ACCESS_SECRET.
  STAFF_AUTH_SECRET: Joi.string().allow('').min(32).default(''),
  STAFF_SESSION_IDLE_MINUTES: Joi.number().min(5).max(1440).default(60),
  STAFF_SESSION_MAX_HOURS: Joi.number().min(1).max(168).default(12),
  STAFF_LOGIN_CODE_TTL: Joi.number().min(60).max(1800).default(300),
  STAFF_INVITE_TTL_HOURS: Joi.number().min(1).max(720).default(72),
  NEWSROOM_PORTAL_URL: Joi.string().allow('').default(''),
  // Seals news-source credentials and AI provider keys. Blank = derived from
  // JWT_ACCESS_SECRET, so set it before ever rotating that secret.
  NEWSROOM_SECRETS_KEY: Joi.string().allow('').min(32).default(''),
  // Hosts news ingestion may fetch although they resolve to private
  // addresses ("host" or "host:port", comma-separated). Local testing only.
  INGEST_PRIVATE_HOSTS: Joi.string().allow('').default(''),
  // Website ticker and widget prices from the API's broker feed.
  MARKET_DISPLAY_ENABLED: Joi.string().valid('true', 'false').default('true'),
  // Media files. The Cloudflare R2 connection is entered in the portal; until
  // then uploads are kept in MEDIA_LOCAL_DIR (blank = backend/uploads). The
  // API serves both at API_PUBLIC_URL/media (blank = https://api.stockvirtue.com).
  // The old R2_* / MEDIA_STORAGE_DRIVER variables are ignored if still set.
  MEDIA_LOCAL_DIR: Joi.string().allow('').default(''),
  API_PUBLIC_URL: Joi.string().allow('').default(''),
  MEDIA_MAX_UPLOAD_MB: Joi.number().min(1).max(100).default(10),
  QUEUE_PREFIX: Joi.string().allow('').default('sv'),
});
