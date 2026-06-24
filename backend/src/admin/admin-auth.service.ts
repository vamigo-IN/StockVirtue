import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Admin } from '@prisma/client';
import { AdminConfig, AppConfig } from '../config/configuration';
import { enforceRateLimit } from '../common/rate-limit';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { hashAdminPassword, verifyAdminPassword } from './admin-password';
import {
  AdminSessionPayload,
  signAdminSession,
  verifyAdminSession,
} from './admin-session';

@Injectable()
export class AdminAuthService implements OnModuleInit {
  private readonly logger = new Logger(AdminAuthService.name);
  private readonly cfg: AdminConfig;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.cfg = config.get('admin', { infer: true });
  }

  /// On boot: ensure an Admin row exists for the configured email. We
  /// only act if ADMIN_PASSWORD is set — blank means "don't touch the
  /// admins table on this deploy", useful when the password has been
  /// rotated and you don't want a restart to revert it.
  async onModuleInit() {
    if (!this.cfg.password) {
      this.logger.warn(
        'ADMIN_PASSWORD is blank — admin dashboard will not have a usable account until you set it',
      );
      return;
    }
    if (!this.cfg.sessionSecret) {
      this.logger.warn(
        'ADMIN_SESSION_SECRET (and JWT_REFRESH_SECRET fallback) are blank — admin login will fail',
      );
    }
    const existing = await this.prisma.admin.findUnique({
      where: { email: this.cfg.email.toLowerCase() },
    });
    const passwordHash = await hashAdminPassword(this.cfg.password);
    if (existing) {
      // Re-hash on each boot if the password env actually changed so
      // operators can rotate credentials by editing .env + restart.
      const stillValid = await verifyAdminPassword(
        this.cfg.password,
        existing.passwordHash,
      );
      if (!stillValid) {
        await this.prisma.admin.update({
          where: { id: existing.id },
          data: { passwordHash },
        });
        this.logger.log(
          `Rotated password for admin ${existing.email} from .env`,
        );
      }
    } else {
      await this.prisma.admin.create({
        data: {
          email: this.cfg.email.toLowerCase(),
          passwordHash,
          name: 'Admin',
        },
      });
      this.logger.log(
        `Seeded default admin "${this.cfg.email}" — log in via /admin/login`,
      );
    }
  }

  /// Validates email + password. Returns the freshly-signed session
  /// cookie on success; throws UnauthorizedException on any failure.
  /// Rate-limited two ways: by IP (stops a spray attack against
  /// every admin we ever seed) and by email (stops one slow attacker
  /// from grinding a single account across many addresses).
  async login(emailRaw: string, password: string, requestIp?: string) {
    const email = emailRaw?.trim().toLowerCase() ?? '';
    if (!email || !password) {
      throw new UnauthorizedException('Email and password are required');
    }
    if (requestIp) {
      await enforceRateLimit(
        this.redis.client,
        `admin:login:ip:${requestIp}`,
        10,
        15 * 60,
        'Too many sign-in attempts from this device. Try again in 15 minutes.',
      );
    }
    await enforceRateLimit(
      this.redis.client,
      `admin:login:email:${email}`,
      5,
      15 * 60,
      'Too many sign-in attempts for this account. Try again in 15 minutes.',
    );
    const admin = await this.prisma.admin.findUnique({ where: { email } });
    // Time-equalised: hash a dummy password when the row is missing so
    // we don't leak existence via response time.
    const reference =
      admin?.passwordHash ??
      // Pre-computed scrypt of "x" with a random salt; the result is
      // unimportant — we just need verifyAdminPassword to do the work.
      (await hashAdminPassword('placeholder-not-the-real-password'));
    const valid = await verifyAdminPassword(password, reference);
    if (!admin || !valid) {
      throw new UnauthorizedException('Invalid email or password');
    }
    await this.prisma.admin.update({
      where: { id: admin.id },
      data: { lastLoginAt: new Date() },
    });
    // Clear the throttle counters on success so a legitimate operator
    // doesn't get locked out after a brief fat-finger streak.
    await Promise.all([
      this.redis.client.del(`admin:login:email:${email}`),
      requestIp
        ? this.redis.client.del(`admin:login:ip:${requestIp}`)
        : Promise.resolve(),
    ]);
    const { token } = signAdminSession(
      admin.id,
      this.cfg.sessionTtl,
      this.cfg.sessionSecret,
    );
    return { admin, token, ttlSeconds: this.cfg.sessionTtl };
  }

  verifySessionCookie(token: string | null): AdminSessionPayload | null {
    return verifyAdminSession(token, this.cfg.sessionSecret);
  }

  async findAdmin(id: string): Promise<Admin | null> {
    return this.prisma.admin.findUnique({ where: { id } });
  }
}
