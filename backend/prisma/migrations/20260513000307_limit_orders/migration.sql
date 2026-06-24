-- AlterTable
ALTER TABLE "positions" ADD COLUMN     "reservedQty" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "wallets" ADD COLUMN     "reservedP" BIGINT NOT NULL DEFAULT 0;
