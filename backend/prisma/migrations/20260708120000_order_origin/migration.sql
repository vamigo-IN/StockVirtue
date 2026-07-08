-- CreateEnum
CREATE TYPE "OrderOrigin" AS ENUM ('USER', 'AUTO_SQUARE', 'EXPIRY');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "origin" "OrderOrigin" NOT NULL DEFAULT 'USER';
