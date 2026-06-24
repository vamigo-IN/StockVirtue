-- AlterTable
ALTER TABLE "positions" ADD COLUMN "product" "OrderProduct" NOT NULL DEFAULT 'DELIVERY';

-- DropIndex
DROP INDEX "positions_userId_symboltoken_exchange_key";

-- CreateIndex
CREATE UNIQUE INDEX "positions_userId_symboltoken_exchange_product_key" ON "positions"("userId", "symboltoken", "exchange", "product");
