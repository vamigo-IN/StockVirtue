import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditActor {
  userId: string | null;
  email: string | null;
}

export interface AuditEntry {
  actor: AuditActor | null;
  /** Dotted verb, e.g. "staff.login", "news.publish", "staff.roles.set". */
  action: string;
  entityType?: string;
  entityId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  meta?: Prisma.InputJsonValue;
  ip?: string | null;
  userAgent?: string | null;
}

type Db = Prisma.TransactionClient | PrismaService;

/**
 * Append-only newsroom audit log. Pass the surrounding transaction client so
 * a privileged change and its audit row commit (or roll back) together; that
 * is what makes the log trustworthy. Rows are never updated or deleted.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, db: Db = this.prisma): Promise<void> {
    await db.auditLog.create({
      data: {
        actorUserId: entry.actor?.userId ?? null,
        actorEmail: entry.actor?.email ?? null,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        before: entry.before,
        after: entry.after,
        meta: entry.meta,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent?.slice(0, 500) ?? null,
      },
    });
  }

  /**
   * For events with nothing to roll back (e.g. a failed sign-in): never lets
   * an audit write failure turn into a failed request.
   */
  async recordSafely(entry: AuditEntry): Promise<void> {
    try {
      await this.record(entry);
    } catch (err) {
      this.logger.error(
        `Audit write failed for "${entry.action}": ${(err as Error).message}`,
      );
    }
  }

  /** Newest first, filtered; used by the portal's audit page. */
  async list(opts: {
    action?: string;
    actorUserId?: string;
    entityType?: string;
    entityId?: string;
    before?: Date;
    limit: number;
  }) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        action: opts.action ? { startsWith: opts.action } : undefined,
        actorUserId: opts.actorUserId,
        entityType: opts.entityType,
        entityId: opts.entityId,
        createdAt: opts.before ? { lt: opts.before } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: opts.limit + 1,
    });
    const hasMore = rows.length > opts.limit;
    const items = hasMore ? rows.slice(0, opts.limit) : rows;
    return {
      items,
      nextBefore: hasMore ? items[items.length - 1].createdAt : null,
    };
  }
}
