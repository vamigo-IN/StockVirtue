import { Injectable, Logger } from '@nestjs/common';
import { AdminAuditLog } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/// Records privileged admin actions to an append-only log. Writes are
/// best-effort — a logging failure must never block the operation itself.
@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: {
    adminId?: string | null;
    adminEmail: string;
    action: string;
    target?: string | null;
    detail?: string | null;
    ip?: string | null;
  }): Promise<void> {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          adminId: entry.adminId ?? null,
          adminEmail: entry.adminEmail,
          action: entry.action,
          target: entry.target ?? null,
          detail: entry.detail ?? null,
          ip: entry.ip ?? null,
        },
      });
    } catch (err) {
      this.logger.error(`audit write failed: ${(err as Error).message}`);
    }
  }

  list(limit = 200): Promise<AdminAuditLog[]> {
    return this.prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }
}
