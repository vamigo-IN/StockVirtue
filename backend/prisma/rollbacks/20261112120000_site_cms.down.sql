-- Rollback for migration 20261112120000_site_cms (W7, the admin-managed
-- public site). Drops ONLY the four tables and three enums that migration
-- added; existing tables are untouched. This deletes every page edit and
-- revision, every privacy notice version and every cookie choice version:
-- export them first (pg_dump -t site_content -t site_content_revisions
-- -t privacy_notice_versions -t cookie_consent_versions). Consent records
-- keep their notice version strings. Then remove the migration's row from
-- _prisma_migrations so a later deploy can apply it again.
-- Run with: psql "$DATABASE_URL" -f <this file>
BEGIN;

-- DropForeignKey
ALTER TABLE "site_content" DROP CONSTRAINT "site_content_publishedRevisionId_fkey";

-- DropForeignKey
ALTER TABLE "site_content_revisions" DROP CONSTRAINT "site_content_revisions_contentId_fkey";

-- DropForeignKey
ALTER TABLE "site_content_revisions" DROP CONSTRAINT "site_content_revisions_noticeVersion_fkey";

-- DropTable
DROP TABLE "site_content_revisions";

-- DropTable
DROP TABLE "site_content";

-- DropTable
DROP TABLE "privacy_notice_versions";

-- DropTable
DROP TABLE "cookie_consent_versions";

-- DropEnum
DROP TYPE "SiteRevisionChange";

-- DropEnum
DROP TYPE "SiteContentStatus";

-- DropEnum
DROP TYPE "SiteContentKind";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261112120000_site_cms';

COMMIT;
