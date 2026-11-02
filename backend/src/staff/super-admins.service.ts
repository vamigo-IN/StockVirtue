import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StaffStatus } from '@prisma/client';
import { AuditActor, AuditService } from '../audit/audit.service';
import { AppConfig, NewsroomConfig } from '../config/configuration';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { SUPER_ADMIN } from '../rbac/rbac.catalog';
import { RbacService } from '../rbac/rbac.service';
import { newOpaqueToken, normalizeEmail, sha256Hex } from './staff-crypto';

/** Who acted in the admin console (api.stockvirtue.com/admin). */
export interface ConsoleActor {
  adminEmail: string;
  ip: string | null;
  userAgent: string | null;
}

export type AddOutcome = 'granted' | 'invited' | 'already';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = 'No Super Admin with that id.';

const hasSuperAdmin = {
  user: { roles: { some: { role: { key: SUPER_ADMIN } } } },
};

/**
 * The newsroom's Super Admins, managed only from the StockVirtue admin
 * console. The portal (stockvirtue.com/admin) can't grant, remove, suspend or
 * restore this role; there, Super Admins manage every other staff member.
 */
@Injectable()
export class SuperAdminsService {
  private readonly logger = new Logger(SuperAdminsService.name);
  private readonly cfg: NewsroomConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly rbac: RbacService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.cfg = config.get('newsroom', { infer: true });
  }

  /** Super Admins, and invitations to the role not yet accepted. */
  async overview() {
    const [members, invitations] = await Promise.all([
      this.prisma.staffProfile.findMany({
        where: hasSuperAdmin,
        include: { user: { select: { emailAlias: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.staffInvitation.findMany({
        where: {
          roleKeys: { has: SUPER_ADMIN },
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      admins: members.map((m) => ({
        staffId: m.id,
        name: m.displayName,
        email: m.user.emailAlias,
        status: m.status,
        lastPortalLoginAt: m.lastPortalLoginAt,
      })),
      invitations: invitations.map((i) => ({
        id: i.id,
        email: i.email,
        expiresAt: i.expiresAt,
      })),
      portalUrl: this.cfg.portalUrl,
    };
  }

  /**
   * Makes someone a Super Admin. A newsroom member gets the role at once;
   * anyone else gets an emailed invitation, and chooses a password (or
   * confirms their StockVirtue one) when accepting it.
   */
  async add(rawEmail: string, by: ConsoleActor): Promise<AddOutcome> {
    const email = normalizeEmail(rawEmail);
    if (!EMAIL.test(email) || email.length > 160) {
      throw new BadRequestException('Enter a valid email address.');
    }
    const role = await this.prisma.role.findUnique({
      where: { key: SUPER_ADMIN },
    });
    if (!role) {
      throw new ServiceUnavailableException(
        "The newsroom roles aren't set up yet. Restart the API and try again.",
      );
    }
    const user = await this.prisma.user.findUnique({
      where: { emailAlias: email },
      include: { staffProfile: true, roles: { include: { role: true } } },
    });

    const profile = user?.staffProfile;
    if (user && profile) {
      if (user.roles.some((r) => r.role.key === SUPER_ADMIN)) return 'already';
      await this.prisma.$transaction(async (tx) => {
        await tx.userRole.create({
          data: { userId: user.id, roleId: role.id },
        });
        await this.audit.record(
          {
            actor: this.actor(by),
            action: 'staff.superadmin.grant',
            entityType: 'StaffProfile',
            entityId: profile.id,
            after: { email, role: SUPER_ADMIN },
            ip: by.ip,
            userAgent: by.userAgent,
          },
          tx,
        );
      });
      await this.rbac.bumpVersion();
      return 'granted';
    }

    // Not in the newsroom yet: the portal's own invitation flow.
    const token = newOpaqueToken();
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.cfg.inviteTtlHours * 3_600_000,
    );
    const invitation = await this.prisma.$transaction(async (tx) => {
      await tx.staffInvitation.updateMany({
        where: {
          email,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now },
      });
      const created = await tx.staffInvitation.create({
        data: {
          email,
          roleKeys: [SUPER_ADMIN],
          tokenHash: sha256Hex(token),
          invitedById: null,
          expiresAt,
        },
      });
      await this.audit.record(
        {
          actor: this.actor(by),
          action: 'staff.invite',
          entityType: 'StaffInvitation',
          entityId: created.id,
          after: { email, roles: [SUPER_ADMIN] },
          ip: by.ip,
          userAgent: by.userAgent,
        },
        tx,
      );
      return created;
    });
    // The token rides in the URL fragment, so it never reaches a server log.
    const acceptUrl = `${this.cfg.portalUrl}/invite#token=${token}`;
    try {
      await this.mail.sendStaffInvitation(email, {
        inviterName: 'The StockVirtue admin team',
        roleNames: [role.name],
        acceptUrl,
        expiresAt,
      });
    } catch (err) {
      this.logger.error(`Invitation email failed: ${(err as Error).message}`);
      await this.prisma.staffInvitation.update({
        where: { id: invitation.id },
        data: { revokedAt: new Date() },
      });
      throw new ServiceUnavailableException(
        "The invitation email couldn't be sent. Check the email (SMTP) settings and try again.",
      );
    }
    return 'invited';
  }

  /** Takes the role away; the account, any other roles and the history stay. */
  async remove(staffId: string, by: ConsoleActor) {
    const staff = await this.findSuperAdmin(staffId);
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({
        where: { userId: staff.userId, role: { key: SUPER_ADMIN } },
      });
      await this.audit.record(
        {
          actor: this.actor(by),
          action: 'staff.superadmin.revoke',
          entityType: 'StaffProfile',
          entityId: staff.id,
          before: { role: SUPER_ADMIN },
          ip: by.ip,
          userAgent: by.userAgent,
        },
        tx,
      );
    });
    await this.rbac.bumpVersion();
  }

  /** Blocks portal access at once: every open session ends. */
  async suspend(staffId: string, by: ConsoleActor) {
    const staff = await this.findSuperAdmin(staffId);
    if (staff.status === StaffStatus.SUSPENDED) return;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.staffProfile.update({
        where: { id: staff.id },
        data: {
          status: StaffStatus.SUSPENDED,
          suspendedAt: now,
          suspendedReason: 'Suspended from the admin console',
        },
      });
      await tx.staffSession.updateMany({
        where: { staffId: staff.id, revokedAt: null },
        data: { revokedAt: now, revokedReason: 'suspended' },
      });
      await this.audit.record(
        {
          actor: this.actor(by),
          action: 'staff.suspend',
          entityType: 'StaffProfile',
          entityId: staff.id,
          ip: by.ip,
          userAgent: by.userAgent,
        },
        tx,
      );
    });
  }

  async reactivate(staffId: string, by: ConsoleActor) {
    const staff = await this.findSuperAdmin(staffId);
    if (staff.status === StaffStatus.ACTIVE) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.staffProfile.update({
        where: { id: staff.id },
        data: {
          status: StaffStatus.ACTIVE,
          suspendedAt: null,
          suspendedReason: null,
        },
      });
      await this.audit.record(
        {
          actor: this.actor(by),
          action: 'staff.reactivate',
          entityType: 'StaffProfile',
          entityId: staff.id,
          ip: by.ip,
          userAgent: by.userAgent,
        },
        tx,
      );
    });
  }

  async revokeInvitation(invitationId: string, by: ConsoleActor) {
    const result = UUID.test(invitationId)
      ? await this.prisma.staffInvitation.updateMany({
          where: {
            id: invitationId,
            roleKeys: { has: SUPER_ADMIN },
            acceptedAt: null,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        })
      : { count: 0 };
    if (result.count === 0) {
      throw new NotFoundException('No open invitation with that id.');
    }
    await this.audit.recordSafely({
      actor: this.actor(by),
      action: 'staff.invite.revoke',
      entityType: 'StaffInvitation',
      entityId: invitationId,
      ip: by.ip,
      userAgent: by.userAgent,
    });
  }

  private async findSuperAdmin(staffId: string) {
    if (!UUID.test(staffId)) throw new NotFoundException(NOT_FOUND);
    const staff = await this.prisma.staffProfile.findFirst({
      where: { id: staffId, ...hasSuperAdmin },
    });
    if (!staff) throw new NotFoundException(NOT_FOUND);
    return staff;
  }

  /** How the portal's audit log names the console admin. */
  private actor(by: ConsoleActor): AuditActor {
    return { userId: null, email: `admin console (${by.adminEmail})` };
  }
}
