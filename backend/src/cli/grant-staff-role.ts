/**
 * Grants a newsroom role to an existing StockVirtue account, from the server.
 * Super Admins are normally added in the admin console (Newsroom page); this
 * is the fallback when the console can't be used. Everyone else is invited
 * from the portal.
 *
 *   node dist/cli/grant-staff-role.js --email you@example.com --role SUPER_ADMIN [--name "Your Name"]
 *
 * The account must already exist with a verified email and a password, since
 * portal sign-in is email + password + emailed code. Roles apply within about
 * a minute (the API caches permissions briefly).
 */
import { PrismaClient, StaffStatus } from '@prisma/client';
import { SYSTEM_ROLE_KEYS } from '../rbac/rbac.catalog';
import { syncRbacCatalog } from '../rbac/rbac.sync';
import { normalizeEmail } from '../staff/staff-crypto';

export interface GrantInput {
  email: string;
  roleKey: string;
  displayName?: string;
}

export async function grantStaffRole(
  prisma: PrismaClient,
  input: GrantInput,
): Promise<{ staffId: string; roleKey: string; email: string }> {
  await syncRbacCatalog(prisma);
  const email = normalizeEmail(input.email);
  const user = await prisma.user.findUnique({ where: { emailAlias: email } });
  if (!user) {
    throw new Error(
      `No StockVirtue account uses ${email}. Sign up in the app with this email first.`,
    );
  }
  if (!user.passwordHash) {
    throw new Error(
      `${email} signs in with Google or phone and has no password. Newsroom sign-in needs one: invite this email from the portal instead.`,
    );
  }
  if (!user.emailVerified) {
    throw new Error(`${email} isn't verified yet. Verify it in the app first.`);
  }
  const role = await prisma.role.findUnique({ where: { key: input.roleKey } });
  if (!role) {
    throw new Error(
      `Unknown role "${input.roleKey}". Roles: ${SYSTEM_ROLE_KEYS.join(', ')} (or a custom role key).`,
    );
  }
  const profile = await prisma.$transaction(async (tx) => {
    const staff = await tx.staffProfile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        displayName:
          input.displayName?.trim() || user.displayName || email.split('@')[0],
      },
      // Running this on the server is a deliberate recovery action, so it
      // also lifts a suspension.
      update: {
        status: StaffStatus.ACTIVE,
        suspendedAt: null,
        suspendedReason: null,
        ...(input.displayName?.trim()
          ? { displayName: input.displayName.trim() }
          : {}),
      },
    });
    await tx.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });
    await tx.auditLog.create({
      data: {
        actorUserId: null,
        actorEmail: 'server-cli',
        action: 'staff.roles.grant_cli',
        entityType: 'StaffProfile',
        entityId: staff.id,
        after: { email, role: role.key },
      },
    });
    return staff;
  });
  return { staffId: profile.id, roleKey: role.key, email };
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const email = arg('email');
  const roleKey = arg('role');
  if (!email || !roleKey) {
    console.error(
      'Usage: node dist/cli/grant-staff-role.js --email you@example.com --role SUPER_ADMIN [--name "Your Name"]',
    );
    process.exitCode = 2;
    return;
  }
  const prisma = new PrismaClient();
  try {
    const r = await grantStaffRole(prisma, {
      email,
      roleKey,
      displayName: arg('name'),
    });
    console.log(
      `Granted ${r.roleKey} to ${r.email}. Sign in at the newsroom portal with this email and password.`,
    );
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) void main();
