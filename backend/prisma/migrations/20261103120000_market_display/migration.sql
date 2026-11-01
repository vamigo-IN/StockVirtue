-- Market display (newsroom phase 6): curated instruments, data rights, last
-- known prices, saved widgets and the per-article widget index. Additive only.
--
-- Rollback (touches nothing else):
--   DROP TABLE "news_widget_instances", "market_widgets", "market_quotes",
--     "market_instruments", "market_data_sources";
--   DROP TYPE "MarketInstrumentKind"; DROP TYPE "MarketDataRight";

-- CreateEnum
CREATE TYPE "MarketDataRight" AS ENUM ('LIVE', 'DELAYED', 'EOD', 'OFF');

-- CreateEnum
CREATE TYPE "MarketInstrumentKind" AS ENUM ('INDEX', 'STOCK', 'COMMODITY', 'CURRENCY');

-- CreateTable
CREATE TABLE "market_data_sources" (
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "webRight" "MarketDataRight" NOT NULL DEFAULT 'LIVE',
    "appRight" "MarketDataRight" NOT NULL DEFAULT 'LIVE',
    "delayMinutes" INTEGER NOT NULL DEFAULT 15,
    "attribution" TEXT NOT NULL DEFAULT '',
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_data_sources_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "market_instruments" (
    "id" UUID NOT NULL,
    "sourceKey" TEXT NOT NULL DEFAULT 'angel-one',
    "kind" "MarketInstrumentKind" NOT NULL,
    "exchange" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "inTicker" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_instruments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_quotes" (
    "instrumentId" UUID NOT NULL,
    "ltp" DOUBLE PRECISION NOT NULL,
    "open" DOUBLE PRECISION NOT NULL,
    "high" DOUBLE PRECISION NOT NULL,
    "low" DOUBLE PRECISION NOT NULL,
    "prevClose" DOUBLE PRECISION NOT NULL,
    "change" DOUBLE PRECISION NOT NULL,
    "changePct" DOUBLE PRECISION NOT NULL,
    "volume" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "asOf" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_quotes_pkey" PRIMARY KEY ("instrumentId")
);

-- CreateTable
CREATE TABLE "market_widgets" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "config" JSONB NOT NULL,
    "symbols" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_widgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_widget_instances" (
    "id" UUID NOT NULL,
    "articleId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "widgetId" UUID,
    "symbols" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "news_widget_instances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "market_instruments_isEnabled_position_idx" ON "market_instruments"("isEnabled", "position");

-- CreateIndex
CREATE UNIQUE INDEX "market_instruments_exchange_symbol_key" ON "market_instruments"("exchange", "symbol");

-- CreateIndex
CREATE INDEX "market_widgets_type_idx" ON "market_widgets"("type");

-- CreateIndex
CREATE INDEX "market_widgets_symbols_idx" ON "market_widgets" USING GIN ("symbols");

-- CreateIndex
CREATE INDEX "news_widget_instances_articleId_idx" ON "news_widget_instances"("articleId");

-- CreateIndex
CREATE INDEX "news_widget_instances_widgetId_idx" ON "news_widget_instances"("widgetId");

-- CreateIndex
CREATE INDEX "news_widget_instances_symbols_idx" ON "news_widget_instances" USING GIN ("symbols");

-- AddForeignKey
ALTER TABLE "market_instruments" ADD CONSTRAINT "market_instruments_sourceKey_fkey" FOREIGN KEY ("sourceKey") REFERENCES "market_data_sources"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_quotes" ADD CONSTRAINT "market_quotes_instrumentId_fkey" FOREIGN KEY ("instrumentId") REFERENCES "market_instruments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_widget_instances" ADD CONSTRAINT "news_widget_instances_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "news_articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_widget_instances" ADD CONSTRAINT "news_widget_instances_widgetId_fkey" FOREIGN KEY ("widgetId") REFERENCES "market_widgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

