-- CreateTable
CREATE TABLE "leaderboard_entries" (
    "userId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "displayName" TEXT,
    "totalEquityP" BIGINT NOT NULL,
    "returnPct" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leaderboard_entries_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "leaderboard_entries_rank_idx" ON "leaderboard_entries"("rank");

-- AddForeignKey
ALTER TABLE "leaderboard_entries" ADD CONSTRAINT "leaderboard_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
