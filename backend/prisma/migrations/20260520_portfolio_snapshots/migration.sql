-- CreateTable
CREATE TABLE "portfolio_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "totalEquityP" BIGINT NOT NULL,
    "investedP" BIGINT NOT NULL,
    "realizedPnLP" BIGINT NOT NULL,
    "unrealizedPnLP" BIGINT NOT NULL,
    "balanceP" BIGINT NOT NULL,
    "marginReservedP" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portfolio_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portfolio_snapshots_userId_asOfDate_key"
    ON "portfolio_snapshots"("userId", "asOfDate");

-- CreateIndex
CREATE INDEX "portfolio_snapshots_userId_asOfDate_idx"
    ON "portfolio_snapshots"("userId", "asOfDate");

-- AddForeignKey
ALTER TABLE "portfolio_snapshots"
    ADD CONSTRAINT "portfolio_snapshots_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
