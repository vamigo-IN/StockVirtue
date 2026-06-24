import { Injectable } from '@nestjs/common';
import { Prisma, Wallet } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DEFAULT_BALANCE_PAISE = 100_000_000n; // ₹10,00,000

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  getOrCreate(userId: string, tx?: Prisma.TransactionClient): Promise<Wallet> {
    const client = tx ?? this.prisma;
    return client.wallet.upsert({
      where: { userId },
      update: {},
      create: { userId, balanceP: DEFAULT_BALANCE_PAISE },
    });
  }

  /**
   * Returns the wallet locked `FOR UPDATE` for the remainder of the
   * transaction, so concurrent money mutations for the same user serialise.
   * This is what makes the order engine's read-modify-write balance updates
   * safe — without it, two concurrent orders both read the same balance and
   * one write clobbers the other (lost update / double-spend). MUST be called
   * inside a transaction (it ensures the row exists first, then locks it).
   */
  async getForUpdate(
    userId: string,
    tx: Prisma.TransactionClient,
  ): Promise<Wallet> {
    await this.getOrCreate(userId, tx);
    const rows = await tx.$queryRaw<Wallet[]>`
      SELECT * FROM "wallets" WHERE "userId" = ${userId} FOR UPDATE`;
    return rows[0];
  }
}
