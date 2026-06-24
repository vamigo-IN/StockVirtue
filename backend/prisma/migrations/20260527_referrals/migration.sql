-- AlterTable
ALTER TABLE "users"
    ADD COLUMN "referralCode" TEXT,
    ADD COLUMN "referredById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_referralCode_key" ON "users"("referralCode");

-- CreateIndex
CREATE INDEX "users_referredById_idx" ON "users"("referredById");

-- AddForeignKey: SetNull so deleting the referrer doesn't cascade-delete
-- the people they invited (their portfolios should outlive any single
-- account).
ALTER TABLE "users"
    ADD CONSTRAINT "users_referredById_fkey"
    FOREIGN KEY ("referredById") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill referralCode for existing users using the same FNV-1a 32-bit
-- algorithm the client emits ("SV-XXXXXX"). Codes shared on day -1 keep
-- resolving after redemption ships. PL/pgSQL implementation since native
-- SQL bit ops only get verbose with explicit unsigned-32-bit casts.
DO $$
DECLARE
    rec RECORD;
    hash BIGINT;
    cu INT;
    hex TEXT;
BEGIN
    FOR rec IN SELECT id FROM users WHERE "referralCode" IS NULL LOOP
        hash := 2166136261; -- 0x811c9dc5 FNV offset basis
        FOR cu IN SELECT ascii(substring(rec.id, i, 1))
                  FROM generate_series(1, length(rec.id)) AS s(i) LOOP
            hash := hash # cu;                       -- XOR with byte
            hash := (hash * 16777619) & 4294967295;  -- × FNV prime, mask to u32
        END LOOP;
        hex := upper(lpad(to_hex(hash), 8, '0'));
        UPDATE users
            SET "referralCode" = 'SV-' || substring(hex, 1, 6)
            WHERE id = rec.id;
    END LOOP;
END $$;
