-- AlterEnum
ALTER TYPE "OrderType" ADD VALUE 'TRAILING_STOP';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "trailAmountP" BIGINT;
