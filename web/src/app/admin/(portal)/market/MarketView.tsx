'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChoiceSelect } from '@/components/editor/widget-form/pickers';
import {
  ConfirmDialog,
  PageHeader,
  QueryError,
  RowsSkeleton,
} from '@/components/portal/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMarket, WidgetDataProvider } from '@/components/widgets/data';
import { LabelPill } from '@/components/widgets/frame';
import { fmtPrice, fmtStamp, stampOf } from '@/components/widgets/format';
import { TickerTrack } from '@/components/widgets/ticker';
import type { MarketQuote, Snapshot, TickerConfig } from '@/market/types';
import { api, ApiError, errorMessage } from '@/portal/api';
import { formatDateTime, timeAgo } from '@/portal/format';
import {
  qk,
  useMarketInstruments,
  useMarketSource,
  useTickerSettings,
} from '@/portal/queries';
import type {
  MarketInstrument,
  MarketRight,
  MarketSource,
  TickerSettings,
} from '@/portal/types';
import {
  AddInstrumentDialog,
  EditInstrumentDialog,
  KIND_CHOICES,
} from './InstrumentDialogs';

const MAX_ACTIVE = 60;

const RIGHTS: { value: MarketRight; label: string }[] = [
  { value: 'LIVE', label: 'Live' },
  { value: 'DELAYED', label: 'Delayed' },
  { value: 'EOD', label: 'End of day' },
  { value: 'OFF', label: 'Off (no prices)' },
];

const RIGHT_HINT: Record<MarketRight, string> = {
  LIVE: 'Prices as they arrive, labelled LIVE. A price that hasn’t moved in 5 minutes is labelled DELAYED.',
  DELAYED: 'Prices from the set number of minutes ago, labelled DELAYED.',
  EOD: 'The previous session’s close while markets are open, labelled EOD.',
  OFF: 'No prices at all; widgets say market data isn’t available.',
};

const KIND_LABEL = Object.fromEntries(
  KIND_CHOICES.map((k) => [k.value, k.label]),
);

export function MarketView() {
  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title="Market data"
        description="What the website quotes, the ticker under the news masthead, and the data licence that decides whether prices show live, delayed or end-of-day. Every price on the site carries its label and time."
      />
      <WidgetDataProvider mode="preview">
        <MarketStatus />
        <SourceCard />
        <InstrumentsCard />
        <TickerCard />
      </WidgetDataProvider>
    </div>
  );
}

/** Which markets are open and how fresh the feed is, as the site sees it. */
function MarketStatus() {
  const snap = useMarket<Snapshot>('snapshot', 30);
  if (!snap.data) return null;
  const s = snap.data;
  const priced = s.instruments.length;
  const sessions = [
    { label: 'NSE & BSE', open: s.sessions.equity },
    { label: 'MCX', open: s.sessions.commodity },
    { label: 'Currency', open: s.sessions.currency },
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm">
      {sessions.map((x) => (
        <span key={x.label} className="flex items-center gap-1.5">
          <span
            className={`size-2 rounded-full ${x.open ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`}
            aria-hidden="true"
          />
          {x.label} {x.open ? 'open' : 'closed'}
        </span>
      ))}
      <span className="text-muted-foreground">
        {priced} {priced === 1 ? 'instrument' : 'instruments'} priced · as of{' '}
        {fmtStamp(s.generatedAt)}
      </span>
    </div>
  );
}

// ── Data licence ─────────────────────────────────────────────────────────

type SourceForm = Pick<
  MarketSource,
  'webRight' | 'appRight' | 'delayMinutes' | 'attribution'
>;
const sourceForm = (s: MarketSource): SourceForm => ({
  webRight: s.webRight,
  appRight: s.appRight,
  delayMinutes: s.delayMinutes,
  attribution: s.attribution,
});

