'use client';

import { useQueries } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { RelatedDialog } from '@/components/editor/EditorDialogs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/portal/api';
import {
  DISCLAIMERS,
  type WidgetConfig,
  type WidgetType,
} from '@/components/widgets/meta';
import {
  ChoiceSelect,
  CuratedChecklist,
  CuratedSelect,
  InstrumentPick,
  RefChips,
  RefreshSelect,
  StockSearch,
} from './pickers';

const strs = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
const num = (v: unknown, fb: number) => (typeof v === 'number' ? v : fb);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({
    value: from + i,
    label: String(from + i),
  }));

/** Why a config can't be saved yet (null = ready). Mirrors the API's checks. */
export function widgetProblem(
  type: WidgetType,
  c: WidgetConfig,
): string | null {
  switch (type) {
    case 'stock_quote':
      return str(c.symbol) ? null : 'Choose a stock.';
    case 'index_quote':
      return str(c.symbol) ? null : 'Choose an index.';
    case 'mini_chart':
    case 'candle_chart':
      return str(c.symbol) ? null : 'Choose what to chart.';
    case 'stock_compare':
      return strs(c.symbols).length >= 2
        ? null
        : 'Choose at least two instruments.';
    case 'ipo':
      return c.view === 'issue' && !str(c.symbol).trim()
        ? 'Enter the IPO’s symbol.'
        : null;
    case 'key_takeaways':
      return strs(c.items).some((i) => i.trim())
        ? null
        : 'Add at least one takeaway.';
    case 'related_news':
      return c.mode === 'manual' && strs(c.articleIds).length === 0
        ? 'Pick at least one story.'
        : null;
    case 'educational':
      return str(c.term).trim() && str(c.body).trim()
        ? null
        : 'Add the term and its explanation.';
    case 'promo_banner':
      return str(c.headline).trim() &&
        str(c.ctaLabel).trim() &&
        str(c.ctaUrl).trim()
        ? null
        : 'Add a headline, a button label and its link.';
    default:
      return null;
  }
}

