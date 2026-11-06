import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { readConfig, type SiteConfig } from '../site/site-config';
import type { ClientInfo } from '../staff/staff-request';
import { lockCookieVersions, tableExists, type Db } from './db';
import { isMissingTable } from './errors';
import { optionalServices, type ServicesInUse } from './live-values';

/** Who started a version (a staff member, or the system at boot). */
export interface VersionActor {
  staffId?: string | null;
  userId: string | null;
  email: string | null;
}

export type CookieVersionReason = 'seed' | 'notice' | 'settings';

export interface CookieVersionView {
  version: number;
  services: ServicesInUse;
  reason: string;
  noticeVersion: string | null;
  since: Date;
}

/** Version 1 is what every choice made before W7 was made under. */
export const FIRST_COOKIE_VERSION = 1;

const servicesOf = (v: unknown): ServicesInUse => {
  const o = (v ?? {}) as Partial<ServicesInUse>;
  return {
    analytics: Array.isArray(o.analytics) ? o.analytics.filter((s): s is string => typeof s === 'string') : [],
    advertising: Array.isArray(o.advertising) ? o.advertising.filter((s): s is string => typeof s === 'string') : [],
  };
};

/** Services in `next` that `prev` doesn't name, by purpose (only additions count, §5.13). */
export function addedServices(prev: ServicesInUse, next: ServicesInUse): ServicesInUse {
  return {
    analytics: next.analytics.filter((s) => !prev.analytics.includes(s)),
    advertising: next.advertising.filter((s) => !prev.advertising.includes(s)),
  };
}

/**
 * The website's cookie choice versions (W7 decision 4, addendum §5.13). The
 * newest `cookie_consent_versions` row is the current version; a new one
 * asks every visitor to choose again. Started by the boot seeder (version 1),
 * by a Settings save that switches a service on (here), and by a material
 * notice publish answered "affects cookies" (M7.3, `startVersion`). Rows are
 * never updated or deleted.
 */
@Injectable()
export class CookieConsentService {
  private readonly logger = new Logger(CookieConsentService.name);
  private warned = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The current version; 1 when there is no row or the table is missing (§2.4). */
  async currentVersion(db: Db = this.prisma): Promise<number> {
    try {
      const row = await db.cookieConsentVersion.findFirst({
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      return row?.version ?? FIRST_COOKIE_VERSION;
    } catch (err) {
      if (!isMissingTable(err)) throw err;
      this.warnMissing();
      return FIRST_COOKIE_VERSION;
    }
  }

  /** The current version's row, or null (no row, or the table is missing). */
  async current(db: Db = this.prisma): Promise<CookieVersionView | null> {
    try {
      const row = await db.cookieConsentVersion.findFirst({ orderBy: { version: 'desc' } });
      return row
        ? {
            version: row.version,
            services: servicesOf(row.services),
            reason: row.reason,
            noticeVersion: row.noticeVersion,
            since: row.createdAt,
          }
        : null;
    } catch (err) {
      if (!isMissingTable(err)) throw err;
      this.warnMissing();
      return null;
    }
  }

  /**
   * Boot: version 1 with the services in use at that moment, once (a second
   * boot changes nothing). Inside the seeder's transaction and lock.
   */
  async seed(tx: Prisma.TransactionClient, config: unknown): Promise<boolean> {
    const any = await tx.cookieConsentVersion.findFirst({ select: { version: true } });
    if (any) return false;
    await tx.cookieConsentVersion.create({
      data: {
        version: FIRST_COOKIE_VERSION,
        services: optionalServices(readConfig(config)) as unknown as Prisma.InputJsonValue,
        reason: 'seed',
        createdByEmail: 'seed',
      },
    });
    return true;
  }

  /**
   * The Settings hook (inside the settings save's transaction, after its
   * SETTINGS revisions): a service switched on, one that `optionalServices()`
   * names for its purpose after the save but not before it, starts a new
   * version (§5.13). The comparison is with the settings row the save
   * replaces (read under the row lock, §4.2), not with the newest version's
   * list: visitors who chose after a switch-off never saw the service named.
   * So a switch-off starts nothing, and switching a service back on starts a
   * new version even when an older version lists it. Returns it, or null.
   */
  async recordSettingsChange(
    tx: Prisma.TransactionClient,
    before: unknown,
    after: unknown,
    actor: VersionActor,
    client?: ClientInfo,
  ): Promise<number | null> {
    const added = addedServices(optionalServices(readConfig(before)), optionalServices(readConfig(after)));
    if (added.analytics.length === 0 && added.advertising.length === 0) return null;
    if (!(await tableExists(tx, 'cookie_consent_versions'))) {
      this.warnMissing();
      return null;
    }
    // The last lock of every W7 writer (§5.3 step 1); the version is read under it.
    await lockCookieVersions(tx);
    return this.startVersion(tx, 'settings', optionalServices(readConfig(after)), null, actor, client, await this.currentVersion(tx));
  }

  /**
   * Appends version `current + 1`. The caller holds the cookie-versions lock
   * (`lockCookieVersions`) or passes the current version it read under it.
   */
  async startVersion(
    tx: Prisma.TransactionClient,
    reason: CookieVersionReason,
    services: ServicesInUse,
    noticeVersion: string | null,
    actor: VersionActor,
    client?: ClientInfo,
    knownCurrent?: number,
  ): Promise<number> {
    if (knownCurrent === undefined) await lockCookieVersions(tx);
    const current = knownCurrent ?? (await this.currentVersion(tx));
    const version = Math.max(current, FIRST_COOKIE_VERSION - 1) + 1;
    await tx.cookieConsentVersion.create({
      data: {
        version,
        services: services as unknown as Prisma.InputJsonValue,
        reason,
        noticeVersion,
        createdById: actor.staffId ?? null,
        createdByEmail: actor.email ?? '',
      },
    });
    await this.audit.record(
      {
        actor: { userId: actor.userId, email: actor.email },
        action: 'privacy.cookies.version',
        entityType: 'CookieConsentVersion',
        entityId: String(version),
        meta: {
          version,
          reason,
          services: services as unknown as Prisma.InputJsonValue,
          ...(noticeVersion ? { noticeVersion } : {}),
        },
        ...(client ?? {}),
      },
      tx,
    );
    this.logger.log(`Cookie choice version ${version} started (${reason}).`);
    return version;
  }

  private warnMissing() {
    if (this.warned) return;
    this.warned = true;
    this.logger.error('site_cms migration not applied: cookie choice version 1 is used.');
  }
}
