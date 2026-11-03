-- Uploads are stored as WebP only; the file as sent is never kept. Record
-- what was uploaded (type and size) so the media library can show the
-- saving. Additive; images stored before this keep NULL.

-- AlterTable
ALTER TABLE "media_assets" ADD COLUMN     "sourceBytes" INTEGER,
ADD COLUMN     "sourceType" TEXT;
