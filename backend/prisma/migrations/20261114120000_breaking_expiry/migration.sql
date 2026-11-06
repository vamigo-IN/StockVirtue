-- Breaking news ends 24 hours after a story became breaking (owner, 6 Nov
-- 2026: "after 24 hours remove that breaking tag from the news"). Additive
-- and safe to run again: one nullable column, a backfill and one index.
--
-- "breakingAt" is when a story became breaking: set when the switch is
-- turned on for a live story, or at publication for one that goes out
-- already marked; cleared when the switch goes off (by an editor, or by the
-- worker's sweep once the 24 hours are up). The rule is in
-- backend/src/newsroom/breaking.ts.
-- Rollback: DROP INDEX "news_articles_isBreaking_breakingAt_idx"; then
-- ALTER TABLE "news_articles" DROP COLUMN "breakingAt"; and delete this
-- migration's row from _prisma_migrations. The old code ignores the column.

-- AlterTable
ALTER TABLE "news_articles" ADD COLUMN IF NOT EXISTS "breakingAt" TIMESTAMP(3);

-- Stories marked breaking now count from their publication, which is what
-- the /news banner counted from until now. Any marked more than 24 hours
-- ago lose the label at once, and the first sweep turns their switches off
-- (one audit row each). Stories marked before they are out have no
-- publication yet: their 24 hours start when they go out.
UPDATE "news_articles"
   SET "breakingAt" = "publishedAt"
 WHERE "isBreaking" = true
   AND "breakingAt" IS NULL
   AND "publishedAt" IS NOT NULL;

-- CreateIndex (the sweep and the /news banner look stories up by these)
CREATE INDEX IF NOT EXISTS "news_articles_isBreaking_breakingAt_idx" ON "news_articles"("isBreaking", "breakingAt");
