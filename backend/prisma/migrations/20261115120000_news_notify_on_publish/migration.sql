-- "Send a notification when published" (owner, 6 Nov 2026: "if an article is
-- not a breaking news and they want to send a notification, that is also
-- allowed"). Additive and safe to run again: one enum value and one boolean
-- column with a default, so existing rows and the old code are unaffected.
--
-- "notifyOnPublish" is the editor's choice, kept on the story so it survives
-- scheduled publishing: when the story goes live the worker's push sweep
-- queues one EDITORS_PICK campaign for it (same readers as breaking news:
-- breaking alerts on), unless breaking news notifies it anyway. One
-- every-reader push (BREAKING or EDITORS_PICK) per story, ever. The rules are
-- in backend/src/newsroom/push/push-rules.ts.
-- Rollback: delete EDITORS_PICK rows from "notification_campaigns", then
-- ALTER TABLE "news_articles" DROP COLUMN "notifyOnPublish"; (Postgres can't
-- drop an enum value: leave EDITORS_PICK, the old code never writes it) and
-- delete this migration's row from _prisma_migrations.

-- AlterEnum (Postgres 12+ allows this inside the migration's transaction;
-- nothing below uses the new value)
ALTER TYPE "NotificationCampaignKind" ADD VALUE IF NOT EXISTS 'EDITORS_PICK';

-- AlterTable
ALTER TABLE "news_articles" ADD COLUMN IF NOT EXISTS "notifyOnPublish" BOOLEAN NOT NULL DEFAULT false;
