-- CreateEnum
CREATE TYPE "AbuseSubjectType" AS ENUM ('IP', 'USER');

-- CreateEnum
CREATE TYPE "AbuseStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'IGNORED', 'ACTIONED');

-- CreateTable
CREATE TABLE "traffic_stats" (
    "id" TEXT NOT NULL,
    "bucket" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "statusClass" INTEGER NOT NULL,
    "count" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL,
    "latencySumMs" BIGINT NOT NULL,
    "latencyMaxMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "traffic_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abuse_events" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectType" "AbuseSubjectType" NOT NULL,
    "subject" TEXT NOT NULL,
    "severity" INTEGER NOT NULL DEFAULT 1,
    "count" INTEGER NOT NULL,
    "threshold" INTEGER NOT NULL,
    "windowSec" INTEGER NOT NULL,
    "detail" TEXT,
    "ip" TEXT,
    "userId" TEXT,
    "status" "AbuseStatus" NOT NULL DEFAULT 'OPEN',
    "autoAction" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "abuse_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_logs" (
    "id" TEXT NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "method" TEXT NOT NULL,
    "route" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "userId" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "flagged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "request_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "traffic_stats_bucket_method_route_statusClass_key" ON "traffic_stats"("bucket", "method", "route", "statusClass");

-- CreateIndex
CREATE INDEX "traffic_stats_bucket_idx" ON "traffic_stats"("bucket");

-- CreateIndex
CREATE INDEX "abuse_events_status_createdAt_idx" ON "abuse_events"("status", "createdAt");

-- CreateIndex
CREATE INDEX "abuse_events_subjectType_subject_createdAt_idx" ON "abuse_events"("subjectType", "subject", "createdAt");

-- CreateIndex
CREATE INDEX "request_logs_ts_idx" ON "request_logs"("ts");

-- CreateIndex
CREATE INDEX "request_logs_userId_ts_idx" ON "request_logs"("userId", "ts");

-- CreateIndex
CREATE INDEX "request_logs_ip_ts_idx" ON "request_logs"("ip", "ts");
