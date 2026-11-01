'use client';

import { ArrowLeft, Library } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WidgetDataProvider } from '@/components/widgets/data';
import {
  WIDGET_GROUPS,
  WIDGET_META,
  WIDGET_TYPES,
  type WidgetConfig,
  type WidgetType,
} from '@/components/widgets/meta';
import { Widget, WidgetBoundary } from '@/components/widgets/Widget';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/portal/api';
import { useSavedWidgets } from '@/portal/queries';
import { WidgetForm, widgetProblem } from './widget-form/WidgetForm';

export interface WidgetChoice {
  widget: WidgetType;
  config: WidgetConfig;
  /** A saved widget, embedded by reference. */
  widgetId?: string;
  /** Saved-widget mode: its name. */
  name?: string;
}

/** Drops form-only helpers (keys starting "_") before saving. */
export function cleanConfig(c: WidgetConfig): WidgetConfig {
  return Object.fromEntries(
    Object.entries(c).filter(([k]) => !k.startsWith('_')),
  );
}

/**
 * Choose a widget, set it up and watch it live before it goes in. Used to
 * insert or edit a widget in a story, and to create or edit saved widgets
 * (`named`), whose settings stories can embed by reference.
 */
export function WidgetDialog({
  open,
  onOpenChange,
  initial,
  onSave,
  named = false,
  allowSaved = false,
  saving = false,
  note,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: WidgetChoice | null;
  onSave: (choice: WidgetChoice) => void;
  named?: boolean;
  allowSaved?: boolean;
  saving?: boolean;
  /** Shown above the buttons, e.g. what saving will change. */
  note?: string;
}) {
  const [type, setType] = useState<WidgetType | null>(null);
  const [config, setConfig] = useState<WidgetConfig>({});
  const [name, setName] = useState('');
  const saved = useSavedWidgets(open && allowSaved);

  // Start from `initial` each time the dialog opens, not on every render:
  // callers pass a fresh object, and re-renders must not wipe the form.
  const initialRef = useRef(initial);
  initialRef.current = initial;
  useEffect(() => {
    if (!open) return;
    const i = initialRef.current;
    setType(i?.widget ?? null);
    setConfig(i ? { ...i.config } : {});
    setName(i?.name ?? '');
  }, [open]);

  function choose(t: WidgetType) {
    setType(t);
    setConfig({ ...WIDGET_META[t].defaults });
  }

  const problem = type ? widgetProblem(type, config) : null;
  const nameMissing = named && !name.trim();
  const editing = !!initial;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        {!type ? (
          <>
            <DialogHeader>
              <DialogTitle>
                {named ? 'New saved widget' : 'Insert a widget'}
              </DialogTitle>
              <DialogDescription>
                Market widgets show live prices with their time and source;
                story widgets hold your own text.
              </DialogDescription>
            </DialogHeader>
            <Tabs defaultValue="new">
              {allowSaved && (
                <TabsList>
                  <TabsTrigger value="new">New widget</TabsTrigger>
                  <TabsTrigger value="saved">
                    <Library className="size-4" /> Saved widgets
                  </TabsTrigger>
                </TabsList>
              )}
              <TabsContent value="new" className="space-y-5">
                {WIDGET_GROUPS.map((g) => (
                  <section key={g}>
                    <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {g}
                    </h3>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {WIDGET_TYPES.filter(
                        (t) => WIDGET_META[t].group === g,
                      ).map((t) => {
                        const m = WIDGET_META[t];
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => choose(t)}
                            className="flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                          >
                            <m.icon
                              className="mt-0.5 size-5 shrink-0 text-primary"
                              aria-hidden="true"
                            />
                            <span>
                              <span className="block text-sm font-medium">
                                {m.label}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {m.description}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </TabsContent>
              {allowSaved && (
                <TabsContent value="saved">
                  {saved.isPending ? (
                    <p className="py-6 text-sm text-muted-foreground">
                      Loading saved widgets…
                    </p>
                  ) : saved.error ? (
                    <p className="py-6 text-sm text-destructive">
                      {errorMessage(saved.error)}
                    </p>
                  ) : !saved.data.length ? (
                    <p className="py-6 text-sm text-muted-foreground">
                      No saved widgets yet. Create them under Saved widgets,
                      then reuse them in any story.
                    </p>
                  ) : (
                    <ul className="divide-y rounded-lg border">
                      {saved.data.map((w) => {
                        const m = WIDGET_META[w.type];
                        return (
                          <li key={w.id}>
                            <button
                              type="button"
                              onClick={() =>
                                onSave({
                                  widget: w.type,
                                  config: w.config,
                                  widgetId: w.id,
                                })
                              }
                              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40"
                            >
                              {m && (
                                <m.icon
                                  className="size-4 shrink-0 text-primary"
                                  aria-hidden="true"
                                />
                              )}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">
                                  {w.name}
                                </span>
                                <span className="block text-xs text-muted-foreground">
                                  {m?.label ?? w.type}
                                </span>
                              </span>
                              <Badge variant="outline">
                                {w.uses} {w.uses === 1 ? 'story' : 'stories'}
                              </Badge>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </TabsContent>
              )}
            </Tabs>
          </>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (problem || nameMissing) return;
              onSave({
                widget: type,
                config: cleanConfig(config),
                ...(named ? { name: name.trim() } : {}),
              });
            }}
          >
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {!editing && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="-ml-2"
                    onClick={() => setType(null)}
                    aria-label="Choose another widget"
                  >
                    <ArrowLeft />
                  </Button>
                )}
                {WIDGET_META[type].label}
              </DialogTitle>
              <DialogDescription>
                {WIDGET_META[type].description}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
              <div className="space-y-4">
                {named && (
                  <div className="space-y-1.5">
                    <Label htmlFor="w-name">Name in the library</Label>
                    <Input
                      id="w-name"
                      value={name}
                      maxLength={80}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. F&O risk warning"
                    />
                  </div>
                )}
                <WidgetForm type={type} config={config} onChange={setConfig} />
              </div>
              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Live preview
                </p>
                <div
                  className={cn(
                    'rounded-lg border bg-background px-3',
                    problem && 'opacity-60',
                  )}
                >
                  {problem ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      {problem}
                    </p>
                  ) : (
                    <WidgetDataProvider mode="preview">
                      <WidgetBoundary>
                        <Widget block={{ widget: type, config }} />
                      </WidgetBoundary>
                    </WidgetDataProvider>
                  )}
                </div>
              </div>
            </div>
            {note && <p className="text-sm text-muted-foreground">{note}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!!problem || nameMissing || saving}
              >
                {saving
                  ? 'Saving…'
                  : editing
                    ? 'Update widget'
                    : named
                      ? 'Save widget'
                      : 'Insert widget'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
