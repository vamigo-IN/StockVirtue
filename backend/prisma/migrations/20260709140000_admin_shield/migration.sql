-- CreateEnum
CREATE TYPE "AdminLoginStatus" AS ENUM ('PENDING', 'OTP_SENT', 'VERIFIED', 'SUCCESS', 'FAILED', 'LOCKED', 'EXPIRED', 'TERMINATED');

-- CreateTable
CREATE TABLE "admin_login_sessions" (
    "id" TEXT NOT NULL,
    "adminId" TEXT,
    "email" TEXT NOT NULL,
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpVerifiedAt" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "otpResends" INTEGER NOT NULL DEFAULT 0,
    "passcodeHash" TEXT,
    "passcodeExpiresAt" TIMESTAMP(3),
    "passcodeVerifiedAt" TIMESTAMP(3),
    "passcodeAttempts" INTEGER NOT NULL DEFAULT 0,
    "passcodeResends" INTEGER NOT NULL DEFAULT 0,
    "passwordAttempts" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT,
    "userAgent" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "device" TEXT,
    "fingerprint" TEXT,
    "timezone" TEXT,
    "country" TEXT,
    "city" TEXT,
    "isp" TEXT,
    "status" "AdminLoginStatus" NOT NULL DEFAULT 'PENDING',
    "terminatedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "succeededAt" TIMESTAMP(3),

    CONSTRAINT "admin_login_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "loginSessionId" TEXT,
    "fingerprint" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_devices" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "label" TEXT,
    "lastIp" TEXT,
    "lastUserAgent" TEXT,
    "failedSessions" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMP(3),
    "blockReason" TEXT,
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_login_sessions_email_createdAt_idx" ON "admin_login_sessions"("email", "createdAt");

-- CreateIndex
CREATE INDEX "admin_login_sessions_fingerprint_idx" ON "admin_login_sessions"("fingerprint");

-- CreateIndex
CREATE INDEX "admin_login_sessions_status_idx" ON "admin_login_sessions"("status");

-- CreateIndex
CREATE INDEX "admin_sessions_adminId_revokedAt_idx" ON "admin_sessions"("adminId", "revokedAt");

-- CreateIndex
CREATE INDEX "admin_sessions_expiresAt_idx" ON "admin_sessions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "admin_devices_fingerprint_key" ON "admin_devices"("fingerprint");

-- CreateIndex
CREATE INDEX "admin_devices_blockedUntil_idx" ON "admin_devices"("blockedUntil");

-- Make the admin audit log genuinely append-only (Admin Shield spec §20:
-- "Logs must never be editable"). Postgres enforces it here rather than
-- trusting application code, so even a compromised app role cannot rewrite
-- history. INSERT and SELECT are unaffected.
--
-- If this ever needs to be undone for maintenance, run:
--   DROP TRIGGER "admin_audit_logs_append_only" ON "admin_audit_logs";
CREATE OR REPLACE FUNCTION "admin_audit_logs_append_only_fn"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'admin_audit_logs is append-only (attempted %)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "admin_audit_logs_append_only"
    BEFORE UPDATE OR DELETE ON "admin_audit_logs"
    FOR EACH ROW EXECUTE FUNCTION "admin_audit_logs_append_only_fn"();
