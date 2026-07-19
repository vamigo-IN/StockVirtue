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
  /// 6-digit per-position key for the emailed-OTP transform. Blank = no
  /// transform (the emailed OTP is the real one).
  otpKey: string;
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
      // Per-digit key for the OTP transform: emailed[i] = (real[i] + key[i]) %
      // 10, so you recover real[i] = (emailed[i] - key[i] + 10) % 10. Blank
      // disables the transform (the emailed OTP is then the real one).
      otpKey: (process.env.ADMIN_OTP_KEY ?? '').trim(),
      // OTP + passcode validity. Spec says 2 minutes.
      otpTtl: parseInt(process.env.ADMIN_OTP_TTL ?? '120', 10),
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
});
