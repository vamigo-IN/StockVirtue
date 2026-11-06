import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** A Prisma client or a transaction client. */
export type Db = Prisma.TransactionClient | PrismaService;

/** The four W7 tables, in the order the migration creates them. */
export const W7_TABLES = [
  'privacy_notice_versions',
  'site_content',
  'site_content_revisions',
  'cookie_consent_versions',
] as const;

/**
 * Whether a table exists, without an error (an error inside a transaction
 * would abort it: the Settings hooks run inside the settings save's own
 * transaction, which must still commit when the W7 migration is missing).
 */
export async function tableExists(db: Db, table: (typeof W7_TABLES)[number]): Promise<boolean> {
  const rows = await db.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass(${table}) IS NOT NULL AS ok`;
  return rows[0]?.ok === true;
}

/**
 * The per-item lock that publishes, restores and SETTINGS appends take, so
 * revision numbers never clash (W7 addendum §4.2, §5.3). Callers that need
 * several take them in key order.
 */
export async function lockItem(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`site-content:${key}`}))`;
}

/** The lock of the cookie choice versions (§5.13). */
export async function lockCookieVersions(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('cookie-consent'))`;
}
