-- CreateEnum
CREATE TYPE "OrderProduct" AS ENUM ('DELIVERY', 'INTRADAY');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "product" "OrderProduct" NOT NULL DEFAULT 'DELIVERY';
