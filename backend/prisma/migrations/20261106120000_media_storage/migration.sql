-- Media files are kept on this server's disk until Cloudflare R2 is connected
-- in the portal (Media storage). Additive only.

-- CreateEnum
CREATE TYPE "MediaStore" AS ENUM ('R2', 'LOCAL');

-- AlterTable: every existing file was uploaded to R2, the only store so far.
-- New rows default to this server's disk (the code always sets the store).
ALTER TABLE "media_assets" ADD COLUMN "store" "MediaStore" NOT NULL DEFAULT 'R2';
ALTER TABLE "media_assets" ALTER COLUMN "store" SET DEFAULT 'LOCAL';

-- CreateTable
CREATE TABLE "media_storage_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "accountId" TEXT NOT NULL DEFAULT '',
    "endpoint" TEXT NOT NULL DEFAULT '',
    "bucket" TEXT NOT NULL DEFAULT '',
    "accessKeyId" TEXT NOT NULL DEFAULT '',
    "secretAccessKey" TEXT,
    "uploadToR2" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckAt" TIMESTAMP(3),
    "lastCheckOk" BOOLEAN,
    "lastCheck" JSONB,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_storage_settings_pkey" PRIMARY KEY ("id")
);
