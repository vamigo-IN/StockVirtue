-- CreateEnum
CREATE TYPE "AdminEmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "admin_login_sessions" ADD COLUMN     "otpEmailStatus" "AdminEmailStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "otpEmailAt" TIMESTAMP(3);
