import * as readline from 'node:readline';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/common/password';

/**
 * One-time admin account provisioning.
 *
 *   npm run admin:create
 *
 * The admin account lives ONLY in the `admins` table. Nothing reads
 * ADMIN_EMAIL / ADMIN_PASSWORD for authentication any more, so the password
 * exists purely as a scrypt hash in the database — never in .env, never in a
 * process environment, never in a deploy pipeline.
 *
 * Re-run this to rotate the password; it refuses to clobber an existing admin
 * without confirmation. The password is read from stdin with echo suppressed,
 * so it never lands in shell history the way a CLI argument would.
 */

const prisma = new PrismaClient();

const CTRL_C = 3;
const EOT = 4;
const BACKSPACE = 8;
const LF = 10;
const CR = 13;
const DEL = 127;

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(question, (a) => {
      rl.close();
      resolve(a.trim());
    }),
  );
}

/// Prompt without echoing keystrokes.
function askSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    const wasRaw = Boolean(stdin.isRaw);
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    let buf = '';
    const finish = (value: string) => {
      if (stdin.isTTY) stdin.setRawMode(wasRaw);
      stdin.pause();
      stdin.removeListener('data', onData);
      process.stdout.write('\n');
      resolve(value);
    };
    const onData = (chunk: Buffer) => {
      for (const code of chunk) {
        if (code === LF || code === CR || code === EOT) return finish(buf);
        if (code === CTRL_C) {
          if (stdin.isTTY) stdin.setRawMode(wasRaw);
          process.stdout.write('\n');
          process.exit(130);
        }
        if (code === BACKSPACE || code === DEL) {
          buf = buf.slice(0, -1);
        } else if (code >= 32) {
          buf += String.fromCharCode(code);
        }
      }
    };
    stdin.on('data', onData);
  });
}

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/// Deliberately modest: length beats character-class theatre, and this single
/// human-chosen credential sits behind a second factor anyway.
function passwordProblem(v: string): string | null {
  if (v.length < 12) return 'Password must be at least 12 characters.';
  if (/^\d+$/.test(v)) return 'Password must not be only digits.';
  return null;
}

async function main() {
  console.log('\nStockVirtue — create admin account\n');

  const email = (await ask('Admin email: ')).toLowerCase();
  if (!isEmail(email)) {
    console.error('That is not a valid email address.');
    process.exitCode = 1;
    return;
  }

  const existing = await prisma.admin.findUnique({ where: { email } });
  const total = await prisma.admin.count();
  if (!existing && total > 0) {
    console.error(
      `\nAn admin already exists (${total} account(s)). This console is ` +
        `single-admin by design.\nRe-run with that account's email to rotate ` +
        `its password instead.`,
    );
    process.exitCode = 1;
    return;
  }
  if (existing) {
    const yes = await ask(
      `Admin "${email}" already exists. Replace its password? [y/N] `,
    );
    if (yes.toLowerCase() !== 'y') {
      console.log('Aborted — nothing changed.');
      return;
    }
  }

  const password = await askSecret('Password (hidden): ');
  const problem = passwordProblem(password);
  if (problem) {
    console.error(problem);
    process.exitCode = 1;
    return;
  }
  if ((await askSecret('Confirm password: ')) !== password) {
    console.error('Passwords do not match.');
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);
  if (existing) {
    await prisma.admin.update({
      where: { id: existing.id },
      data: { passwordHash },
    });
    console.log(`\n✅ Password rotated for ${email}.`);
  } else {
    await prisma.admin.create({
      data: { email, passwordHash, name: 'Admin' },
    });
    console.log(`\n✅ Admin ${email} created.`);
  }

  // Any live session belongs to the previous credential — end it.
  const revoked = await prisma.adminSession.updateMany({
    where: { revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: 'admin credential changed' },
  });
  if (revoked.count > 0) {
    console.log(`   ${revoked.count} active session(s) signed out.`);
  }
  console.log('   Sign in at /admin/login\n');
}

main()
  .catch((e) => {
    console.error('Failed:', (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
