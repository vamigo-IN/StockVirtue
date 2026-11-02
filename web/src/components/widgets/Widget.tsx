'use client';

import { Component, type ReactNode } from 'react';
import {
  CandleChartWidget,
  MiniChartWidget,
  StockCompareWidget,
} from './charts';
import {
  EducationalWidget,
  KeyTakeawaysWidget,
  PromoBannerWidget,
  RelatedNewsWidget,
  RiskDisclaimerWidget,
} from './content';
import { WidgetCard, WidgetMessage } from './frame';
import {
  HeatmapWidget,
  IpoWidget,
  MostActiveWidget,
  SectorsWidget,
  TopGainersWidget,
  TopLosersWidget,
} from './lists';
import type { WidgetBlock } from './meta';
import {
  CommoditiesWidget,
  CurrencyRatesWidget,
  IndexQuoteWidget,
  MarketTickerWidget,
  RelatedStocksWidget,
  StockQuoteWidget,
} from './quotes';

/** One widget block, drawn by type. Unknown or newer types degrade quietly. */
export function Widget({
  block,
}: {
  block: Pick<WidgetBlock, 'widget' | 'config' | 'data'>;
}) {
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
