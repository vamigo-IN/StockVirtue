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

export interface AdminConfig {
  email: string;
  password: string;
  sessionSecret: string;
  sessionTtl: number;
}

/// Marketing website (stockvirtue.com) integration. `adminKey` authenticates
/// the website's Next.js server when it saves site settings (server-to-server);
/// blank disables the write endpoint. `contactTo` receives contact-form emails.
export interface SiteConfig {
  adminKey: string;
  contactTo: string;
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
  },
  site: {
    adminKey: process.env.SITE_ADMIN_KEY ?? '',
    contactTo:
      process.env.SITE_CONTACT_TO ||
      process.env.ADMIN_EMAIL ||
      'admin@stockvirtue.local',
  },
});
