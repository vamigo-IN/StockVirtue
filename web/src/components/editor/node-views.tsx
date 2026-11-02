'use client';

import {
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
} from '@tiptap/react';
import { ImageOff, Newspaper, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const field =
  'w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-70';

type Attrs = Record<string, string>;

/** Library image with its caption, credit and alt text, edited in place. */
export function FigureView({
  node,
  updateAttributes,
  selected,
  editor,
}: ReactNodeViewProps) {
  const a = node.attrs as Attrs;
  const editable = editor.isEditable;
  return (
    <NodeViewWrapper
      as="figure"
      className={cn('sv-figure-edit not-prose', selected && 'is-selected')}
      data-drag-handle
    >
      {a.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={a.src}
          alt={a.alt}
          className="w-full rounded-lg"
          draggable={false}
        />
      ) : (
        <div className="grid h-40 place-items-center rounded-lg bg-muted text-sm text-muted-foreground">
          <span className="flex items-center gap-2">
            <ImageOff className="size-4" /> Image not available
          </span>
        </div>
      )}
      <div contentEditable={false} className="mt-2 space-y-1.5">
        <input
          className={field}
          value={a.caption ?? ''}
          onChange={(e) => updateAttributes({ caption: e.target.value })}
          placeholder="Caption (shown under the image)"
          aria-label="Image caption"
          disabled={!editable}
          maxLength={500}
        />
        <div className="flex gap-1.5">
          <input
            className={cn(field, !a.alt && editable && 'border-warning/60')}
            value={a.alt ?? ''}
            onChange={(e) => updateAttributes({ alt: e.target.value })}
            placeholder="Alt text: what the image shows, for screen readers"
            aria-label="Image alt text"
            disabled={!editable}
            maxLength={300}
          />
          <input
            className={cn(field, 'w-36 shrink-0')}
            value={a.credit ?? ''}
            onChange={(e) => updateAttributes({ credit: e.target.value })}
            placeholder="Credit"
            aria-label="Image credit"
            disabled={!editable}
            maxLength={200}
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

const TONES = [
  { value: 'info', label: 'Info' },
  { value: 'takeaway', label: 'Key takeaway' },
  { value: 'warning', label: 'Warning' },
  { value: 'note', label: 'Note' },
];

/** A highlighted box (key takeaways, warnings) whose text stays editable. */
export function CalloutView({
  node,
  updateAttributes,
  editor,
}: ReactNodeViewProps) {
  const tone = (node.attrs as Attrs).tone || 'info';
  return (
    <NodeViewWrapper as="aside" className={`sv-callout sv-callout-${tone}`}>
      <div
        contentEditable={false}
        className="not-prose mb-1.5 flex items-center gap-2"
      >
        <select
          value={tone}
          onChange={(e) => updateAttributes({ tone: e.target.value })}
          disabled={!editor.isEditable}
          aria-label="Callout style"
          className="rounded border border-input bg-background px-1.5 py-0.5 text-xs font-medium"
        >
          {TONES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <NodeViewContent className="sv-callout-body" />
    </NodeViewWrapper>
  );
}

/** YouTube/Vimeo embed placeholder; readers get the real player. */
export function VideoView({
  node,
  updateAttributes,
  selected,
  editor,
}: ReactNodeViewProps) {
  const a = node.attrs as Attrs;
  const thumb =
    a.provider === 'youtube'
      ? `https://i.ytimg.com/vi/${a.videoId}/hqdefault.jpg`
      : null;
  return (
    <NodeViewWrapper
      as="figure"
      className={cn('sv-figure-edit not-prose', selected && 'is-selected')}
      data-drag-handle
    >
      <div className="relative grid aspect-video place-items-center overflow-hidden rounded-lg bg-neutral-900">
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumb}
            alt=""
            className="absolute inset-0 size-full object-cover opacity-80"
          />
        )}
        <span className="relative flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm font-medium text-white">
          <PlayCircle className="size-4" />
          {a.provider === 'vimeo' ? 'Vimeo' : 'YouTube'} video
        </span>
      </div>
      <div contentEditable={false} className="mt-2">
        <input
          className={field}
          value={a.caption ?? ''}
          onChange={(e) => updateAttributes({ caption: e.target.value })}
          placeholder="Caption (also the player's title for screen readers)"
          aria-label="Video caption"
          disabled={!editor.isEditable}
          maxLength={500}
        />
      </div>
    </NodeViewWrapper>
  );
}

/** "Related" card linking another story. */
export function RelatedView({ node, selected }: ReactNodeViewProps) {
  const a = node.attrs as Attrs;
  return (
    <NodeViewWrapper
      className={cn(
        'not-prose my-4 flex items-center gap-3 rounded-xl border bg-muted/40 px-4 py-3',
        selected && 'ring-2 ring-ring/50',
      )}
      data-drag-handle
    >
      <Newspaper className="size-4 shrink-0 text-primary" aria-hidden />
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Related
        </span>
        <span className="block truncate text-sm font-medium">
          {a.title || 'Linked article'}
        </span>
      </span>
    </NodeViewWrapper>
  );
}
