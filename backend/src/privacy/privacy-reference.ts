import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/// No 0/O or 1/I: references get read out over the phone.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A short code people quote about their request, e.g. PR-7K3Q9X. */
export async function newRequestReference(
  db: Prisma.TransactionClient | PrismaService,
): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    let code = 'PR-';
    for (let i = 0; i < 6; i++) code += ALPHABET[randomInt(ALPHABET.length)];
    const taken = await db.privacyRequest.findUnique({
      where: { reference: code },
      select: { id: true },
    });
    if (!taken) return code;
  }
  return `PR-${Date.now().toString(36).toUpperCase()}`;
}
