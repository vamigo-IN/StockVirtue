-- AlterTable
ALTER TABLE "wallets" ADD COLUMN "marginReservedP" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "positions" ADD COLUMN "marginP" BIGINT NOT NULL DEFAULT 0;
