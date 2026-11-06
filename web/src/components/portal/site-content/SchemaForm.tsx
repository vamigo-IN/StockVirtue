'use client';

import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LIMITS, type FieldRule } from '@/content/site/limits';
import type { Fact } from '@/content/site/types';
import {
  BooleanField,
  FactField,
  IdField,
  InlineField,
  LineField,
  MonthField,
  NumberField,
  ParasField,
  PhotoField,
  ScreenField,
  TextField,
  type FieldBase,
} from './fields';
import { getAt, joinPath, parsePath, pathWithin, rulePath, setAt, type Seg } from './form-paths';
import { SiteConfirm } from './SiteConfirm';

/**
 * One form for every structured item, driven by its schema (W7 addendum
 * §8.3): sections in page order, each with a "where this shows" line; the
 * control of each field from its kind and limits (src/content/site/limits.ts,
 * mirrored from the API's schemas); lists with add / remove / up / down
 * inside their counts; link names read-only once published ("Change link");
 * legal-locked fields locked for people without legal.manage.
 */

export type FormNode =
  | {
      node: 'field';
      /** Relative to the enclosing list item or group. */
      path: string;
      label: string;
      help?: string;
      placeholder?: string;
      /** `inline` fields with text and tokens only (legal heads). */
      plain?: boolean;
      rows?: number;
    }
  | {
      node: 'list';
      path: string;
      label: string;
      help?: string;
      /** "item", "question" … */
      itemName: string;
      itemTitle?: (item: unknown, index: number) => string;
      children: FormNode[];
      newItem: (items: unknown[]) => unknown;
      /** A fixed list (ids and order fixed): no add, remove or reorder. */
      fixed?: boolean;
    }
  | {
      node: 'group';
      path: string;
      label: string;
      help?: string;
      /** All or nothing: null until someone adds it. */
      optional?: boolean;
      children: FormNode[];
      empty?: () => unknown;
    }
  | {
      /** A field with its own control (the download page's FAQ question picker). */
      node: 'custom';
      path: string;
      label: string;
      help?: string;
      component: React.ComponentType<CustomFieldProps>;
    };

/** What a `custom` node's control gets: the field's id, rule, value and error. */
export interface CustomFieldProps extends FieldBase {
  value: unknown;
  onChange: (next: unknown) => void;
}

export interface FormSection {
  id: string;
  title: string;
  /** Where it shows on the site. */
  help?: string;
  nodes: FormNode[];
}

export interface FormSchema {
  /** The key of its rules in LIMITS ('wont-do', 'legal', 'custom', 'chrome' …). */
  limitsKey: keyof typeof LIMITS;
  sections: FormSection[];
  /** Name changes "{section} › {field}" (pages whose sections repeat field names: "Heading"). */
  sectionPrefix?: boolean;
}

export interface SchemaFormProps {
  schema: FormSchema;
  value: unknown;
  onChange: (next: unknown) => void;
  /** The live content, to know which link names are published. */
  live?: unknown;
  /** Field errors from the API, by path. */
  errors?: { path: string; message: string }[];
  disabled?: boolean;
  /** Whether this person may change legal-locked fields. */
  canEditLocked: boolean;
  /** Rules from the API (GET …/types), by path; they win over limits.ts. */
  overrides?: Record<string, unknown>;
  /** "Change link" was confirmed: the next save carries renameIds. */
  onRenameIds?: () => void;
  /** Only some sections (the editor splits the head from the body). */
  only?: string[];
  /** Render the sections without cards. */
  bare?: boolean;
}

function isRule(v: unknown): v is FieldRule {
  return !!v && typeof v === 'object' && typeof (v as FieldRule).kind === 'string';
}

