'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ChoiceSelect } from '@/components/editor/widget-form/pickers';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { api, errorMessage } from '@/portal/api';
import { qk } from '@/portal/queries';
import type { InstrumentKind, MarketInstrument } from '@/portal/types';

interface Suggestion {
  exchange: 'NSE' | 'BSE' | 'MCX' | 'CDS';
  symbol: string;
  name: string;
}

export const KIND_CHOICES: { value: InstrumentKind; label: string }[] = [
  { value: 'INDEX', label: 'Index' },
  { value: 'STOCK', label: 'Stock' },
  { value: 'COMMODITY', label: 'Commodity (MCX)' },
  { value: 'CURRENCY', label: 'Currency pair' },
];

const UNIT_HINT: Record<InstrumentKind, string> = {
  INDEX: 'Usually blank.',
  STOCK: 'Usually blank.',
  COMMODITY: 'Shown next to the price, e.g. “per 10 g” or “per barrel”.',
  CURRENCY: 'Shown next to the rate, e.g. “₹ per $”.',
};

/** Add an index, stock, commodity or currency pair to the market list. */
export function AddInstrumentDialog({
  open,
  onOpenChange,
  existing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  existing: MarketInstrument[];
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<InstrumentKind>('INDEX');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [pick, setPick] = useState<Suggestion | null>(null);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [inTicker, setInTicker] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setKind('INDEX');
    setText('');
    setQ('');
    setPick(null);
    setName('');
    setUnit('');
    setInTicker(true);
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);

  const suggest = useQuery({
    queryKey: ['market-suggest', kind, q],
    queryFn: () =>
      api<Suggestion[]>(
        `staff/market/instruments/suggest?kind=${kind}&q=${encodeURIComponent(q)}`,
      ),
    enabled: open,
    staleTime: 60_000,
  });
  const have = new Set(existing.map((i) => `${i.exchange}:${i.symbol}`));

  async function add() {
    if (!pick || !name.trim()) return;
    setBusy(true);
    try {
      await api<MarketInstrument>('staff/market/instruments', {
        method: 'POST',
        body: {
          kind,
          exchange: pick.exchange,
          symbol: pick.symbol,
          name: name.trim(),
          ...(unit.trim() ? { unit: unit.trim() } : {}),
          inTicker,
        },
      });
      await qc.invalidateQueries({ queryKey: qk.marketInstruments });
      toast.success(`${name.trim()} is on the market list.`);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to the market list</DialogTitle>
          <DialogDescription>
            Instruments on the list can appear in the ticker and in story
            widgets. Up to 60 can be active at once.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <ChoiceSelect
            id="add-kind"
            label="Kind"
            value={kind}
            onChange={(k) => {
              setKind(k);
              setPick(null);
              setText('');
            }}
            choices={KIND_CHOICES}
          />
          <div className="space-y-1.5">
            <Label htmlFor="add-search">Find it</Label>
            <Input
              id="add-search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                kind === 'STOCK'
                  ? 'Company name or symbol, e.g. Infosys'
                  : kind === 'INDEX'
                    ? 'Index name, e.g. Nifty Bank'
                    : 'Filter the list'
              }
              autoComplete="off"
            />
            <div className="max-h-56 overflow-y-auto rounded-md border">
              {suggest.isPending ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  Searching…
                </p>
              ) : suggest.error ? (
                <p className="px-3 py-2 text-sm text-destructive">
                  {errorMessage(suggest.error)}
                </p>
              ) : !suggest.data.length ? (
                <p className="px-3 py-2 text-sm text-muted-foreground">
                  Nothing listed matches.
                </p>
              ) : (
                <ul>
                  {suggest.data.map((s) => {
                    const ref = `${s.exchange}:${s.symbol}`;
                    const taken = have.has(ref);
                    const chosen =
                      pick?.exchange === s.exchange && pick.symbol === s.symbol;
                    return (
                      <li key={ref}>
                        <button
                          type="button"
                          disabled={taken}
                          onClick={() => {
                            setPick(s);
                            setName(s.name);
                          }}
                          className={cn(
                            'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
                            chosen && 'bg-primary/10',
                          )}
                        >
                          <span className="font-mono text-xs">{ref}</span>
                          <span className="min-w-0 flex-1 truncate text-muted-foreground">
                            {s.name}
                          </span>
                          {taken ? (
                            <span className="text-xs">On the list</span>
                          ) : (
                            chosen && <Check className="size-4 text-primary" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          {pick && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="add-name">Name readers see</Label>
                <Input
                  id="add-name"
                  value={name}
                  maxLength={60}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="add-unit">Unit (optional)</Label>
                <Input
                  id="add-unit"
                  value={unit}
                  maxLength={30}
                  onChange={(e) => setUnit(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {UNIT_HINT[kind]}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={inTicker}
                  onCheckedChange={(v) => setInTicker(v === true)}
                />
                Show in the ticker
              </label>
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={add} disabled={!pick || !name.trim() || busy}>
            {busy ? 'Adding…' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Rename an instrument or change its unit. */
export function EditInstrumentDialog({
  instrument,
  onOpenChange,
}: {
  instrument: MarketInstrument | null;
  onOpenChange: (o: boolean) => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!instrument) return;
    setName(instrument.name);
    setUnit(instrument.unit ?? '');
  }, [instrument]);

  async function save() {
    if (!instrument || !name.trim()) return;
    setBusy(true);
    try {
      const row = await api<MarketInstrument>(
        `staff/market/instruments/${instrument.id}`,
        { method: 'PATCH', body: { name: name.trim(), unit: unit.trim() } },
      );
      qc.setQueryData<MarketInstrument[]>(qk.marketInstruments, (old) =>
        old?.map((r) => (r.id === row.id ? { ...r, ...row } : r)),
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!instrument} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit {instrument?.name}</DialogTitle>
          <DialogDescription className="font-mono">
            {instrument && `${instrument.exchange}:${instrument.symbol}`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="edit-name">Name readers see</Label>
            <Input
              id="edit-name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-unit">Unit (optional)</Label>
            <Input
              id="edit-unit"
              value={unit}
              maxLength={30}
              onChange={(e) => setUnit(e.target.value)}
            />
            {instrument && (
              <p className="text-xs text-muted-foreground">
                {UNIT_HINT[instrument.kind]}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
