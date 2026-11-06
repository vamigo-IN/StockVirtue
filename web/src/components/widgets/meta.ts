import {
  Activity,
  Building2,
  ChartCandlestick,
  ChartColumn,
  ChartSpline,
  Coins,
  GalleryHorizontal,
  GitCompareArrows,
  GraduationCap,
  IndianRupee,
  Landmark,
  LayoutGrid,
  ListChecks,
  type LucideIcon,
  Megaphone,
  Newspaper,
  Rocket,
  Rows3,
  ShieldAlert,
  TableProperties,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { NewsCard } from '@/news/types';

/**
 * The 22 article widgets, as the editor, the library and the readers'
 * pages know them. The API validates every config (widget-registry.ts in the
 * backend); these are labels, defaults and grouping for people.
 */
export const WIDGET_TYPES = [
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
  'key_takeaways',
  'related_stocks',
  'related_news',
  'educational',
  'risk_disclaimer',
  'promo_banner',
  'stock_list',
  'index_table',
] as const;
export type WidgetType = (typeof WIDGET_TYPES)[number];

/** Rows in a stock list or an index table (the API checks the same). */
export const TABLE_ROWS = { min: 2, max: 15 } as const;

/**
 * The index table's one-click preset, in this order: the indices a market
 * wrap usually leads with. The form keeps only those on the market list.
 */
export const MAJOR_INDICES: readonly string[] = [
  'NSE:NIFTY',
  'BSE:SENSEX',
  'NSE:BANKNIFTY',
  'NSE:NIFTY IT',
  'NSE:NIFTYNXT50',
  'NSE:INDIA VIX',
];
export type WidgetConfig = Record<string, unknown>;

export interface WidgetBlock {
  type: 'widget';
  widget: WidgetType;
  v: number;
  config: WidgetConfig;
  widgetId?: string;
  data?: { text?: string; cards?: NewsCard[] };
}

export type WidgetGroup = 'Prices' | 'Charts' | 'Market lists' | 'Story';

export const WIDGET_META: Record<
  WidgetType,
  {
    label: string;
    group: WidgetGroup;
    description: string;
    icon: LucideIcon;
    defaults: WidgetConfig;
  }
> = {
  stock_quote: {
    label: 'Stock quote',
    group: 'Prices',
    description: 'One company’s price, change and day range.',
    icon: Building2,
    defaults: { symbol: '', refresh: 15 },
  },
  index_quote: {
    label: 'Index quote',
    group: 'Prices',
    description: 'An index such as the Nifty 50 or Sensex.',
    icon: Landmark,
    defaults: { symbol: 'NSE:NIFTY', refresh: 15 },
  },
  related_stocks: {
    label: 'Related stocks',
    group: 'Prices',
    description: 'Prices for the companies in this story.',
    icon: ListChecks,
    defaults: { symbols: [], refresh: 15 },
  },
  stock_list: {
    label: 'Stock list',
    group: 'Prices',
    description: 'A table of the stocks you pick, in your order.',
    icon: Rows3,
    defaults: { symbols: [], dayRange: true, refresh: 15 },
  },
  index_table: {
    label: 'Index table',
    group: 'Prices',
    description: 'Several indices in one table, such as the majors.',
    icon: TableProperties,
    defaults: { symbols: [], dayRange: true, refresh: 15 },
  },
  commodities: {
    label: 'Commodities',
    group: 'Prices',
    description: 'Gold, silver, crude and other MCX futures.',
    icon: Coins,
    defaults: { symbols: [], refresh: 30 },
  },
  currency_rates: {
    label: 'Currency rates',
    group: 'Prices',
    description: 'Rupee rates from NSE currency futures.',
    icon: IndianRupee,
    defaults: { symbols: [], refresh: 30 },
  },
  market_ticker: {
    label: 'Market ticker',
    group: 'Prices',
    description: 'A scrolling strip of prices.',
    icon: GalleryHorizontal,
    defaults: { symbols: [], refresh: 15 },
  },
  mini_chart: {
    label: 'Mini chart',
    group: 'Charts',
    description: 'A small price line with today’s move.',
    icon: ChartSpline,
    // Fix g (spec §7.9): an index has daily candles only, so 1D drew a single
    // candle; 1M (about three months of an index) always draws.
    defaults: { symbol: 'NSE:NIFTY', range: '1M', refresh: 60 },
  },
  candle_chart: {
    label: 'Candlestick chart',
    group: 'Charts',
    description: 'Open, high, low and close, with range tabs.',
    icon: ChartCandlestick,
    defaults: { symbol: 'NSE:NIFTY', range: '1M', refresh: 60 },
  },
  stock_compare: {
    label: 'Stock comparison',
    group: 'Charts',
    description: 'Two to four instruments, rebased to the same start.',
    icon: GitCompareArrows,
    defaults: { symbols: ['NSE:NIFTY', 'BSE:SENSEX'], range: '6M' },
  },
  top_gainers: {
    label: 'Top gainers',
    group: 'Market lists',
    description: 'Today’s biggest risers by market-cap band.',
    icon: TrendingUp,
    defaults: { segment: 'largecap', limit: 5, refresh: 30 },
  },
  top_losers: {
    label: 'Top losers',
    group: 'Market lists',
    description: 'Today’s biggest fallers by market-cap band.',
    icon: TrendingDown,
    defaults: { segment: 'largecap', limit: 5, refresh: 30 },
  },
  most_active: {
    label: 'Most active',
    group: 'Market lists',
    description: 'The most traded stocks today.',
    icon: Activity,
    defaults: { limit: 5, refresh: 30 },
  },
  sector_performance: {
    label: 'Sector performance',
    group: 'Market lists',
    description: 'How the sector indices are moving.',
    icon: ChartColumn,
    defaults: { limit: 8, refresh: 30 },
  },
  heatmap: {
    label: 'Market heatmap',
    group: 'Market lists',
    description: 'An index’s members, coloured by today’s move.',
    icon: LayoutGrid,
    defaults: { index: 'NIFTY', refresh: 60 },
  },
  ipo: {
    label: 'IPO information',
    group: 'Market lists',
    description: 'Open, upcoming or recently listed IPOs, or one issue.',
    icon: Rocket,
    defaults: { view: 'open', limit: 5 },
  },
  key_takeaways: {
    label: 'Key takeaways',
    group: 'Story',
    description: 'The story’s main points as a short list.',
    icon: ListChecks,
    defaults: { title: 'Key takeaways', items: [''] },
  },
  related_news: {
    label: 'Related news',
    group: 'Story',
    description: 'More stories from this section, or ones you pick.',
    icon: Newspaper,
    defaults: { mode: 'category', limit: 3, title: 'Related news' },
  },
  educational: {
    label: 'Explainer',
    group: 'Story',
    description: 'A term explained in plain words.',
    icon: GraduationCap,
    defaults: { term: '', body: '' },
  },
  risk_disclaimer: {
    label: 'Risk disclaimer',
    group: 'Story',
    description: 'Standard risk wording for the story’s topic.',
    icon: ShieldAlert,
    defaults: { variant: 'general' },
  },
  promo_banner: {
    label: 'Promotional banner',
    group: 'Story',
    description: 'A headline and a button, e.g. for the app.',
    icon: Megaphone,
    defaults: {
      headline: '',
      body: '',
      ctaLabel: 'Learn more',
      ctaUrl: '/download',
      theme: 'dark',
    },
  },
};

export const WIDGET_GROUPS: WidgetGroup[] = [
  'Prices',
  'Charts',
  'Market lists',
  'Story',
];

/** Shown in editor previews; readers get the wording from the API. */
export const DISCLAIMERS: Record<string, string> = {
  general:
    'This article is for information and education only and is not investment advice. Markets carry risk; do your own research or speak to a SEBI-registered adviser before you invest.',
  derivatives:
    'Futures and options are leveraged and high risk: most individual traders in equity F&O lose money, and losses can exceed the money you put in. This is not a recommendation to trade.',
  ipo: 'IPO subscriptions, allotments and listing gains are never guaranteed. Read the offer document (RHP) before you apply. This is not a recommendation to subscribe.',
  commodities:
    'Commodity prices are volatile and commodity futures are leveraged. This article is for information only and is not a recommendation to trade.',
};

export const REFRESH_CHOICES = [
  { value: 0, label: 'Don’t refresh' },
  { value: 5, label: 'Every 5 seconds' },
  { value: 15, label: 'Every 15 seconds' },
  { value: 30, label: 'Every 30 seconds' },
  { value: 60, label: 'Every minute' },
  { value: 300, label: 'Every 5 minutes' },
];
