'use client';

import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { REFRESH_CHOICES } from '@/components/widgets/meta';
import { errorMessage } from '@/portal/api';
import { useMarketInstruments, useStockSearch } from '@/portal/queries';
import type { InstrumentKind, MarketInstrument } from '@/portal/types';

const refOf = (i: Pick<MarketInstrument, 'exchange' | 'symbol'>) =>
  `${i.exchange}:${i.symbol}`;
const KIND_LABEL: Record<InstrumentKind, string> = {
  INDEX: 'Indices',
  STOCK: 'Stocks',
  COMMODITY: 'Commodities',
  CURRENCY: 'Currencies',
};

/** Listed companies by name or symbol (NSE). */
export function StockSearch({
  onPick,
  exclude = [],
  placeholder = 'Search NSE companies, e.g. Infosys',
  id,
}: {
  onPick: (ref: string, name: string | null) => void;
  exclude?: string[];
  placeholder?: string;
  id?: string;
}) {
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 250);
    return () => clearTimeout(t);
  }, [text]);
  const search = useStockSearch(q);
  const results = (search.data?.results ?? [])
    .filter((r) => !exclude.includes(`${r.exchange}:${r.symbol}`))
    .slice(0, 6);
  return (
    <div className="relative">
      <Input
        id={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (results[0]) {
              onPick(
                `${results[0].exchange}:${results[0].symbol}`,
                results[0].name,
              );
              setText('');
            }
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
      />
      {focused && q && (
        <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md">
          {search.isPending ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              Searching…
            </p>
          ) : search.error ? (
            <p className="px-3 py-2 text-sm text-destructive">
              {errorMessage(search.error)}
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No listed company matches.
            </p>
          ) : (
            <ul>
              {results.map((r) => (
                <li key={`${r.exchange}:${r.symbol}`}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onPick(`${r.exchange}:${r.symbol}`, r.name);
                      setText('');
                    }}
                    className="flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                  >
                    <span className="font-mono font-medium">{r.symbol}</span>
                    <span className="truncate text-muted-foreground">
                      {r.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Chips for a list of refs, removable. */
export function RefChips({
  refs,
  onRemove,
  names,
}: {
  refs: string[];
  onRemove: (ref: string) => void;
  names?: Record<string, string>;
}) {
  if (!refs.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {refs.map((r) => (
        <Badge
          key={r}
          variant="outline"
          className="gap-1 pr-1"
          title={names?.[r]}
        >
          <span className="font-mono">{r.split(':')[1]}</span>
          <button
            type="button"
            onClick={() => onRemove(r)}
            className="rounded-sm p-0.5 hover:bg-foreground/10"
            aria-label={`Remove ${r}`}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}

/**
 * A list of picked refs in order (the stock list, the index table): each row
 * moves up or down, or comes out. The order is the table's order on the
 * story. A move keeps focus on the button pressed, so the arrows can be
 * pressed again and again from the keyboard.
 */
export function OrderedRefs({
  refs,
  names,
  label,
  onChange,
}: {
  refs: string[];
  /** Readers' names by ref, where known. */
  names?: Record<string, string>;
  /** What the list holds, for screen readers ("Stocks in the list"). */
  label: string;
  onChange: (refs: string[]) => void;
}) {
  if (!refs.length) return null;
  const move = (from: number, to: number) => {
    if (to < 0 || to >= refs.length) return;
    const next = [...refs];
    const [r] = next.splice(from, 1);
    next.splice(to, 0, r);
    onChange(next);
  };
  return (
    <ol aria-label={label} className="divide-y rounded-md border">
      {refs.map((r, i) => {
        const sym = r.slice(r.indexOf(':') + 1);
        const name = names?.[r] ?? sym;
        const first = i === 0;
        const last = i === refs.length - 1;
        return (
          <li key={r} className="flex items-center gap-2 py-1 pr-1 pl-3 text-sm">
            <span className="w-5 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{name}</span>
              <span className="block truncate font-mono text-xs text-muted-foreground">
                {r}
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${name} up`}
              aria-disabled={first}
              className="aria-disabled:opacity-40"
              onClick={() => move(i, i - 1)}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Move ${name} down`}
              aria-disabled={last}
              className="aria-disabled:opacity-40"
              onClick={() => move(i, i + 1)}
            >
              <ArrowDown />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${name}`}
              onClick={() => onChange(refs.filter((x) => x !== r))}
            >
              <X />
            </Button>
          </li>
        );
      })}
    </ol>
  );
}

/** One instrument from the curated market list (optionally of some kinds). */
export function CuratedSelect({
  value,
  onChange,
  kinds,
  exclude = [],
  label,
  id,
}: {
  value: string;
  onChange: (ref: string) => void;
  kinds?: InstrumentKind[];
  /** Refs not to offer (already picked). */
  exclude?: string[];
  label: string;
  id: string;
}) {
  const list = useMarketInstruments();
  const items = (list.data ?? []).filter(
    (i) =>
      i.isEnabled &&
      (!kinds || kinds.includes(i.kind)) &&
      !exclude.includes(refOf(i)),
  );
  const groups = (Object.keys(KIND_LABEL) as InstrumentKind[]).filter((k) =>
    items.some((i) => i.kind === k),
  );
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue
            placeholder={
              list.isPending ? 'Loading the market list…' : 'Choose…'
            }
          />
        </SelectTrigger>
        <SelectContent>
          {groups.map((k) => (
            <SelectGroup key={k}>
              <SelectLabel>{KIND_LABEL[k]}</SelectLabel>
              {items
                .filter((i) => i.kind === k)
                .map((i) => (
                  <SelectItem key={i.id} value={refOf(i)}>
                    {i.name}{' '}
                    <span className="font-mono text-xs text-muted-foreground">
                      {refOf(i)}
                    </span>
                  </SelectItem>
                ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Several curated instruments, as checkboxes. Empty = "all" (said in `hint`). */
export function CuratedChecklist({
  value,
  onChange,
  kinds,
  label,
  hint,
  max,
}: {
  value: string[];
  onChange: (refs: string[]) => void;
  kinds?: InstrumentKind[];
  label: string;
  hint?: string;
  max: number;
}) {
  const list = useMarketInstruments();
  const items = (list.data ?? []).filter(
    (i) => i.isEnabled && (!kinds || kinds.includes(i.kind)),
  );
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="grid max-h-52 gap-1.5 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
        {items.map((i) => {
          const ref = refOf(i);
          const checked = value.includes(ref);
          return (
            <label
              key={i.id}
              className="flex items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-muted"
            >
              <Checkbox
                checked={checked}
                disabled={!checked && value.length >= max}
                onCheckedChange={(v) =>
                  onChange(v ? [...value, ref] : value.filter((x) => x !== ref))
                }
              />
              <span className="truncate">{i.name}</span>
            </label>
          );
        })}
        {!items.length && (
          <p className="text-sm text-muted-foreground">
            {list.isPending ? 'Loading…' : 'Nothing on the market list yet.'}
          </p>
        )}
      </div>
    </fieldset>
  );
}

/** A curated instrument or any listed stock. */
export function InstrumentPick({
  value,
  onChange,
  label,
  id,
}: {
  value: string;
  onChange: (ref: string) => void;
  label: string;
  id: string;
}) {
  const list = useMarketInstruments();
  const curated = (list.data ?? []).some((i) => refOf(i) === value);
  return (
    <div className="space-y-2">
      <CuratedSelect
        value={curated ? value : ''}
        onChange={onChange}
        label={label}
        id={id}
      />
      <div className="space-y-1.5">
        <Label
          htmlFor={`${id}-stock`}
          className="text-xs text-muted-foreground"
        >
          …or any listed stock
        </Label>
        <StockSearch id={`${id}-stock`} onPick={(ref) => onChange(ref)} />
      </div>
      {value && !curated && (
        <p className="text-xs">
          Chosen: <span className="font-mono">{value}</span>
        </p>
      )}
    </div>
  );
}

export function ChoiceSelect<T extends string | number>({
  label,
  value,
  onChange,
  choices,
  id,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  choices: { value: T; label: string }[];
  id: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={String(value)}
        onValueChange={(v) =>
          onChange((typeof value === 'number' ? Number(v) : v) as T)
        }
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {choices.map((c) => (
            <SelectItem key={String(c.value)} value={String(c.value)}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function RefreshSelect({
  value,
  onChange,
  id,
}: {
  value: number;
  onChange: (v: number) => void;
  id: string;
}) {
  return (
    <ChoiceSelect
      label="Refresh"
      id={id}
      value={value}
      onChange={onChange}
      choices={REFRESH_CHOICES}
    />
  );
}
