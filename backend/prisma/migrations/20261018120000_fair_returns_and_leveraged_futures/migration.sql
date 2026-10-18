-- ─── Fair (trading-only) returns ────────────────────────────────────────────
-- Non-trading wallet credits (referral bonuses, promotional top-ups) are now
-- recorded in an append-only ledger so room / leaderboard returns can exclude
-- them: a bonus grows the balance but never the "winning %".

-- CreateEnum
CREATE TYPE "WalletCreditKind" AS ENUM ('REFERRAL_REFERRER', 'REFERRAL_REDEEMED', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "wallet_credits" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "WalletCreditKind" NOT NULL,
    "amountP" BIGINT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_credits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_credits_userId_createdAt_idx" ON "wallet_credits"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "wallet_credits" ADD CONSTRAINT "wallet_credits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the referral bonuses already paid out (₹25,000 to the redeemer,
-- ₹50,000 to the referrer — the amounts hard-coded in ReferralsService).
-- The exact redemption moment was never stored; it happened within 7 days of
-- the redeemer's sign-up, so the sign-up time is used. That is the earliest
-- possible moment, which can only ever under-exclude a bonus (never wrongly
-- penalise a member's return).
INSERT INTO "wallet_credits" ("id", "userId", "kind", "amountP", "note", "createdAt")
SELECT 'wcb_' || md5(u."id" || ':redeemed'), u."id", 'REFERRAL_REDEEMED', 2500000,
       'Invite code redeemed (backfilled)', u."createdAt"
FROM "users" u
WHERE u."referredById" IS NOT NULL;

INSERT INTO "wallet_credits" ("id", "userId", "kind", "amountP", "note", "createdAt")
SELECT 'wcb_' || md5(u."id" || ':referrer'), u."referredById", 'REFERRAL_REFERRER', 5000000,
       'Friend joined with your invite code (backfilled)', u."createdAt"
FROM "users" u
WHERE u."referredById" IS NOT NULL;

-- Room members: when the baseline was captured (credits after it are
-- excluded) + the frozen end-of-tournament figures.
ALTER TABLE "room_members"
    ADD COLUMN "baselineAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN "finalEquityP" BIGINT,
    ADD COLUMN "finalCreditsP" BIGINT;
UPDATE "room_members" SET "baselineAt" = "joinedAt";

-- Rooms: tournament lifecycle stamps.
ALTER TABLE "rooms"
    ADD COLUMN "startedAt" TIMESTAMP(3),
    ADD COLUMN "finalizedAt" TIMESTAMP(3);
-- Tournaments already under way keep their join-time baselines: re-baselining
-- them now would wipe progress mid-race. Ended ones are finalized (equity
-- captured) by RoomsLifecycleService on its first sweep.
UPDATE "rooms" SET "startedAt" = "startsAt"
WHERE "isTournament" = true AND "startsAt" IS NOT NULL AND "startsAt" <= CURRENT_TIMESTAMP;

-- ─── Margin-based futures ───────────────────────────────────────────────────
ALTER TABLE "positions" ADD COLUMN "leveraged" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders"
    ADD COLUMN "leveraged" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "cashReservedP" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "orders"
    ADD CONSTRAINT "orders_cashReservedP_nonneg" CHECK ("cashReservedP" >= 0);
