-- CreateEnum
CREATE TYPE "NotificationCampaignKind" AS ENUM ('BREAKING', 'FOLLOWED_STOCKS');

-- CreateEnum
CREATE TYPE "NotificationCampaignStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "news_bookmarks" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "articleId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_bookmarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_alert_preferences" (
    "userId" TEXT NOT NULL,
    "breaking" BOOLEAN NOT NULL DEFAULT true,
    "followedStocks" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_alert_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "notification_campaigns" (
    "id" UUID NOT NULL,
    "kind" "NotificationCampaignKind" NOT NULL,
    "status" "NotificationCampaignStatus" NOT NULL DEFAULT 'QUEUED',
    "dedupeKey" TEXT,
    "articleId" UUID,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "audience" JSONB NOT NULL DEFAULT '{}',
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "opens" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "news_bookmarks_userId_createdAt_idx" ON "news_bookmarks"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "news_bookmarks_articleId_idx" ON "news_bookmarks"("articleId");

-- CreateIndex
CREATE UNIQUE INDEX "news_bookmarks_userId_articleId_key" ON "news_bookmarks"("userId", "articleId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_campaigns_dedupeKey_key" ON "notification_campaigns"("dedupeKey");

-- CreateIndex
CREATE INDEX "notification_campaigns_status_scheduledAt_idx" ON "notification_campaigns"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "notification_campaigns_articleId_idx" ON "notification_campaigns"("articleId");

-- CreateIndex
CREATE INDEX "notification_campaigns_createdAt_idx" ON "notification_campaigns"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "news_bookmarks" ADD CONSTRAINT "news_bookmarks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_bookmarks" ADD CONSTRAINT "news_bookmarks_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "news_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_alert_preferences" ADD CONSTRAINT "news_alert_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_campaigns" ADD CONSTRAINT "notification_campaigns_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "news_articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

