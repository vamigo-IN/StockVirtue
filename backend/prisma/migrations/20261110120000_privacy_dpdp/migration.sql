-- Privacy under the Digital Personal Data Protection Act, 2023 and the DPDP
-- Rules, 2025: consent records, the notice version and 18+ confirmation on
-- each account, account deletion (a restricted copy kept a year, then
-- erased), nominees, and privacy requests and grievances. Additive.

-- CreateEnum
CREATE TYPE "PrivacyRequestType" AS ENUM ('ACCESS', 'CORRECTION', 'ERASURE', 'NOMINATION', 'WITHDRAW_CONSENT', 'GRIEVANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "PrivacyRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "UserStatus" ADD VALUE 'DELETED';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "adultConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "analyticsConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "eraseAfter" TIMESTAMP(3),
ADD COLUMN     "inactivityNoticeAt" TIMESTAMP(3),
ADD COLUMN     "noticeAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "noticeVersion" TEXT,
ADD COLUMN     "retainedIdentity" JSONB;

-- CreateTable
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL,
    "userId" TEXT,
    "visitorId" TEXT,
    "noticeVersion" TEXT NOT NULL,
    "granted" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "refused" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "adultDeclared" BOOLEAN,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "privacy_nominees" (
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "relationship" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "privacy_nominees_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "privacy_requests" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "type" "PrivacyRequestType" NOT NULL,
    "details" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" "PrivacyRequestStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "response" TEXT,
    "respondedAt" TIMESTAMP(3),
    "handledById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "privacy_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consent_records_userId_createdAt_idx" ON "consent_records"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "consent_records_visitorId_createdAt_idx" ON "consent_records"("visitorId", "createdAt");

-- CreateIndex
CREATE INDEX "consent_records_createdAt_idx" ON "consent_records"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "privacy_requests_reference_key" ON "privacy_requests"("reference");

-- CreateIndex
CREATE INDEX "privacy_requests_status_dueAt_idx" ON "privacy_requests"("status", "dueAt");

-- CreateIndex
CREATE INDEX "privacy_requests_userId_createdAt_idx" ON "privacy_requests"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "privacy_requests_createdAt_idx" ON "privacy_requests"("createdAt");

-- CreateIndex
CREATE INDEX "users_status_eraseAfter_idx" ON "users"("status", "eraseAfter");

-- CreateIndex
CREATE INDEX "users_status_lastLoginAt_idx" ON "users"("status", "lastLoginAt");

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_nominees" ADD CONSTRAINT "privacy_nominees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