/** The settings form for one widget type. */
export function WidgetForm({
  type,
  config,
  onChange,
}: {
  type: WidgetType;
  config: WidgetConfig;
  onChange: (next: WidgetConfig) => void;
}) {
  const set = (patch: WidgetConfig) => onChange({ ...config, ...patch });
  const refresh = (
    <RefreshSelect
      id="w-refresh"
      value={num(config.refresh, 15)}
      onChange={(v) => set({ refresh: v })}
    />
  );

  switch (type) {
    case 'stock_quote':
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="w-stock">Stock</Label>
            <StockSearch id="w-stock" onPick={(ref) => set({ symbol: ref })} />
            {str(config.symbol) && (
              <RefChips
                refs={[str(config.symbol)]}
                onRemove={() => set({ symbol: '' })}
              />
            )}
          </div>
          {refresh}
        </div>
      );
    case 'index_quote':
      return (
        <div className="space-y-4">
          <CuratedSelect
            id="w-index"
            label="Index"
            kinds={['INDEX']}
            value={str(config.symbol)}
            onChange={(v) => set({ symbol: v })}
          />
          {refresh}
        </div>
      );
    case 'mini_chart':
    case 'candle_chart':
      return (
        <div className="space-y-4">
          <InstrumentPick
            id="w-chart"
            label="Chart"
            value={str(config.symbol)}
            onChange={(v) => set({ symbol: v })}
          />
          <ChoiceSelect
            id="w-range"
            label={type === 'candle_chart' ? 'Range shown first' : 'Range'}
            value={str(config.range) || (type === 'mini_chart' ? '1D' : '1M')}
            onChange={(v) => set({ range: v })}
            choices={(type === 'mini_chart'
              ? ['1D', '5D', '1M']
              : ['1D', '5D', '1M', '6M', '1Y']
            ).map((r) => ({ value: r, label: r }))}
          />
          {refresh}
        </div>
      );
    case 'stock_compare': {
      const refs = strs(config.symbols);
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Instruments (2 to 4)</Label>
            <RefChips
              refs={refs}
              onRemove={(r) => set({ symbols: refs.filter((x) => x !== r) })}
            />
            {refs.length < 4 && (
              <>
                <CuratedSelect
                  id="w-cmp-curated"
                  label="Add from the market list"
                  value=""
                  onChange={(v) =>
                    !refs.includes(v) && set({ symbols: [...refs, v] })
                  }
                />
                <StockSearch
                  exclude={refs}
                  placeholder="…or add a listed stock"
                  onPick={(ref) => set({ symbols: [...refs, ref] })}
                />
              </>
            )}
          </div>
          <ChoiceSelect
            id="w-cmp-range"
            label="Period"
            value={str(config.range) || '6M'}
            onChange={(v) => set({ range: v })}
            choices={['1M', '6M', '1Y'].map((r) => ({ value: r, label: r }))}
          />
        </div>
      );
    }
    case 'top_gainers':
    case 'top_losers':
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceSelect
            id="w-seg"
            label="Companies"
            value={str(config.segment) || 'largecap'}
            onChange={(v) => set({ segment: v })}
            choices={[
              { value: 'largecap', label: 'Large caps' },
              { value: 'midcap', label: 'Mid caps' },
              { value: 'smallcap', label: 'Small caps' },
            ]}
          />
          <ChoiceSelect
            id="w-limit"
            label="How many"
            value={num(config.limit, 5)}
            onChange={(v) => set({ limit: v })}
            choices={range(3, 10)}
          />
          {refresh}
        </div>
      );
    case 'most_active':
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceSelect
            id="w-limit"
            label="How many"
            value={num(config.limit, 5)}
            onChange={(v) => set({ limit: v })}
            choices={range(3, 10)}
          />
          {refresh}
        </div>
      );
    case 'sector_performance':
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceSelect
            id="w-limit"
            label="Sectors shown"
            value={num(config.limit, 8)}
            onChange={(v) => set({ limit: v })}
            choices={range(4, 14)}
          />
          {refresh}
        </div>
      );
    case 'heatmap':
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceSelect
            id="w-heat"
            label="Index"
            value={str(config.index) || 'NIFTY'}
            onChange={(v) => set({ index: v })}
            choices={[
              { value: 'NIFTY', label: 'Nifty 50' },
              { value: 'BANKNIFTY', label: 'Bank Nifty' },
              { value: 'SENSEX', label: 'Sensex' },
            ]}
          />
          {refresh}
        </div>
      );
    case 'commodities':
    case 'currency_rates':
      return (
        <div className="space-y-4">
          <CuratedChecklist
            label={type === 'commodities' ? 'Commodities' : 'Currency pairs'}
            hint="Leave all unticked to show everything on the market list."
            kinds={[type === 'commodities' ? 'COMMODITY' : 'CURRENCY']}
            value={strs(config.symbols)}
            onChange={(v) => set({ symbols: v })}
            max={type === 'commodities' ? 8 : 4}
          />
          {refresh}
        </div>
      );
    case 'market_ticker':
      return (
        <div className="space-y-4">
          <CuratedChecklist
            label="Instruments"
            hint="Leave all unticked to use the site ticker’s list."
            value={strs(config.symbols)}
            onChange={(v) => set({ symbols: v })}
            max={20}
          />
          {refresh}
        </div>
      );
    case 'related_stocks': {
      const refs = strs(config.symbols);
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="w-rel">Stocks</Label>
            <p className="text-xs text-muted-foreground">
              Leave empty to use the story’s related stocks.
            </p>
            <RefChips
              refs={refs}
              onRemove={(r) => set({ symbols: refs.filter((x) => x !== r) })}
            />
            {refs.length < 8 && (
              <StockSearch
                id="w-rel"
                exclude={refs}
                onPick={(ref) => set({ symbols: [...refs, ref] })}
              />
            )}
          </div>
          {refresh}
        </div>
      );
    }
    case 'ipo':
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <ChoiceSelect
            id="w-ipo-view"
            label="Show"
            value={str(config.view) || 'open'}
            onChange={(v) => set({ view: v })}
            choices={[
              { value: 'open', label: 'IPOs open now' },
              { value: 'upcoming', label: 'Upcoming IPOs' },
              { value: 'listed', label: 'Recently listed' },
              { value: 'issue', label: 'One IPO' },
            ]}
          />
          {config.view === 'issue' ? (
            <div className="space-y-1.5">
              <Label htmlFor="w-ipo-sym">IPO symbol</Label>
              <Input
                id="w-ipo-sym"
                value={str(config.symbol)}
                maxLength={30}
                onChange={(e) => set({ symbol: e.target.value.toUpperCase() })}
                placeholder="e.g. NEWCO"
              />
            </div>
          ) : (
            <ChoiceSelect
              id="w-limit"
              label="How many"
              value={num(config.limit, 5)}
              onChange={(v) => set({ limit: v })}
              choices={range(1, 10)}
            />
          )}
        </div>
      );
    case 'key_takeaways':
      return <TakeawaysForm config={config} set={set} />;
    case 'related_news':
      return <RelatedNewsForm config={config} set={set} />;
    case 'educational':
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="w-term">Term</Label>
            <Input
              id="w-term"
              value={str(config.term)}
              maxLength={80}
              onChange={(e) => set({ term: e.target.value })}
              placeholder="e.g. Grey-market premium"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-body">Explanation</Label>
            <Textarea
              id="w-body"
              value={str(config.body)}
              maxLength={1200}
              rows={5}
              onChange={(e) => set({ body: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {str(config.body).length}/1200 · a blank line starts a new
              paragraph.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-link">“Learn more” link (optional)</Label>
            <Input
              id="w-link"
              value={str(config.link)}
              maxLength={500}
              onChange={(e) => set({ link: e.target.value || undefined })}
              placeholder="/news/education or https://…"
            />
          </div>
        </div>
      );
    case 'risk_disclaimer':
      return (
        <div className="space-y-3">
          <ChoiceSelect
            id="w-disc"
            label="Topic"
            value={str(config.variant) || 'general'}
            onChange={(v) => set({ variant: v })}
            choices={[
              { value: 'general', label: 'General: not investment advice' },
              { value: 'derivatives', label: 'Futures & options' },
              { value: 'ipo', label: 'IPOs' },
              { value: 'commodities', label: 'Commodities' },
            ]}
          />
          <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            {DISCLAIMERS[str(config.variant) || 'general']}
          </p>
        </div>
      );
    case 'promo_banner':
      return (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="w-head">Headline</Label>
            <Input
              id="w-head"
              value={str(config.headline)}
              maxLength={80}
              onChange={(e) => set({ headline: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="w-pbody">Text (optional)</Label>
            <Textarea
              id="w-pbody"
              value={str(config.body)}
              maxLength={240}
              rows={2}
              onChange={(e) => set({ body: e.target.value })}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="w-cta">Button label</Label>
              <Input
                id="w-cta"
                value={str(config.ctaLabel)}
                maxLength={30}
                onChange={(e) => set({ ctaLabel: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="w-url">Button link</Label>
              <Input
                id="w-url"
                value={str(config.ctaUrl)}
                maxLength={500}
                onChange={(e) => set({ ctaUrl: e.target.value })}
                placeholder="/download or https://…"
              />
            </div>
          </div>
          <ChoiceSelect
            id="w-theme"
            label="Look"
            value={str(config.theme) || 'dark'}
            onChange={(v) => set({ theme: v })}
            choices={[
              { value: 'dark', label: 'Dark (StockVirtue terminal)' },
              { value: 'brand', label: 'Green' },
              { value: 'light', label: 'Light' },
            ]}
          />
        </div>
      );
    default:
      return null;
  }
}

function TakeawaysForm({
  config,
  set,
}: {
  config: WidgetConfig;
  set: (p: WidgetConfig) => void;
}) {
  const items = strs(config.items).length ? strs(config.items) : [''];
  const update = (next: string[]) => set({ items: next });
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="w-kt-title">Title</Label>
        <Input
          id="w-kt-title"
          value={str(config.title)}
          maxLength={80}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Key takeaways"
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Points (up to 8)</legend>
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <Input
              value={item}
              maxLength={240}
              aria-label={`Point ${i + 1}`}
              onChange={(e) =>
                update(items.map((x, j) => (j === i ? e.target.value : x)))
              }
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove point ${i + 1}`}
              disabled={items.length === 1}
              onClick={() => update(items.filter((_, j) => j !== i))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        {items.length < 8 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => update([...items, ''])}
          >
            <Plus /> Add a point
          </Button>
        )}
      </fieldset>
    </div>
  );
}

function RelatedNewsForm({
  config,
  set,
}: {
  config: WidgetConfig;
  set: (p: WidgetConfig) => void;
}) {
  const [pick, setPick] = useState(false);
  const ids = strs(config.articleIds);
  const titles = (config._titles ?? {}) as Record<string, string>;
  // Saved widgets keep only the ids: look up the titles of earlier picks.
  const missing = ids.filter((id) => !titles[id]);
  const looked = useQueries({
    queries: missing.map((id) => ({
      queryKey: ['article-title', id],
      queryFn: () => api<{ title: string }>(`staff/articles/${id}`),
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });
  const titleOf = (id: string) => {
    if (titles[id]) return titles[id];
    const q = looked[missing.indexOf(id)];
    return q?.data?.title ?? (q?.isError ? 'Story not available' : 'Loading…');
  };
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="w-rn-title">Title</Label>
        <Input
          id="w-rn-title"
          value={str(config.title)}
          maxLength={60}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Related news"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <ChoiceSelect
          id="w-rn-mode"
          label="Stories"
          value={str(config.mode) || 'category'}
          onChange={(v) => set({ mode: v })}
          choices={[
            { value: 'category', label: 'Latest from this story’s section' },
            { value: 'manual', label: 'Stories I pick' },
          ]}
        />
        <ChoiceSelect
          id="w-limit"
          label="How many"
          value={num(config.limit, 3)}
          onChange={(v) => set({ limit: v })}
          choices={range(2, 6)}
        />
      </div>
      {config.mode === 'manual' && (
        <div className="space-y-2">
          <ul className="space-y-1 text-sm">
            {ids.map((id) => (
              <li
                key={id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5"
              >
                <span className="truncate">{titleOf(id)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove"
                  onClick={() =>
                    set({ articleIds: ids.filter((x) => x !== id) })
                  }
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          {ids.length < 6 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPick(true)}
            >
              <Plus /> Pick a published story
            </Button>
          )}
          <RelatedDialog
            open={pick}
            onOpenChange={setPick}
            title="Pick a story"
            onPick={(a) =>
              !ids.includes(a.id) &&
              set({
                articleIds: [...ids, a.id],
                _titles: { ...titles, [a.id]: a.title },
              })
            }
          />
        </div>
      )}
    </div>
  );
}
