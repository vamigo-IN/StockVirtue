'use client';

import dynamic from 'next/dynamic';
import { Component, type ReactNode } from 'react';
import type { NewsCard } from '@/news/types';
import { WidgetView } from './data';
import { WidgetCard, WidgetMessage, WidgetSkeleton } from './frame';
import type { WidgetBlock, WidgetConfig } from './meta';

/**
 * The widget code is split into its four groups (prices, charts, market
 * lists, story text), each loaded with next/dynamic and still rendered on
 * the server (plan M0.6). A story ships only the groups its widgets use: a
 * story with takeaways and a disclaimer never loads the chart or list code,
 * and lightweight-charts itself is a further import() inside the charts.
 * Each loader names its module inline, so Next can preload the chunks the
 * server render used.
 *
 * `loading` shows only after a client-side navigation, while a group's
 * chunk arrives: a card skeleton for the market groups, nothing for text.
 */
type Props = { config: WidgetConfig };
const Card = () => (
  <WidgetCard>
    <WidgetSkeleton />
  </WidgetCard>
);
const Blank = () => null;

// Prices (quotes.tsx)
const StockQuoteWidget = dynamic<Props>(
  () => import('./quotes').then((m) => m.StockQuoteWidget),
  { loading: Card },
);
const IndexQuoteWidget = dynamic<Props>(
  () => import('./quotes').then((m) => m.IndexQuoteWidget),
  { loading: Card },
);
const RelatedStocksWidget = dynamic<Props>(
  () => import('./quotes').then((m) => m.RelatedStocksWidget),
  { loading: Card },
);
const CommoditiesWidget = dynamic<Props>(
  () => import('./quotes').then((m) => m.CommoditiesWidget),
  { loading: Card },
);
const CurrencyRatesWidget = dynamic<Props>(
  () => import('./quotes').then((m) => m.CurrencyRatesWidget),
  { loading: Card },
);
const MarketTickerWidget = dynamic<Props>(
  () => import('./quotes').then((m) => m.MarketTickerWidget),
  { loading: Card },
);
const StockListWidget = dynamic<Props>(
  () => import('./quotes').then((m) => m.StockListWidget),
  { loading: Card },
);
const IndexTableWidget = dynamic<Props>(
  () => import('./quotes').then((m) => m.IndexTableWidget),
  { loading: Card },
);

// Charts (charts.tsx)
const MiniChartWidget = dynamic<Props>(
  () => import('./charts').then((m) => m.MiniChartWidget),
  { loading: Card },
);
const CandleChartWidget = dynamic<Props>(
  () => import('./charts').then((m) => m.CandleChartWidget),
  { loading: Card },
);
const StockCompareWidget = dynamic<Props>(
  () => import('./charts').then((m) => m.StockCompareWidget),
  { loading: Card },
);

// Market lists (lists.tsx)
const TopGainersWidget = dynamic<Props>(
  () => import('./lists').then((m) => m.TopGainersWidget),
  { loading: Card },
);
const TopLosersWidget = dynamic<Props>(
  () => import('./lists').then((m) => m.TopLosersWidget),
  { loading: Card },
);
const MostActiveWidget = dynamic<Props>(
  () => import('./lists').then((m) => m.MostActiveWidget),
  { loading: Card },
);
const SectorsWidget = dynamic<Props>(
  () => import('./lists').then((m) => m.SectorsWidget),
  { loading: Card },
);
const HeatmapWidget = dynamic<Props>(
  () => import('./lists').then((m) => m.HeatmapWidget),
  { loading: Card },
);
const IpoWidget = dynamic<Props>(
  () => import('./lists').then((m) => m.IpoWidget),
  { loading: Card },
);

// Story text (content.tsx)
const KeyTakeawaysWidget = dynamic<Props>(
  () => import('./content').then((m) => m.KeyTakeawaysWidget),
  { loading: Blank },
);
const EducationalWidget = dynamic<Props>(
  () => import('./content').then((m) => m.EducationalWidget),
  { loading: Blank },
);
const PromoBannerWidget = dynamic<Props>(
  () => import('./content').then((m) => m.PromoBannerWidget),
  { loading: Blank },
);
const RiskDisclaimerWidget = dynamic<Props & { text?: string }>(
  () => import('./content').then((m) => m.RiskDisclaimerWidget),
  { loading: Blank },
);
const RelatedNewsWidget = dynamic<Props & { cards?: NewsCard[] }>(
  () => import('./content').then((m) => m.RelatedNewsWidget),
  { loading: Blank },
);

/** The widgets that poll market data: each sits in a WidgetView, so it polls
 *  only while near the screen (spec §7.12 layer 1). Text widgets don't. */
const MARKET_WIDGETS = new Set<string>([
  'stock_quote',
  'index_quote',
  'mini_chart',
  'candle_chart',
  'stock_compare',
  'top_gainers',
  'top_losers',
  'most_active',
  'sector_performance',
  'heatmap',
  'commodities',
  'currency_rates',
  'ipo',
  'market_ticker',
  'related_stocks',
  'stock_list',
  'index_table',
]);

/** One widget block, drawn by type. Unknown or newer types degrade quietly. */
export function Widget({
  block,
}: {
  block: Pick<WidgetBlock, 'widget' | 'config' | 'data'>;
}) {
  const body = widgetBody(block);
  return body && MARKET_WIDGETS.has(block.widget) ? <WidgetView>{body}</WidgetView> : body;
}

function widgetBody(block: Pick<WidgetBlock, 'widget' | 'config' | 'data'>) {
  const { config, data } = block;
  switch (block.widget) {
    case 'stock_quote':
      return <StockQuoteWidget config={config} />;
    case 'index_quote':
      return <IndexQuoteWidget config={config} />;
    case 'mini_chart':
      return <MiniChartWidget config={config} />;
    case 'candle_chart':
      return <CandleChartWidget config={config} />;
    case 'stock_compare':
      return <StockCompareWidget config={config} />;
    case 'top_gainers':
      return <TopGainersWidget config={config} />;
    case 'top_losers':
      return <TopLosersWidget config={config} />;
    case 'most_active':
      return <MostActiveWidget config={config} />;
    case 'sector_performance':
      return <SectorsWidget config={config} />;
    case 'heatmap':
      return <HeatmapWidget config={config} />;
    case 'commodities':
      return <CommoditiesWidget config={config} />;
    case 'currency_rates':
      return <CurrencyRatesWidget config={config} />;
    case 'ipo':
      return <IpoWidget config={config} />;
    case 'market_ticker':
      return <MarketTickerWidget config={config} />;
    case 'key_takeaways':
      return <KeyTakeawaysWidget config={config} />;
    case 'related_stocks':
      return <RelatedStocksWidget config={config} />;
    case 'related_news':
      return <RelatedNewsWidget config={config} cards={data?.cards} />;
    case 'educational':
      return <EducationalWidget config={config} />;
    case 'risk_disclaimer':
      return <RiskDisclaimerWidget config={config} text={data?.text} />;
    case 'promo_banner':
      return <PromoBannerWidget config={config} />;
    case 'stock_list':
      return <StockListWidget config={config} />;
    case 'index_table':
      return <IndexTableWidget config={config} />;
    default:
      return null;
  }
}

/** A widget that throws shows a note instead of taking the story down. */
export class WidgetBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <WidgetCard>
          <WidgetMessage kind="error">
            This part of the story couldn’t be shown.
          </WidgetMessage>
        </WidgetCard>
      );
    }
    return this.props.children;
  }
}
