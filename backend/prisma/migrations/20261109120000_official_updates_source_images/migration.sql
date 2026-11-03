-- Official updates: news from government bodies and regulators gets a section
-- of its own, kept out of Top stories and the latest-news list. Licensed
-- sources may also bring their pictures. Additive; the data steps below only
-- fill in what is empty.

-- AlterTable
ALTER TABLE "news_categories" ADD COLUMN "keepSeparate" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "news_sources" ADD COLUMN "useImages" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "news_source_items" ADD COLUMN "imageUrl" TEXT;

-- CreateIndex
CREATE INDEX "media_assets_sha256_idx" ON "media_assets"("sha256");

-- The Official updates category, unless one exists already (then it is kept
-- separate from now on).
INSERT INTO "news_categories" ("id", "slug", "name", "description", "position", "isActive", "keepSeparate", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text)::uuid,
       'official-updates',
       'Official updates',
       'Releases from the government, the RBI, SEBI and other official bodies.',
       COALESCE((SELECT MAX("position") + 1 FROM "news_categories" WHERE "parentId" IS NULL), 0),
       true,
       true,
       CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "news_categories" WHERE "slug" = 'official-updates');

UPDATE "news_categories"
   SET "keepSeparate" = true, "updatedAt" = CURRENT_TIMESTAMP
 WHERE "slug" = 'official-updates' AND NOT "keepSeparate";

-- Government and regulator sources without a category file their stories
-- there, including the items of theirs still waiting in Incoming news.
UPDATE "news_sources"
   SET "categoryId" = (SELECT "id" FROM "news_categories" WHERE "slug" = 'official-updates'),
       "updatedAt" = CURRENT_TIMESTAMP
 WHERE "type" IN ('RBI', 'SEBI', 'GOVERNMENT') AND "categoryId" IS NULL;

UPDATE "news_source_items" i
   SET "suggestedCategoryId" = s."categoryId"
  FROM "news_sources" s
 WHERE i."sourceId" = s."id"
   AND i."status" = 'NEW'
   AND s."type" IN ('RBI', 'SEBI', 'GOVERNMENT')
   AND s."categoryId" = (SELECT "id" FROM "news_categories" WHERE "slug" = 'official-updates');

-- A homepage layout someone already saved gains the section, after Top
-- stories / Trending (a layout never saved has it by default).
UPDATE "site_config" c
   SET "value" = jsonb_set(c."value", '{sections}', (
         SELECT jsonb_agg(x.e ORDER BY x.pos)
           FROM (
             SELECT s.e, s.n::numeric AS pos
               FROM jsonb_array_elements(c."value"->'sections') WITH ORDINALITY AS s(e, n)
             UNION ALL
             SELECT jsonb_build_object(
                      'id', 'official',
                      'type', 'category',
                      'enabled', true,
                      'title', 'Official updates',
                      'categorySlug', 'official-updates'),
                    COALESCE(
                      (SELECT MAX(t.n)
                         FROM jsonb_array_elements(c."value"->'sections') WITH ORDINALITY AS t(e, n)
                        WHERE t.e->>'type' IN ('latest', 'trending')),
                      jsonb_array_length(c."value"->'sections'))::numeric + 0.5
           ) x
       )),
       "version" = c."version" + 1,
       "updatedAt" = CURRENT_TIMESTAMP
 WHERE c."key" = 'news.homepage'
   AND jsonb_typeof(c."value"->'sections') = 'array'
   AND jsonb_array_length(c."value"->'sections') < 20
   AND NOT EXISTS (
         SELECT 1
           FROM jsonb_array_elements(c."value"->'sections') AS o(e)
          WHERE o.e->>'id' = 'official' OR o.e->>'categorySlug' = 'official-updates');
