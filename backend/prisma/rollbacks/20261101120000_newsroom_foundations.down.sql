-- Rollback for migration 20261101120000_newsroom_foundations.
-- Drops ONLY the newsroom tables and enums added by that migration; existing
-- StockVirtue tables are untouched. Take a pg_dump first: this deletes all
-- newsroom data. Run with: psql "$DATABASE_URL" -f <this file>
BEGIN;

-- DropForeignKey
ALTER TABLE "staff_profiles" DROP CONSTRAINT "staff_profiles_userId_fkey";

-- DropForeignKey
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_roleId_fkey";

-- DropForeignKey
ALTER TABLE "role_permissions" DROP CONSTRAINT "role_permissions_permissionKey_fkey";

-- DropForeignKey
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_userId_fkey";

-- DropForeignKey
ALTER TABLE "user_roles" DROP CONSTRAINT "user_roles_roleId_fkey";

-- DropForeignKey
ALTER TABLE "staff_sessions" DROP CONSTRAINT "staff_sessions_staffId_fkey";

-- DropForeignKey
ALTER TABLE "staff_login_challenges" DROP CONSTRAINT "staff_login_challenges_staffId_fkey";

-- DropForeignKey
ALTER TABLE "news_categories" DROP CONSTRAINT "news_categories_parentId_fkey";

-- DropForeignKey
ALTER TABLE "news_authors" DROP CONSTRAINT "news_authors_staffId_fkey";

-- DropForeignKey
ALTER TABLE "media_assets" DROP CONSTRAINT "media_assets_uploadedById_fkey";

-- DropForeignKey
ALTER TABLE "news_articles" DROP CONSTRAINT "news_articles_categoryId_fkey";

-- DropForeignKey
ALTER TABLE "news_articles" DROP CONSTRAINT "news_articles_authorId_fkey";

-- DropForeignKey
ALTER TABLE "news_articles" DROP CONSTRAINT "news_articles_createdById_fkey";

-- DropForeignKey
ALTER TABLE "news_articles" DROP CONSTRAINT "news_articles_featuredImageId_fkey";

-- DropForeignKey
ALTER TABLE "news_versions" DROP CONSTRAINT "news_versions_articleId_fkey";

-- DropForeignKey
ALTER TABLE "news_versions" DROP CONSTRAINT "news_versions_editorId_fkey";

-- DropForeignKey
ALTER TABLE "news_article_tags" DROP CONSTRAINT "news_article_tags_articleId_fkey";

-- DropForeignKey
ALTER TABLE "news_article_tags" DROP CONSTRAINT "news_article_tags_tagId_fkey";

-- DropForeignKey
ALTER TABLE "news_assignments" DROP CONSTRAINT "news_assignments_articleId_fkey";

-- DropForeignKey
ALTER TABLE "news_assignments" DROP CONSTRAINT "news_assignments_assigneeId_fkey";

-- DropForeignKey
ALTER TABLE "news_assignments" DROP CONSTRAINT "news_assignments_assignedById_fkey";

-- DropForeignKey
ALTER TABLE "news_reviews" DROP CONSTRAINT "news_reviews_articleId_fkey";

-- DropForeignKey
ALTER TABLE "news_reviews" DROP CONSTRAINT "news_reviews_reviewerId_fkey";

-- DropForeignKey
ALTER TABLE "news_comments" DROP CONSTRAINT "news_comments_articleId_fkey";

-- DropForeignKey
ALTER TABLE "news_comments" DROP CONSTRAINT "news_comments_authorId_fkey";

-- DropForeignKey
ALTER TABLE "news_comments" DROP CONSTRAINT "news_comments_parentId_fkey";

-- DropForeignKey
ALTER TABLE "news_article_stocks" DROP CONSTRAINT "news_article_stocks_articleId_fkey";

-- DropForeignKey
ALTER TABLE "news_related_articles" DROP CONSTRAINT "news_related_articles_articleId_fkey";

-- DropForeignKey
ALTER TABLE "news_related_articles" DROP CONSTRAINT "news_related_articles_relatedId_fkey";

-- DropTable
DROP TABLE "staff_profiles";

-- DropTable
DROP TABLE "roles";

-- DropTable
DROP TABLE "permissions";

-- DropTable
DROP TABLE "role_permissions";

-- DropTable
DROP TABLE "user_roles";

-- DropTable
DROP TABLE "staff_sessions";

-- DropTable
DROP TABLE "staff_login_challenges";

-- DropTable
DROP TABLE "staff_invitations";

-- DropTable
DROP TABLE "audit_logs";

-- DropTable
DROP TABLE "news_categories";

-- DropTable
DROP TABLE "news_tags";

-- DropTable
DROP TABLE "news_authors";

-- DropTable
DROP TABLE "media_assets";

-- DropTable
DROP TABLE "news_articles";

-- DropTable
DROP TABLE "news_versions";

-- DropTable
DROP TABLE "news_article_tags";

-- DropTable
DROP TABLE "news_assignments";

-- DropTable
DROP TABLE "news_reviews";

-- DropTable
DROP TABLE "news_comments";

-- DropTable
DROP TABLE "news_article_stocks";

-- DropTable
DROP TABLE "news_related_articles";

-- DropEnum
DROP TYPE "StaffStatus";

-- DropEnum
DROP TYPE "StaffChallengeStatus";

-- DropEnum
DROP TYPE "NewsStatus";

-- DropEnum
DROP TYPE "MediaStatus";

-- DropEnum
DROP TYPE "NewsVersionReason";

-- DropEnum
DROP TYPE "NewsAssignmentRole";

-- DropEnum
DROP TYPE "NewsAssignmentStatus";

-- DropEnum
DROP TYPE "NewsReviewDecision";


-- Let `prisma migrate deploy` re-apply the migration later if wanted.
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261101120000_newsroom_foundations';

COMMIT;
