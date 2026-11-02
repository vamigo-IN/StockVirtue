'use client';

import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { Library, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { usePortalMe } from '@/components/portal/PortalShell';
import { Button } from '@/components/ui/button';
import { WidgetDataProvider } from '@/components/widgets/data';
import {
  WIDGET_META,
  type WidgetConfig,
  type WidgetType,
} from '@/components/widgets/meta';
import { Widget, WidgetBoundary } from '@/components/widgets/Widget';
import { cn } from '@/lib/utils';
import { can } from '@/portal/access';
import { useSavedWidgets } from '@/portal/queries';
import { WidgetDialog } from './WidgetDialog';

/**
 * A widget inside the story being edited: the same component readers get,
 * fed by the staff preview API (so unpublished stories' stocks work too),
 * with Edit and Remove. A saved widget shows its library settings, which
 * is what readers will see.
 */
export function WidgetNodeView({
  node,
  selected,
  updateAttributes,
  deleteNode,
  editor,
}: ReactNodeViewProps) {
  const [editing, setEditing] = useState(false);
  const me = usePortalMe();
  const type = node.attrs.widget as WidgetType;
  const widgetId = node.attrs.widgetId as string | null;
  const saved = useSavedWidgets(!!widgetId && can(me, 'widgets.read'));
  const preset = widgetId
    ? saved.data?.find((w) => w.id === widgetId)
    : undefined;
  const config = (preset?.config ?? node.attrs.config ?? {}) as WidgetConfig;
  const meta = WIDGET_META[type];
  const editable = editor.isEditable;
  return (
    <NodeViewWrapper
      className={cn(
        // Sans, as on the site: the story text around it is set in serif.
        'not-prose my-6 rounded-xl border border-dashed p-2 font-sans',
        selected ? 'border-primary ring-2 ring-ring/40' : 'border-border',
      )}
      data-drag-handle
    >
      <div
        contentEditable={false}
        className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground"
      >
        {meta && <meta.icon className="size-3.5" aria-hidden="true" />}
        <span className="font-medium">{meta?.label ?? type}</span>
        {widgetId && (
          <span className="inline-flex min-w-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5">
            <Library className="size-3 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {preset ? `Saved: ${preset.name}` : 'Saved widget'}
            </span>
          </span>
        )}
        <span className="flex-1" />
        {editable && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => setEditing(true)}
            >
              <Pencil /> Edit
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => deleteNode()}
              aria-label="Remove widget"
            >
              <Trash2 />
            </Button>
          </>
        )}
      </div>
      <div contentEditable={false} className="px-2">
        <WidgetDataProvider mode="preview">
          <WidgetBoundary>
            <Widget block={{ widget: type, config }} />
          </WidgetBoundary>
        </WidgetDataProvider>
      </div>
      <WidgetDialog
        open={editing}
        onOpenChange={setEditing}
        initial={{ widget: type, config }}
        note={
          widgetId
            ? 'Saving makes this story’s own copy; the saved widget and other stories using it stay as they are.'
            : undefined
        }
        onSave={(c) => {
          updateAttributes({
            widget: c.widget,
            v: 1,
            config: c.config,
            widgetId: null,
          });
          setEditing(false);
        }}
      />
    </NodeViewWrapper>
  );
}
