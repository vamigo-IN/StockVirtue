-- CreateTable
CREATE TABLE "site_settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "siteTitle" TEXT NOT NULL DEFAULT '',
    "siteDescription" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "playStoreUrl" TEXT NOT NULL DEFAULT '',
    "social" JSONB NOT NULL DEFAULT '{}',
    "headCode" TEXT NOT NULL DEFAULT '',
    "bodyStartCode" TEXT NOT NULL DEFAULT '',
    "bodyEndCode" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("id")
);
