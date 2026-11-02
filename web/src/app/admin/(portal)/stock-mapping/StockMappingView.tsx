'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Ban, Link2, Plus, Search, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  ChoiceSelect,
  StockSearch,
} from '@/components/editor/widget-form/pickers';
import {
  ConfirmDialog,
  EmptyState,
  PageHeader,
  QueryError,
  RowsSkeleton,
} from '@/components/portal/common';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { can } from '@/portal/access';
import { api, errorMessage } from '@/portal/api';
import { formatDate } from '@/portal/format';
import { qk, useStockAliases } from '@/portal/queries';
import type { ItemStock, StockAlias } from '@/portal/types';

const VIA: Record<ItemStock['via'], string> = {
  name: 'its company name',
  symbol: 'its ticker in capitals',
  alias: 'an alias',
};

/**
 * Stock mapping (spec §10): how incoming news is matched to listed
 * companies. Names and tickers match on their own; aliases add nicknames
 * and block phrases that only look like a company.
 */
export function StockMappingView() {
  const me = usePortalMe();
  const qc = useQueryClient();
  const aliases = useStockAliases();
  const canEdit = can(me, 'sources.update');

  const [sample, setSample] = useState('');
  const [result, setResult] = useState<{
    matches: ItemStock[];
    companies: number;
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const [phrase, setPhrase] = useState('');
  const [mode, setMode] = useState<'map' | 'block'>('map');
  const [stock, setStock] = useState<{
    symbol: string;
    name: string | null;
  } | null>(null);
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<StockAlias | null>(null);

  async function test() {
    setTesting(true);
    try {
      setResult(
        await api('staff/stock-mapping/test', {
          method: 'POST',
          body: { text: sample },
        }),
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setTesting(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      await api('staff/stock-mapping', {
        method: 'POST',
        body: {
          phrase: phrase.trim(),
          symbol: mode === 'map' ? stock?.symbol : null,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      toast.success(
        mode === 'map'
          ? `“${phrase.trim()}” now maps to ${stock?.name ?? stock?.symbol}.`
          : `“${phrase.trim()}” will never be matched as a company.`,
      );
      setPhrase('');
      setStock(null);
      setNote('');
      void qc.invalidateQueries({ queryKey: qk.stockAliases });
      if (sample.trim().length >= 3) void test();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock mapping"
        description="How incoming news is matched to listed companies. Full company names and NSE tickers written in capitals match on their own. Add aliases for nicknames (RIL, SBI) and block phrases that only look like a company. Matches are suggestions: editors confirm a story’s related stocks."
      />

      <Card>
        <CardHeader>
          <CardTitle>Try a headline</CardTitle>
          <CardDescription>
            See which companies a headline or summary would be matched to, and
            why.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            placeholder="e.g. RIL and HDFC Bank lead gains as Sensex rises; Infosys slips"
            rows={2}
            maxLength={4000}
          />
          <Button
            variant="outline"
            onClick={() => void test()}
            disabled={testing || sample.trim().length < 3}
          >
            <Search /> {testing ? 'Checking…' : 'Check'}
          </Button>
          {result && (
            <div className="text-sm">
              {result.matches.length === 0 ? (
                <p className="text-muted-foreground">
                  No listed companies found.
                </p>
              ) : (
                <ul className="space-y-1">
                  {result.matches.map((m) => (
                    <li key={m.symbol}>
                      <Badge variant="secondary">{m.symbol}</Badge> {m.name}{' '}
                      <span className="text-muted-foreground">
                        — matched by {VIA[m.via]}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Matching against {result.companies.toLocaleString('en-IN')}{' '}
                NSE-listed companies.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aliases and blocked phrases</CardTitle>
          <CardDescription>
            Applied to everything fetched from now on.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {canEdit && (
            <form
              onSubmit={add}
              className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[1fr_200px_1.4fr_auto] lg:items-end"
            >
              <div className="space-y-1.5">
                <Label htmlFor="alias-phrase">Phrase</Label>
                <Input
                  id="alias-phrase"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  placeholder="e.g. RIL"
                  maxLength={80}
                  required
                />
              </div>
              <ChoiceSelect
                id="alias-mode"
                label="Means"
                value={mode}
                onChange={setMode}
                choices={[
                  { value: 'map', label: 'A listed company' },
                  { value: 'block', label: 'Never a company' },
                ]}
              />
              {mode === 'map' ? (
                <div className="space-y-1.5">
                  <Label htmlFor="alias-stock">Company</Label>
                  {stock ? (
                    <div className="flex h-9 items-center gap-2 rounded-md border px-3 text-sm">
                      <Badge variant="secondary">{stock.symbol}</Badge>
                      <span className="truncate">{stock.name}</span>
                      <button
                        type="button"
                        className="ml-auto text-muted-foreground hover:text-foreground"
                        onClick={() => setStock(null)}
                        aria-label="Choose another company"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <StockSearch
                      id="alias-stock"
                      onPick={(ref, name) => {
                        const [exchange, symbol] = ref.split(':');
                        if (exchange !== 'NSE') {
                          toast.error('Pick the NSE listing.');
                          return;
                        }
                        setStock({ symbol, name });
                      }}
                    />
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="alias-note">Why (optional)</Label>
                  <Input
                    id="alias-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="e.g. the regulator, not the bank"
                    maxLength={200}
                  />
                </div>
              )}
              <Button
                type="submit"
                disabled={
                  adding ||
                  phrase.trim().length < 2 ||
                  (mode === 'map' && !stock)
                }
              >
                <Plus /> Add
              </Button>
            </form>
          )}

          {aliases.error ? (
            <QueryError
              error={aliases.error}
              onRetry={() => void aliases.refetch()}
            />
          ) : !aliases.data ? (
            <RowsSkeleton rows={4} />
          ) : aliases.data.length === 0 ? (
            <EmptyState icon={Link2} title="No aliases">
              Company names and tickers still match. Add an alias for a nickname
              the matcher misses.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phrase</TableHead>
                    <TableHead>Matches</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Added</TableHead>
                    {canEdit && <TableHead className="w-0" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aliases.data.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.phrase}</TableCell>
                      <TableCell>
                        {a.symbol ? (
                          <>
                            <Badge variant="secondary">{a.symbol}</Badge>{' '}
                            {a.company ?? (
                              <span className="text-destructive">
                                no longer listed — ignored
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Ban className="size-3.5" /> Never matched
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {a.note ?? ''}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                        {a.createdBy ?? '—'} · {formatDate(a.createdAt)}
                      </TableCell>
                      {canEdit && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setRemoving(a)}
                            aria-label={`Remove ${a.phrase}`}
                          >
                            <Trash2 />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove “${removing?.phrase ?? ''}”?`}
        description="Items fetched from now on won’t use it. Items already in the list keep their matches."
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          await api(`staff/stock-mapping/${removing.id}`, { method: 'DELETE' });
          toast.success('Removed.');
          void qc.invalidateQueries({ queryKey: qk.stockAliases });
        }}
      />
    </div>
  );
}
