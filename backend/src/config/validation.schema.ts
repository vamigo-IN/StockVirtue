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
  SMTP_FROM: Joi.string()
    .allow('')
    .default('StockVirtue <no-reply@stockvirtue.com>'),

  // Backend admin dashboard credentials. In production the password must be
  // strong, non-default, and the session secret must be set + distinct from
  // the JWT secrets — the app refuses to boot otherwise.
  ADMIN_EMAIL: Joi.string().email().default('admin@stockvirtue.local'),
  ADMIN_PASSWORD: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(12).invalid('StockVirtueAdmin@2026').required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  ADMIN_SESSION_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  ADMIN_SESSION_TTL: Joi.number().default(28800),

  // Marketing website (stockvirtue.com). SITE_ADMIN_KEY authenticates the
  // website server when saving site settings; blank disables that write
  // endpoint. SITE_CONTACT_TO receives contact-form emails (defaults to
  // ADMIN_EMAIL). Both optional so the backend boots without the website.
  SITE_ADMIN_KEY: Joi.string().allow('').default(''),
  SITE_CONTACT_TO: Joi.string().email().allow('').default(''),
});
