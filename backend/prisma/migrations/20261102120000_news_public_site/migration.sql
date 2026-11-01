-- Public news site (newsroom phase 5). Additive only.
--
-- searchVector is a STORED generated column, so Postgres keeps it in step
-- with every insert and update; the app only reads it. Prisma has no syntax
-- for generated columns, so the schema declares it as Unsupported("tsvector").
--
-- Rollback (no data outside these objects is touched):
--   DROP INDEX "news_articles_searchVector_idx";
--   ALTER TABLE "news_articles" DROP COLUMN "searchVector";
--   DROP TABLE "news_daily_stats";
--   DROP TABLE "site_config";

-- AlterTable
ALTER TABLE "news_articles" ADD COLUMN "searchVector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english'::regconfig, coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english'::regconfig, coalesce("subtitle", '') || ' ' || coalesce("summary", '')), 'B') ||
    setweight(to_tsvector('english'::regconfig, coalesce("contentText", '')), 'C')
  ) STORED;

-- CreateTable
CREATE TABLE "news_daily_stats" (
    "articleId" UUID NOT NULL,
    "day" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "news_daily_stats_pkey" PRIMARY KEY ("articleId","day")
);

-- CreateTable
CREATE TABLE "site_config" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_config_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "news_daily_stats_day_idx" ON "news_daily_stats"("day");

-- CreateIndex
CREATE INDEX "news_articles_searchVector_idx" ON "news_articles" USING GIN ("searchVector");

-- AddForeignKey
ALTER TABLE "news_daily_stats" ADD CONSTRAINT "news_daily_stats_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "news_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
