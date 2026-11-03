'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, ExternalLink, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { QueryError, RowsSkeleton } from '@/components/portal/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api, errorMessage } from '@/portal/api';
import { qk } from '@/portal/queries';
import type { CatalogueSource, NewsSourceView } from '@/portal/types';
import { USAGE } from './labels';

/**
 * Official feeds whose terms were checked, added in one click with the usage
 * those terms allow. New items wait in Incoming news until a Super Admin
 * chooses otherwise for the source.
 */
export function CatalogueDialog({
  open,
  onOpenChange,
  canCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canCreate: boolean;
}) {
  const qc = useQueryClient();
  const catalogue = useQuery({
    queryKey: ['sources', 'catalogue'],
    queryFn: () => api<CatalogueSource[]>('staff/sources/catalogue'),
    enabled: open,
  });
  const [adding, setAdding] = useState<string | null>(null);

  async function add(c: CatalogueSource) {
    setAdding(c.key);
    try {
      await api<NewsSourceView>(`staff/sources/catalogue/${c.key}`, {
        method: 'POST',
      });
      toast.success(`${c.name} added. New items wait in Incoming news.`);
      void qc.invalidateQueries({ queryKey: qk.sources });
      void qc.invalidateQueries({ queryKey: ['sources', 'catalogue'] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setAdding(null);
    }
  }

  const regions = ['India', 'Global'] as const;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add official sources</DialogTitle>
          <DialogDescription>
            Government, regulator and central-bank feeds. Each is set to what
            its publisher&apos;s terms clearly allow, with the terms linked.
            Check them yourself before showing more.
          </DialogDescription>
        </DialogHeader>
        {catalogue.error ? (
          <QueryError
            error={catalogue.error}
            onRetry={() => void catalogue.refetch()}
          />
        ) : !catalogue.data ? (
          <RowsSkeleton rows={5} />
        ) : (
          <div className="space-y-6">
            {regions.map((region) => (
              <section key={region} className="space-y-2">
                <h3 className="text-sm font-semibold">{region}</h3>
                <ul className="divide-y rounded-lg border">
                  {catalogue.data
                    .filter((c) => c.region === region)
                    .map((c) => (
                      <li key={c.key} className="space-y-1.5 p-3">
                        <div className="flex flex-wrap items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">{c.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {c.terms}{' '}
                              <a
                                href={c.termsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-0.5 text-primary underline-offset-4 hover:underline"
                              >
                                Terms <ExternalLink className="size-3" />
                              </a>
                            </p>
                          </div>
                          <Badge variant="outline" className="shrink-0">
                            {USAGE[c.usage].label}
                          </Badge>
                          {c.added ? (
                            <Button size="sm" variant="ghost" disabled>
                              <Check /> Added
                            </Button>
                          ) : (
                            canCreate && (
                              <Button
                                size="sm"
                                onClick={() => void add(c)}
                                disabled={adding !== null}
                              >
                                <Plus />
                                {adding === c.key ? 'Adding…' : 'Add'}
                              </Button>
                            )
                          )}
                        </div>
                        {c.caution && (
                          <p className="flex gap-1.5 text-xs text-warning">
                            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                            {c.caution}
                          </p>
                        )}
                      </li>
                    ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
