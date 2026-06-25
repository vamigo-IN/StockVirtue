import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AppConfig } from './config/configuration';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const logger = new Logger('Bootstrap');
  const config = app.get(ConfigService<AppConfig, true>);

  // Helmet's default Content-Security-Policy blocks third-party scripts
  // and inline styles, which would break the admin dashboard's Tailwind
  // CDN + sidebar styling. The mobile API only ever returns JSON so the
  // CSP buys us nothing there either — turning it off keeps the rest of
  // helmet's hardening (HSTS, X-Frame-Options, no-sniff, etc.) without
  // the breakage.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.enableCors({ origin: true, credentials: true });
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
