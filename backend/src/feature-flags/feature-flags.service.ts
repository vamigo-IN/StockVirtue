import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/// Stable flag keys. Add new ones here and seed them in onModuleInit.
export const FEATURE_MOBILE_OTP = 'mobile_otp_login';
/// Kill-switch: when enabled, the backend rejects all new order placement.
export const FEATURE_TRADING_HALTED = 'trading_halted';

/**
 * Admin-toggleable feature flags backed by the FeatureFlag table, cached in
 * memory for cheap reads. Currently gates which auth methods the mobile app
 * offers — the public /auth/config endpoint reads these, the admin panel
 * writes them.
 */
@Injectable()
export class FeatureFlagsService implements OnModuleInit {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private cache = new Map<string, boolean>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      // Seed defaults. `update: {}` means a restart never clobbers a choice an
      // admin already made — the row is only created if missing. Mobile OTP
      // ships paused (disabled); the admin resumes it from the panel.
      await this.prisma.featureFlag.upsert({
        where: { key: FEATURE_MOBILE_OTP },
        update: {},
        create: {
          key: FEATURE_MOBILE_OTP,
          enabled: false,
          label: 'Mobile OTP login',
        },
      });
      await this.prisma.featureFlag.upsert({
        where: { key: FEATURE_TRADING_HALTED },
        update: {},
        create: {
          key: FEATURE_TRADING_HALTED,
          enabled: false,
          label: 'Trading halted (kill-switch)',
        },
      });
      await this.refresh();
    } catch (err) {
      // Never block boot on flag seeding — fall back to defaults (all the
      // gated methods read their `fallback`, i.e. Mobile OTP stays off).
      this.logger.error(
        `Feature flag init failed: ${(err as Error).message}`,
      );
    }
  }

  private async refresh(): Promise<void> {
    const all = await this.prisma.featureFlag.findMany();
    this.cache = new Map(all.map((f) => [f.key, f.enabled]));
  }

  isEnabled(key: string, fallback = false): boolean {
    return this.cache.get(key) ?? fallback;
  }

  async setEnabled(key: string, enabled: boolean): Promise<void> {
    await this.prisma.featureFlag.upsert({
      where: { key },
      update: { enabled },
      create: { key, enabled },
    });
    await this.refresh();
    this.logger.log(`Feature flag '${key}' → ${enabled ? 'enabled' : 'disabled'}`);
  }

  /** App config the mobile client reads from /auth/config. */
  authConfig(): {
    emailPasswordEnabled: boolean;
    googleEnabled: boolean;
    mobileOtpEnabled: boolean;
    tradingHalted: boolean;
  } {
    return {
      emailPasswordEnabled: true,
      googleEnabled: true,
      mobileOtpEnabled: this.isEnabled(FEATURE_MOBILE_OTP, false),
      tradingHalted: this.isEnabled(FEATURE_TRADING_HALTED, false),
    };
  }

  /** True when the admin kill-switch has halted all order placement. */
  tradingHalted(): boolean {
    return this.isEnabled(FEATURE_TRADING_HALTED, false);
  }
}
