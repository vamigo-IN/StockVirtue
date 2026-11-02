-- CreateEnum
CREATE TYPE "NewsSourceType" AS ENUM ('RSS', 'LICENSED_API', 'EXCHANGE', 'COMPANY_IR', 'RBI', 'SEBI', 'GOVERNMENT', 'MANUAL');

-- CreateEnum
CREATE TYPE "NewsSourceFormat" AS ENUM ('FEED', 'JSON_API', 'NONE');

-- CreateEnum
CREATE TYPE "NewsSourceUsage" AS ENUM ('HEADLINE_ONLY', 'SUMMARY', 'FULL_TEXT');

-- CreateEnum
CREATE TYPE "NewsItemStatus" AS ENUM ('NEW', 'DRAFTED', 'DISMISSED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "NewsFetchStatus" AS ENUM ('RUNNING', 'SUCCESS', 'NOT_MODIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "NewsFetchTrigger" AS ENUM ('SCHEDULE', 'MANUAL', 'RETRY');

-- CreateEnum
CREATE TYPE "AiProviderKind" AS ENUM ('ANTHROPIC', 'OPENAI', 'OPENAI_COMPATIBLE', 'OLLAMA');

-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "AiTask" AS ENUM ('DRAFT_FROM_SOURCE', 'DRAFT_FROM_NOTES', 'HEADLINES', 'SUMMARY', 'SEO', 'TAXONOMY', 'RELATED_STOCKS', 'RELATED_ARTICLES', 'REVIEW', 'EXPLAINERS', 'REWRITE_SECTION');

-- CreateTable
CREATE TABLE "news_sources" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "NewsSourceType" NOT NULL,
    "format" "NewsSourceFormat" NOT NULL,
    "url" TEXT,
    "auth" JSONB NOT NULL DEFAULT '{}',
    "secret" TEXT,
    "mapping" JSONB NOT NULL DEFAULT '{}',
    "pollMinutes" INTEGER NOT NULL DEFAULT 30,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "categoryId" UUID,
    "usage" "NewsSourceUsage" NOT NULL DEFAULT 'HEADLINE_ONLY',
    "allowAiDrafts" BOOLEAN NOT NULL DEFAULT false,
    "attribution" TEXT NOT NULL DEFAULT '',
    "licenceNote" TEXT,
    "notifyEditors" BOOLEAN NOT NULL DEFAULT false,
    "etag" TEXT,
    "lastModified" TEXT,
    "nextPollAt" TIMESTAMP(3),
    "lastFetchedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_source_items" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "externalHash" TEXT NOT NULL,
    "url" TEXT,
    "urlHash" TEXT,
    "title" TEXT NOT NULL,
    "titleKey" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usage" "NewsSourceUsage" NOT NULL,
    "allowAiDrafts" BOOLEAN NOT NULL DEFAULT false,
    "attribution" TEXT NOT NULL DEFAULT '',
    "feedCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stocks" JSONB NOT NULL DEFAULT '[]',
    "stockRefs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "topics" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "suggestedCategoryId" UUID,
    "status" "NewsItemStatus" NOT NULL DEFAULT 'NEW',
    "duplicateOfId" UUID,
    "duplicateOfArticleId" UUID,
    "duplicateScore" DOUBLE PRECISION,
    "articleId" UUID,
    "handledById" UUID,
    "handledAt" TIMESTAMP(3),

    CONSTRAINT "news_source_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_fetch_logs" (
    "id" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "trigger" "NewsFetchTrigger" NOT NULL,
    "status" "NewsFetchStatus" NOT NULL DEFAULT 'RUNNING',
    "requestedBy" TEXT,
    "retryOfId" UUID,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "httpStatus" INTEGER,
    "itemsSeen" INTEGER NOT NULL DEFAULT 0,
    "itemsNew" INTEGER NOT NULL DEFAULT 0,
    "itemsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "news_fetch_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_stock_aliases" (
    "id" UUID NOT NULL,
    "alias" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "exchange" TEXT,
    "symbol" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_stock_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_providers" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AiProviderKind" NOT NULL,
    "baseUrl" TEXT,
    "model" TEXT NOT NULL,
    "apiKey" TEXT,
    "inputCostPerMTok" DOUBLE PRECISION,
    "outputCostPerMTok" DOUBLE PRECISION,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 120,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "providerId" UUID,
    "autoDraft" BOOLEAN NOT NULL DEFAULT false,
    "disabledTasks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "monthlyBudgetUsd" DOUBLE PRECISION,
    "dailyJobsPerUser" INTEGER NOT NULL DEFAULT 60,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_jobs" (
    "id" UUID NOT NULL,
    "task" "AiTask" NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'QUEUED',
    "providerId" UUID,
    "providerKind" TEXT,
    "model" TEXT,
    "promptId" TEXT NOT NULL,
    "promptVersion" INTEGER NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB,
    "checks" JSONB,
    "error" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "durationMs" INTEGER,
    "requestedById" UUID,
    "articleId" UUID,
    "sourceItemId" UUID,
    "appliedAt" TIMESTAMP(3),
    "appliedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "news_sources_isActive_nextPollAt_idx" ON "news_sources"("isActive", "nextPollAt");

-- CreateIndex
CREATE INDEX "news_source_items_status_fetchedAt_idx" ON "news_source_items"("status", "fetchedAt" DESC);

-- CreateIndex
CREATE INDEX "news_source_items_sourceId_fetchedAt_idx" ON "news_source_items"("sourceId", "fetchedAt" DESC);

-- CreateIndex
CREATE INDEX "news_source_items_urlHash_idx" ON "news_source_items"("urlHash");

-- CreateIndex
CREATE INDEX "news_source_items_titleKey_idx" ON "news_source_items"("titleKey");

-- CreateIndex
CREATE INDEX "news_source_items_fetchedAt_idx" ON "news_source_items"("fetchedAt");

-- CreateIndex
CREATE INDEX "news_source_items_articleId_idx" ON "news_source_items"("articleId");

-- CreateIndex
CREATE INDEX "news_source_items_stockRefs_idx" ON "news_source_items" USING GIN ("stockRefs");

-- CreateIndex
CREATE UNIQUE INDEX "news_source_items_sourceId_externalHash_key" ON "news_source_items"("sourceId", "externalHash");

-- CreateIndex
CREATE INDEX "news_fetch_logs_sourceId_startedAt_idx" ON "news_fetch_logs"("sourceId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "news_fetch_logs_status_startedAt_idx" ON "news_fetch_logs"("status", "startedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "news_stock_aliases_alias_key" ON "news_stock_aliases"("alias");

-- CreateIndex
CREATE INDEX "ai_jobs_createdAt_idx" ON "ai_jobs"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "ai_jobs_articleId_createdAt_idx" ON "ai_jobs"("articleId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ai_jobs_sourceItemId_createdAt_idx" ON "ai_jobs"("sourceItemId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ai_jobs_requestedById_createdAt_idx" ON "ai_jobs"("requestedById", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ai_jobs_status_createdAt_idx" ON "ai_jobs"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "news_sources" ADD CONSTRAINT "news_sources_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "news_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_source_items" ADD CONSTRAINT "news_source_items_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "news_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_source_items" ADD CONSTRAINT "news_source_items_suggestedCategoryId_fkey" FOREIGN KEY ("suggestedCategoryId") REFERENCES "news_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_source_items" ADD CONSTRAINT "news_source_items_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "news_source_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_source_items" ADD CONSTRAINT "news_source_items_duplicateOfArticleId_fkey" FOREIGN KEY ("duplicateOfArticleId") REFERENCES "news_articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_source_items" ADD CONSTRAINT "news_source_items_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "news_articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_source_items" ADD CONSTRAINT "news_source_items_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_fetch_logs" ADD CONSTRAINT "news_fetch_logs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "news_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_fetch_logs" ADD CONSTRAINT "news_fetch_logs_retryOfId_fkey" FOREIGN KEY ("retryOfId") REFERENCES "news_fetch_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ai_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ai_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "news_articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "news_source_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

