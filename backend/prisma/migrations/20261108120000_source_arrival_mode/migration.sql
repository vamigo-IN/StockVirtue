-- What happens to a news source's new items: they wait in Incoming news (the
-- default), become drafts, or are published at once (Super Admin only).
-- Additive.

-- CreateEnum
CREATE TYPE "NewsArrivalMode" AS ENUM ('INBOX', 'DRAFT', 'PUBLISH');

-- AlterTable
ALTER TABLE "news_sources" ADD COLUMN     "arrivalMode" "NewsArrivalMode" NOT NULL DEFAULT 'INBOX',
ADD COLUMN     "autoDailyLimit" INTEGER NOT NULL DEFAULT 20;
