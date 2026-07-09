import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

// Render server-side dates/logs in IST (UTC+5:30) — the timezone this app's
// users and operators work in. Set before anything formats a date so the Nest
// Logger's timestamps and any locale formatting read IST. Storage stays UTC
// (Postgres timestamptz / toISOString), and time-sensitive business logic
// computes IST via explicit offsets (see common/market-hours.ts), so this only
// affects display + logging. An explicit TZ from the environment still wins.
process.env.TZ = process.env.TZ || 'Asia/Kolkata';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const config = app.get(ConfigService<AppConfig, true>);

  // Advisory (non-fatal): in production, a remote Redis that holds OTPs and
  // refresh-token hashes should be password-protected. We only warn — a
  // loopback-bound Redis without a password is a legitimate setup, and we must
  // never turn a config nuance into a boot outage.
  const redisCfg = config.get('redis', { infer: true });
  if (
    config.get('nodeEnv', { infer: true }) === 'production' &&
    !redisCfg.password &&
    !['localhost', '127.0.0.1', '::1'].includes(redisCfg.host)
  ) {
    logger.warn(
      `REDIS_PASSWORD is empty while REDIS_HOST="${redisCfg.host}" is non-loopback — Redis is unauthenticated. Set a password.`,
    );
  }

  // Helmet's default Content-Security-Policy blocks third-party scripts
  // and inline styles, which would break the admin dashboard's Tailwind
  // CDN + sidebar styling. The mobile API only ever returns JSON so the
  // CSP buys us nothing there either — turning it off keeps the rest of
  // helmet's hardening (HSTS, X-Frame-Options, no-sniff, etc.) without
  // the breakage.
  app.use(helmet({ contentSecurityPolicy: false }));
  // gzip/deflate JSON responses. The mobile app pulls large payloads
  // (portfolios, option chains, leaderboards, scanners) over mobile networks;
  // compressing them cuts transfer size ~70-85% for a big latency win.
  app.use(compression());
  // credentials:false — the mobile app authenticates with Bearer tokens (not
  // cookies) and the admin dashboard is same-origin, so nothing legitimately
  // needs credentialed cross-origin requests. Reflecting any origin WITH
  // credentials would let a malicious site ride a victim's admin cookie; with
  // credentials off, a cross-origin caller can never read authenticated data.
  app.enableCors({ origin: true, credentials: false });
  // In production the app sits behind a TLS-terminating reverse proxy
  // (api.stockvirtue.com). Trust the first proxy hop so req.ip and the
  // X-Forwarded-* headers reflect the real client/host — used by audit-log
  // IPs and the admin CSRF same-site check.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  // Admin dashboard lives at /admin/*; the mobile JSON API lives under
  // /api/*. Without the explicit exclude every admin URL would 404 at
  // the bare path and resolve only at /api/admin/*, which is ugly.
  app.setGlobalPrefix('api', {
    exclude: [
      { path: 'admin', method: RequestMethod.ALL },
      { path: 'admin/(.*)', method: RequestMethod.ALL },
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const port = config.get('port', { infer: true });
  const host = config.get('host', { infer: true });
  await app.listen(port, host);
  logger.log(`StockVirtue backend listening on http://${host}:${port}/api`);
  logger.log(`Admin dashboard:        http://${host}:${port}/admin/login`);
}
void bootstrap();
