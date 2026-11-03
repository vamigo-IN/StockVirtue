-- Website settings edited in the portal beyond the basics: branding, search
-- & indexing (SEO, robots.txt, sitemaps, llms.txt), analytics and
-- advertising, as one JSON document (src/site/site-config.ts). Additive.

-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN "config" JSONB NOT NULL DEFAULT '{}';
