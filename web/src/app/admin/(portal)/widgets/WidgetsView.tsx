'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Library, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  WidgetDialog,
  type WidgetChoice,
} from '@/components/editor/WidgetDialog';
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
import { Card } from '@/components/ui/card';
import { WIDGET_META } from '@/components/widgets/meta';
import { can } from '@/portal/access';
import { api, errorMessage } from '@/portal/api';
import { formatDateTime, timeAgo } from '@/portal/format';
import { qk, useSavedWidgets } from '@/portal/queries';
import type { SavedWidget } from '@/portal/types';

const stories = (n: number) => `${n} ${n === 1 ? 'story' : 'stories'}`;

/**
 * The saved-widget library: widgets set up once and embedded in many
 * stories, so one edit (the F&O warning, a market-wrap ticker) updates all.
 */
export function WidgetsView() {
  const me = usePortalMe();
  const qc = useQueryClient();
  const list = useSavedWidgets();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SavedWidget | null>(null);
  const [removing, setRemoving] = useState<SavedWidget | null>(null);
  const [saving, setSaving] = useState(false);

  const canCreate = can(me, 'widgets.create');
  const canUpdate = can(me, 'widgets.update');
  const canDelete = can(me, 'widgets.delete');

  async function create(c: WidgetChoice) {
    setSaving(true);
    try {
      await api<SavedWidget>('staff/widgets', {
        method: 'POST',
        body: { name: c.name, type: c.widget, config: c.config },
      });
      await qc.invalidateQueries({ queryKey: qk.savedWidgets });
      toast.success(
        `Saved “${c.name}”. Insert it from any story’s Insert menu.`,
      );
      setCreating(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function update(w: SavedWidget, c: WidgetChoice) {
    setSaving(true);
    try {
      await api<SavedWidget>(`staff/widgets/${w.id}`, {
        method: 'PUT',
        body: { name: c.name, config: c.config },
      });
      await qc.invalidateQueries({ queryKey: qk.savedWidgets });
      toast.success(
        w.uses
          ? `Saved. The ${stories(w.uses)} using it now show the change.`
          : 'Saved.',
      );
      setEditing(null);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <PageHeader
      title="Saved widgets"
      description="Widgets set up once and reused across stories. Editing one here updates every story that embeds it."
      actions={
        canCreate && (
          <Button onClick={() => setCreating(true)}>
            <Plus /> New saved widget
          </Button>
        )
      }
    />
  );

  return (
    <>
      {header}
      {list.error ? (
        <QueryError error={list.error} onRetry={() => void list.refetch()} />
      ) : !list.data ? (
        <RowsSkeleton rows={5} />
      ) : list.data.length === 0 ? (
        <EmptyState icon={Library} title="No saved widgets yet">
          Save the widgets your desk uses again and again, such as the standard
          F&amp;O risk warning or a market-wrap ticker.
        </EmptyState>
      ) : (
        <Card className="divide-y py-0">
          {list.data.map((w) => {
            const m = WIDGET_META[w.type];
            return (
              <div
                key={w.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap"
              >
                {m && (
                  <m.icon
                    className="size-5 shrink-0 text-primary"
                    aria-hidden="true"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{w.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {m?.label ?? w.type} · updated{' '}
                    <span title={formatDateTime(w.updatedAt)}>
                      {timeAgo(w.updatedAt)}
                    </span>
                  </div>
                </div>
                <Badge variant={w.uses ? 'secondary' : 'outline'}>
                  {w.uses ? `In ${stories(w.uses)}` : 'Not used yet'}
                </Badge>
                <div className="flex gap-0.5">
                  {canUpdate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing(w)}
                    >
                      <Pencil /> Edit
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => setRemoving(w)}
                      aria-label={`Delete ${w.name}`}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <WidgetDialog
        open={creating}
        onOpenChange={(o) => !saving && setCreating(o)}
        named
        saving={saving}
        onSave={(c) => void create(c)}
      />
      <WidgetDialog
        open={!!editing}
        onOpenChange={(o) => !saving && !o && setEditing(null)}
        named
        saving={saving}
        initial={
          editing
            ? {
                widget: editing.type,
                config: editing.config,
                name: editing.name,
              }
            : null
        }
        note={
          editing?.uses
            ? `Saving updates the ${stories(editing.uses)} using it.`
            : undefined
        }
        onSave={(c) => editing && void update(editing, c)}
      />
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Delete “${removing?.name ?? ''}”?`}
        description={
          <p>
            {removing?.uses
              ? `It’s in ${stories(removing.uses)}. Take it out of those stories first.`
              : 'No story uses it. This can’t be undone.'}
          </p>
        }
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          await api(`staff/widgets/${removing.id}`, { method: 'DELETE' });
          qc.setQueryData<SavedWidget[]>(qk.savedWidgets, (old) =>
            old?.filter((w) => w.id !== removing.id),
          );
          toast.success(`Deleted “${removing.name}”.`);
        }}
      />
    </>
  );
}
