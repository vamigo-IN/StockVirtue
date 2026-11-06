-- W7: the admin-managed public site. Additive: three new enums and four new
-- tables; no existing table changes. Seeds the current privacy notice
-- version (2026-11) so nobody is asked to accept it again. Cookie choice
-- version 1 is created at API boot (it needs the services in use), and so
-- are the five legal documents (revision 1, from today's text).
-- Rollback: backend/prisma/rollbacks/20261112120000_site_cms.down.sql drops the
-- four tables and the enums. A rollback loses every page edit, every notice
-- version and every cookie version made after the seed, so export them first.

-- CreateEnum
CREATE TYPE "SiteContentKind" AS ENUM ('DESIGNED', 'SHARED', 'CHROME', 'LEGAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SiteContentStatus" AS ENUM ('DRAFT', 'LIVE', 'HIDDEN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SiteRevisionChange" AS ENUM ('SEED', 'EDIT', 'MINOR', 'MATERIAL', 'SETTINGS');

-- CreateTable
CREATE TABLE "site_content" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "SiteContentKind" NOT NULL,
    "status" "SiteContentStatus" NOT NULL DEFAULT 'DRAFT',
    "slug" TEXT,
    "previousSlugs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lang" TEXT NOT NULL DEFAULT 'en',
    "title" TEXT NOT NULL DEFAULT '',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "draft" JSONB,
    "draftVersion" INTEGER NOT NULL DEFAULT 0,
    "draftUpdatedAt" TIMESTAMP(3),
    "draftUpdatedById" UUID,
    "draftRestoredFromId" UUID,
    "publishedRevisionId" UUID,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_content_revisions" (
    "id" UUID NOT NULL,
    "contentId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "change" "SiteRevisionChange" NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "summaryHi" TEXT NOT NULL DEFAULT '',
    "noticeVersion" TEXT,
    "dateShown" TIMESTAMP(3) NOT NULL,
    "dateLabel" TEXT,
    "liveValues" JSONB,
    "factsSnapshot" JSONB,
    "announcedAt" TIMESTAMP(3),
    "announcedVia" TEXT,
    "restoredFromId" UUID,
    "publishedById" UUID,
    "publishedByEmail" TEXT NOT NULL DEFAULT '',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_content_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_notice_versions" (
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "materialAt" TIMESTAMP(3) NOT NULL,
    "summaryEn" TEXT NOT NULL DEFAULT '',
    "summaryHi" TEXT NOT NULL DEFAULT '',
    "announce" BOOLEAN NOT NULL DEFAULT true,
    "affectsAnalytics" BOOLEAN NOT NULL DEFAULT false,
    "affectsCookies" BOOLEAN NOT NULL DEFAULT false,
    "publishedById" UUID,
    "publishedByEmail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "privacy_notice_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cookie_consent_versions" (
    "version" INTEGER NOT NULL,
    "services" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "noticeVersion" TEXT,
    "createdById" UUID,
    "createdByEmail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cookie_consent_versions_pkey" PRIMARY KEY ("version")
);

-- CreateIndex
CREATE UNIQUE INDEX "site_content_key_key" ON "site_content"("key");

-- CreateIndex
CREATE UNIQUE INDEX "site_content_slug_key" ON "site_content"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "site_content_publishedRevisionId_key" ON "site_content"("publishedRevisionId");

-- CreateIndex
CREATE INDEX "site_content_kind_status_idx" ON "site_content"("kind", "status");

-- CreateIndex
CREATE INDEX "site_content_revisions_contentId_publishedAt_idx" ON "site_content_revisions"("contentId", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "site_content_revisions_noticeVersion_idx" ON "site_content_revisions"("noticeVersion");

-- CreateIndex
CREATE UNIQUE INDEX "site_content_revisions_contentId_number_key" ON "site_content_revisions"("contentId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "privacy_notice_versions_seq_key" ON "privacy_notice_versions"("seq");

-- AddForeignKey
ALTER TABLE "site_content" ADD CONSTRAINT "site_content_publishedRevisionId_fkey" FOREIGN KEY ("publishedRevisionId") REFERENCES "site_content_revisions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_content_revisions" ADD CONSTRAINT "site_content_revisions_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "site_content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_content_revisions" ADD CONSTRAINT "site_content_revisions_noticeVersion_fkey" FOREIGN KEY ("noticeVersion") REFERENCES "privacy_notice_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The current privacy notice (3 Nov 2026). announce = false: deploying this
-- must not put the "We updated our privacy notice" line on the site.
INSERT INTO "privacy_notice_versions" ("id", "materialAt", "announce", "affectsAnalytics", "affectsCookies", "summaryEn", "summaryHi", "publishedByEmail", "createdAt")
SELECT '2026-11', TIMESTAMPTZ '2026-11-03 00:00:00+05:30' AT TIME ZONE 'UTC', false, false, false, '', '', 'seed', now() AT TIME ZONE 'UTC'
WHERE NOT EXISTS (SELECT 1 FROM "privacy_notice_versions" WHERE "id" = '2026-11');