function SourceCard() {
  const qc = useQueryClient();
  const query = useMarketSource();
  const [form, setForm] = useState<SourceForm | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (query.data && !form) setForm(sourceForm(query.data));
  }, [query.data, form]);

  if (query.error)
    return (
      <QueryError error={query.error} onRetry={() => void query.refetch()} />
    );
  if (!form || !query.data) return <RowsSkeleton rows={3} />;

  const dirty = JSON.stringify(form) !== JSON.stringify(sourceForm(query.data));
  const delayOk =
    Number.isInteger(form.delayMinutes) &&
    form.delayMinutes >= 1 &&
    form.delayMinutes <= 60;
  const usesDelay = form.webRight === 'DELAYED' || form.appRight === 'DELAYED';

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      const res = await api<MarketSource>('staff/market/source', {
        method: 'PUT',
        body: { ...form, attribution: form.attribution.trim() },
      });
      qc.setQueryData(qk.marketSource, res);
      setForm(sourceForm(res));
      toast.success('Saved. Widgets and the ticker now follow this licence.');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data licence</CardTitle>
        <CardDescription>
          Set these to what your agreement with {query.data.name} allows. Top
          movers, sector performance, heatmaps and intraday charts need Live;
          with other settings those widgets say the data isn’t licensed for
          display. Last changed{' '}
          <span title={formatDateTime(query.data.updatedAt)}>
            {timeAgo(query.data.updatedAt)}
          </span>
          .
        </CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset disabled={busy} className="grid gap-5 md:grid-cols-2">
          <div className="space-y-1.5">
            <ChoiceSelect
              id="right-web"
              label="Website"
              value={form.webRight}
              onChange={(v) => setForm({ ...form, webRight: v })}
              choices={RIGHTS}
            />
            <p className="text-xs text-muted-foreground">
              {RIGHT_HINT[form.webRight]}
            </p>
          </div>
          <div className="space-y-1.5">
            <ChoiceSelect
              id="right-app"
              label="App (news stories)"
              value={form.appRight}
              onChange={(v) => setForm({ ...form, appRight: v })}
              choices={RIGHTS}
            />
            <p className="text-xs text-muted-foreground">
              {RIGHT_HINT[form.appRight]} Requests from anywhere other than the
              website get the stricter of the two.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="delay">Delay (minutes)</Label>
            <Input
              id="delay"
              type="number"
              min={1}
              max={60}
              value={Number.isNaN(form.delayMinutes) ? '' : form.delayMinutes}
              onChange={(e) =>
                setForm({ ...form, delayMinutes: e.target.valueAsNumber })
              }
              aria-invalid={!delayOk}
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              {usesDelay
                ? 'Used by the Delayed setting above.'
                : 'Only used when a channel is set to Delayed.'}{' '}
              1 to 60.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="attribution">Attribution</Label>
            <Input
              id="attribution"
              value={form.attribution}
              maxLength={200}
              onChange={(e) =>
                setForm({ ...form, attribution: e.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              Shown with every widget and in the news footer, as your data
              agreement requires.
            </p>
          </div>
          <div className="flex justify-end gap-2 md:col-span-2">
            <Button
              variant="outline"
              disabled={!dirty}
              onClick={() => setForm(sourceForm(query.data))}
            >
              Discard
            </Button>
            <Button onClick={save} disabled={!dirty || !delayOk || busy}>
              {busy ? 'Saving…' : 'Save licence'}
            </Button>
          </div>
        </fieldset>
      </CardContent>
    </Card>
  );
}

// ── Instruments ──────────────────────────────────────────────────────────

function InstrumentsCard() {
  const qc = useQueryClient();
  const list = useMarketInstruments();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MarketInstrument | null>(null);
  const [removing, setRemoving] = useState<MarketInstrument | null>(null);
  const [moving, setMoving] = useState(false);
  const snap = useMarket<Snapshot>('snapshot', 30);

  if (list.error)
    return (
      <QueryError error={list.error} onRetry={() => void list.refetch()} />
    );
  if (!list.data) return <RowsSkeleton rows={6} />;
  const rows = list.data;
  const active = rows.filter((r) => r.isEnabled).length;

  async function patch(
    i: MarketInstrument,
    body: Partial<Pick<MarketInstrument, 'isEnabled' | 'inTicker'>>,
  ) {
    try {
      const row = await api<MarketInstrument>(
        `staff/market/instruments/${i.id}`,
        { method: 'PATCH', body },
      );
      qc.setQueryData<MarketInstrument[]>(qk.marketInstruments, (old) =>
        old?.map((r) => (r.id === row.id ? { ...r, ...row } : r)),
      );
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function move(index: number, by: -1 | 1) {
    const next = [...rows];
    const [it] = next.splice(index, 1);
    next.splice(index + by, 0, it);
    qc.setQueryData(qk.marketInstruments, next);
    setMoving(true);
    try {
      const res = await api<MarketInstrument[]>(
        'staff/market/instruments/order',
        {
          method: 'PUT',
          body: { ids: next.map((r) => r.id) },
        },
      );
      qc.setQueryData(qk.marketInstruments, res);
    } catch (err) {
      toast.error(errorMessage(err));
      void qc.invalidateQueries({ queryKey: qk.marketInstruments });
    } finally {
      setMoving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Instruments</CardTitle>
        <CardDescription>
          Indices, stocks, commodities and currency pairs the site quotes, in
          ticker order.{' '}
          <span
            className={
              active >= MAX_ACTIVE ? 'font-medium text-destructive' : undefined
            }
          >
            {active} of {MAX_ACTIVE} active.
          </span>{' '}
          Story widgets can also quote any listed stock without it being here.
        </CardDescription>
        <CardAction>
          <Button
            size="sm"
            onClick={() => setAdding(true)}
            disabled={active >= MAX_ACTIVE}
          >
            <Plus /> Add
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="px-0 sm:px-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Order</TableHead>
                <TableHead>Instrument</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-center">Active</TableHead>
                <TableHead className="text-center">In ticker</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow
                  key={r.id}
                  className={r.isEnabled ? undefined : 'text-muted-foreground'}
                >
                  <TableCell>
                    <div className="flex gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={i === 0 || moving}
                        onClick={() => void move(i, -1)}
                        aria-label={`Move ${r.name} up`}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        disabled={i === rows.length - 1 || moving}
                        onClick={() => void move(i, 1)}
                        aria-label={`Move ${r.name} down`}
                      >
                        <ArrowDown />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {r.exchange}:{r.symbol}
                      {r.unit && <span className="font-sans"> · {r.unit}</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {KIND_LABEL[r.kind] ?? r.kind}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <PriceCell
                      row={r}
                      live={snap.data?.instruments.find(
                        (q) => q.ref === `${r.exchange}:${r.symbol}`,
                      )}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={r.isEnabled}
                      onCheckedChange={(v) => void patch(r, { isEnabled: v })}
                      disabled={!r.isEnabled && active >= MAX_ACTIVE}
                      aria-label={`${r.name} active`}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={r.inTicker}
                      onCheckedChange={(v) => void patch(r, { inTicker: v })}
                      disabled={!r.isEnabled}
                      aria-label={`${r.name} in the ticker`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => setEditing(r)}
                        aria-label={`Edit ${r.name}`}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        onClick={() => setRemoving(r)}
                        aria-label={`Remove ${r.name}`}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Nothing on the list yet. Add the indices and commodities
                    your readers follow.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      <AddInstrumentDialog
        open={adding}
        onOpenChange={setAdding}
        existing={rows}
      />
      <EditInstrumentDialog
        instrument={editing}
        onOpenChange={(o) => !o && setEditing(null)}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.name ?? ''}?`}
        description={
          <p>
            It leaves the ticker and the market list. Instruments used by story
            widgets can’t be removed; switch those off instead.
          </p>
        }
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          await api(`staff/market/instruments/${removing.id}`, {
            method: 'DELETE',
          });
          qc.setQueryData<MarketInstrument[]>(qk.marketInstruments, (old) =>
            old?.filter((r) => r.id !== removing.id),
          );
          toast.success(`${removing.name} removed.`);
        }}
      />
    </Card>
  );
}

/** What the site shows now, with its label; else the last price stored. */
function PriceCell({
  row,
  live,
}: {
  row: MarketInstrument;
  live?: MarketQuote;
}) {
  const ltp = live?.ltp ?? row.quote?.ltp;
  const asOf = live?.asOf ?? row.quote?.asOf;
  if (ltp === undefined || !asOf) {
    return <span className="text-xs text-muted-foreground">None yet</span>;
  }
  return (
    <>
      <div className="font-mono tabular-nums">{fmtPrice(ltp, row.kind)}</div>
      <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        {live && <LabelPill label={live.label} />}
        <span title={formatDateTime(asOf)}>{fmtStamp(asOf)}</span>
      </div>
    </>
  );
}

// ── Ticker ───────────────────────────────────────────────────────────────

const PLACEMENTS = [
  { value: 'news' as const, label: 'News pages' },
  { value: 'news_and_site' as const, label: 'News pages and the home page' },
];
const SPEEDS = [
  { value: 'slow' as const, label: 'Slow' },
  { value: 'normal' as const, label: 'Normal' },
  { value: 'fast' as const, label: 'Fast' },
];
const DIRECTIONS = [
  { value: 'left' as const, label: 'Right to left' },
  { value: 'right' as const, label: 'Left to right' },
];
const THEMES = [
  { value: 'dark' as const, label: 'Dark' },
  { value: 'light' as const, label: 'Light' },
  { value: 'brand' as const, label: 'StockVirtue green' },
];
const NAME_STYLES = [
  { value: 'name' as const, label: 'Names (Nifty 50)' },
  { value: 'symbol' as const, label: 'Symbols (NIFTY)' },
];
const SHOW_HIDE = [
  { value: 'show' as const, label: 'Show' },
  { value: 'hide' as const, label: 'Hide' },
];

function TickerCard() {
  const qc = useQueryClient();
  const query = useTickerSettings();
  const snap = useMarket<Snapshot>('snapshot', 15);
  const [form, setForm] = useState<TickerConfig | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (query.data && !form) {
      setForm(query.data.config);
      setVersion(query.data.version);
    }
  }, [query.data, form]);

  if (query.error)
    return (
      <QueryError error={query.error} onRetry={() => void query.refetch()} />
    );
  if (!form || !query.data) return <RowsSkeleton rows={4} />;

  const dirty = JSON.stringify(form) !== JSON.stringify(query.data.config);
  const set = <K extends keyof TickerConfig>(key: K, value: TickerConfig[K]) =>
    setForm({ ...form, [key]: value });
  const items = snap.data?.instruments.filter((q) => q.inTicker) ?? [];
  const anyOpen =
    !!snap.data && Object.values(snap.data.sessions).some(Boolean);
  const { label, asOf: latest } = stampOf(items);

  async function save() {
    if (!form) return;
    setBusy(true);
    try {
      const res = await api<TickerSettings>('staff/market/ticker', {
        method: 'PUT',
        body: { version, ...form },
      });
      qc.setQueryData(qk.ticker, res);
      setForm(res.config);
      setVersion(res.version);
      toast.success('Saved. The website’s ticker updates within a minute.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(
          'Someone else changed the ticker meanwhile. Showing their version.',
        );
        const fresh = await query.refetch();
        if (fresh.data) {
          setForm(fresh.data.config);
          setVersion(fresh.data.version);
        }
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  const status = !form.enabled
    ? 'The ticker is off, so the website doesn’t show it.'
    : items.length === 0
      ? 'No active instrument is marked “In ticker”, so the website doesn’t show it.'
      : !anyOpen && form.marketClosed === 'hide'
        ? 'Markets are closed and “When markets are closed” is Hide, so the website hides it until the next session.'
        : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ticker</CardTitle>
        <CardDescription>
          The scrolling strip of prices under the news masthead
          {form.placement === 'news_and_site' ? ' and on the home page' : ''}.
          It pauses when a reader points at it and stays still for readers who
          turn off motion.
        </CardDescription>
        <CardAction>
          <label className="flex items-center gap-2 text-sm font-medium">
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => set('enabled', v)}
              disabled={busy}
            />
            {form.enabled ? 'On' : 'Off'}
          </label>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Preview with current prices
          </p>
          {items.length ? (
            <div className="overflow-hidden rounded-lg border">
              <TickerTrack
                items={items}
                look={form}
                stamp={
                  <>
                    {label && (
                      <LabelPill
                        label={label}
                        delay={
                          label === 'DELAYED'
                            ? snap.data?.delayMinutes
                            : undefined
                        }
                      />
                    )}
                    <span className="font-mono text-[11px] opacity-80">
                      {fmtStamp(latest)}
                    </span>
                  </>
                }
              />
            </div>
          ) : (
            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
              {snap.data ? 'No prices to show yet.' : 'Loading prices…'}
            </p>
          )}
          {status && (
            <p className="mt-2 flex items-start gap-2 text-sm">
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-warning"
                aria-hidden="true"
              />
              {status}
            </p>
          )}
        </div>
        <fieldset
          disabled={busy}
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          <ChoiceSelect
            id="t-placement"
            label="Where"
            value={form.placement}
            onChange={(v) => set('placement', v)}
            choices={PLACEMENTS}
          />
          <ChoiceSelect
            id="t-speed"
            label="Speed"
            value={form.speed}
            onChange={(v) => set('speed', v)}
            choices={SPEEDS}
          />
          <ChoiceSelect
            id="t-direction"
            label="Direction"
            value={form.direction}
            onChange={(v) => set('direction', v)}
            choices={DIRECTIONS}
          />
          <ChoiceSelect
            id="t-theme"
            label="Theme"
            value={form.theme}
            onChange={(v) => set('theme', v)}
            choices={THEMES}
          />
          <ChoiceSelect
            id="t-names"
            label="Show instruments as"
            value={form.nameStyle}
            onChange={(v) => set('nameStyle', v)}
            choices={NAME_STYLES}
          />
          <ChoiceSelect
            id="t-mobile"
            label="On phones"
            value={form.mobile}
            onChange={(v) => set('mobile', v)}
            choices={SHOW_HIDE}
          />
          <ChoiceSelect
            id="t-closed"
            label="When markets are closed"
            value={form.marketClosed}
            onChange={(v) => set('marketClosed', v)}
            choices={[
              { value: 'show', label: 'Show closing prices (EOD)' },
              { value: 'hide', label: 'Hide the ticker' },
            ]}
          />
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="text-sm font-medium">
              Show with each price
            </legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              {(
                [
                  ['change', 'Change in points'],
                  ['percent', 'Change in %'],
                  ['labels', 'DELAYED / EOD labels'],
                ] as const
              ).map(([key, text]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.show[key]}
                    onCheckedChange={(v) =>
                      set('show', { ...form.show, [key]: v === true })
                    }
                  />
                  {text}
                </label>
              ))}
            </div>
            {!form.show.labels && (
              <p className="text-xs text-muted-foreground">
                The strip still opens with its overall label and time.
              </p>
            )}
          </fieldset>
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            disabled={!dirty || busy}
            onClick={() => setForm(query.data.config)}
          >
            Discard
          </Button>
          <Button onClick={save} disabled={!dirty || busy}>
            {busy ? 'Saving…' : 'Save ticker'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
