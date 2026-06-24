-- AlterEnum
ALTER TYPE "OrderType" ADD VALUE 'STOP_LOSS';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "triggerPriceP" BIGINT;