export function SchemaForm(props: SchemaFormProps) {
  const { schema, value, onChange, disabled, only, bare } = props;
  const [unlocked, setUnlocked] = useState<Set<string>>(() => new Set());
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const rules = LIMITS[schema.limitsKey] ?? {};

  const ruleAt = (segs: Seg[]): FieldRule | undefined => {
    const p = rulePath(segs);
    const o = props.overrides?.[p];
    return isRule(o) ? o : rules[p];
  };
  const errorAt = (path: string) =>
    props.errors?.find((e) => e.path === path)?.message ??
    props.errors?.find((e) => pathWithin(e.path, path) && e.path !== path)?.message;
  const set = (segs: Seg[], v: unknown) => onChange(setAt(value, segs, v));

  function renderNode(n: FormNode, base: Seg[], key: string): React.ReactNode {
    const segs = [...base, ...parsePath(n.path)];
    const path = joinPath(segs);
    const id = `f-${path.replace(/[^a-zA-Z0-9]+/g, '-')}`;
    if (n.node === 'group') {
      const v = getAt(value, segs);
      if (n.optional && (v === null || v === undefined)) {
        return (
          <div key={key} className="rounded-lg border border-dashed p-4">
            <p className="text-sm font-medium">{n.label}</p>
            {n.help && <p className="mt-0.5 text-xs text-muted-foreground">{n.help}</p>}
            {!disabled && (
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => set(segs, n.empty?.() ?? {})}>
                <Plus /> Add {n.label.toLowerCase()}
              </Button>
            )}
          </div>
        );
      }
      return (
        <fieldset key={key} className="space-y-4 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">{n.label}</legend>
          {n.help && <p className="-mt-2 text-xs text-muted-foreground">{n.help}</p>}
          {n.children.map((c, i) => renderNode(c, segs, `${key}.${i}`))}
          {n.optional && !disabled && (
            <Button type="button" variant="ghost" size="sm" onClick={() => set(segs, null)}>
              <Trash2 /> Remove {n.label.toLowerCase()}
            </Button>
          )}
        </fieldset>
      );
    }
    if (n.node === 'list') {
      const items = (getAt(value, segs) as unknown[] | undefined) ?? [];
      const rule = ruleAt(segs);
      const [min, max] = rule?.count ?? [0, 99];
      const move = (i: number, d: -1 | 1) => {
        const next = items.slice();
        const [x] = next.splice(i, 1);
        next.splice(i + d, 0, x);
        set(segs, next);
      };
      const err = errorAt(path);
      return (
        <div key={key} className="space-y-3" data-field={id}>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{n.label}</p>
              {n.help && <p className="text-xs text-muted-foreground">{n.help}</p>}
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {items.length} {min === max ? `(exactly ${min})` : `(${min}–${max})`}
            </span>
          </div>
          <ol className="space-y-3">
            {items.map((item, i) => {
              const title = n.itemTitle?.(item, i) || `${n.itemName[0].toUpperCase()}${n.itemName.slice(1)} ${i + 1}`;
              return (
                <li key={i} className="rounded-lg border bg-card p-4">
                  <div className="mb-3 flex items-center gap-1">
                    <span className="w-6 font-mono text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
                    {!n.fixed && !disabled && (
                      <>
                        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${title} up`}>
                          <ArrowUp />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move ${title} down`}>
                          <ArrowDown />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => set(segs, items.filter((_, j) => j !== i))}
                          disabled={items.length <= min}
                          aria-label={`Remove ${title}`}
                        >
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </div>
                  <div className="space-y-4">{n.children.map((c, j) => renderNode(c, [...segs, i], `${key}.${i}.${j}`))}</div>
                </li>
              );
            })}
          </ol>
          {!n.fixed && !disabled && (
            <Button type="button" variant="outline" size="sm" onClick={() => set(segs, [...items, n.newItem(items)])} disabled={items.length >= max}>
              <Plus /> Add {n.itemName}
            </Button>
          )}
          {err && (
            <p className="text-xs text-destructive" role="alert">
              {err}
            </p>
          )}
        </div>
      );
    }

    const rule = ruleAt(segs);
    const v = getAt(value, segs);
    const locked = !!rule?.legalLocked && !props.canEditLocked;
    const common = { id, label: n.label, help: n.help, rule, disabled, error: errorAt(path), locked };
    if (n.node === 'custom') {
      const Control = n.component;
      return <Control key={key} {...common} value={v} onChange={(x) => set(segs, x)} />;
    }
    switch (rule?.kind) {
      case 'paras':
        return <ParasField key={key} {...common} value={v} onChange={(x) => set(segs, x)} />;
      case 'text':
        return <TextField key={key} {...common} value={String(v ?? '')} onChange={(x) => set(segs, x)} rows={n.rows} />;
      case 'inline':
        return <InlineField key={key} {...common} value={v} onChange={(x) => set(segs, x)} marks={!n.plain} />;
      case 'fact':
        return <FactField key={key} {...common} value={v as Fact<unknown>} onChange={(x) => set(segs, x)} />;
      case 'number':
        return <NumberField key={key} {...common} value={Number(v)} onChange={(x) => set(segs, x)} />;
      case 'month':
        return <MonthField key={key} {...common} value={String(v ?? '')} onChange={(x) => set(segs, x)} />;
      case 'boolean':
        return <BooleanField key={key} {...common} value={!!v} onChange={(x) => set(segs, x)} />;
      case 'screen':
        return (
          <ScreenField key={key} {...common} value={(v ?? null) as Parameters<typeof ScreenField>[0]['value']} onChange={(x) => set(segs, x)} />
        );
      case 'photo':
        return (
          <PhotoField key={key} {...common} value={(v ?? null) as Parameters<typeof PhotoField>[0]['value']} onChange={(x) => set(segs, x)} />
        );
      case 'id': {
        const published = !!v && getAt(props.live, segs) === v;
        return (
          <IdField
            key={key}
            {...common}
            value={String(v ?? '')}
            onChange={(x) => set(segs, x)}
            published={published}
            unlocked={unlocked.has(path)}
            onUnlock={() => setConfirmId(path)}
          />
        );
      }
      default:
        // A long one-line field (the footer's legal lines) wraps in a box; it stays one line.
        if (n.rows && n.rows > 1) {
          return (
            <TextField key={key} {...common} value={String(v ?? '')} onChange={(x) => set(segs, x.replace(/[\r\n]+/g, ' '))} rows={n.rows} />
          );
        }
        return (
          <LineField key={key} {...common} value={String(v ?? '')} onChange={(x) => set(segs, x)} placeholder={n.placeholder} />
        );
    }
  }

  const sections = schema.sections.filter((s) => !only || only.includes(s.id));
  return (
    <div className="space-y-6">
      {sections.map((s) =>
        bare ? (
          <section key={s.id} className="space-y-4" aria-labelledby={`sec-${s.id}`}>
            <div>
              <h2 id={`sec-${s.id}`} className="text-base font-semibold">
                {s.title}
              </h2>
              {s.help && <p className="text-xs text-muted-foreground">{s.help}</p>}
            </div>
            {s.nodes.map((n, i) => renderNode(n, [], `${s.id}.${i}`))}
          </section>
        ) : (
          <Card key={s.id} className="gap-4">
            <CardHeader>
              <CardTitle className="text-base">{s.title}</CardTitle>
              {s.help && <CardDescription>{s.help}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-5">{s.nodes.map((n, i) => renderNode(n, [], `${s.id}.${i}`))}</CardContent>
          </Card>
        ),
      )}
      <SiteConfirm
        open={!!confirmId}
        onOpenChange={(o) => !o && setConfirmId(null)}
        title="Change this link name?"
        description={
          <>
            <p>Links people already share to this part of the page (…#name) stop working once you publish a new name.</p>
            <p>Change it only if the old name is wrong.</p>
          </>
        }
        confirmLabel="Change link"
        onConfirm={async () => {
          if (confirmId) setUnlocked((s) => new Set(s).add(confirmId));
          props.onRenameIds?.();
        }}
      />
    </div>
  );
}
