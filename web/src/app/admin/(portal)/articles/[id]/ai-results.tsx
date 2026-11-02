'use client';

import type { Editor } from '@tiptap/react';
import { AlertTriangle, Check, Plus, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AiChecks, AiDraftOutput } from '@/portal/types';

/** What each AI tool returns (validated and checked by the server). */
export interface Outputs {
  HEADLINES: { headlines: string[] };
  SUMMARY: { summary: string; standfirst: string };
  SEO: { seoTitle: string; metaDescription: string };
  TAXONOMY: {
    categoryId: string | null;
    tags: { name: string; existingId: string | null }[];
    sectors: string[];
  };
  RELATED_STOCKS: {
    stocks?: {
      exchange: 'NSE';
      symbol: string;
      name: string;
      reason: string;
    }[];
  };
  RELATED_ARTICLES: {
    picks: { id: string; slug: string; title: string; reason: string }[];
  };
  REVIEW: {
    findings: {
      kind: 'conflict' | 'misleading' | 'citation' | 'outdated' | 'unverified';
      quote: string;
      explanation: string;
      suggestion: string;
    }[];
  };
  EXPLAINERS: { terms: { term: string; explanation: string }[] };
  REWRITE_SECTION: { paragraphs: string[] };
  DRAFT_FROM_NOTES: AiDraftOutput;
}

export const FINDING_LABELS: Record<
  Outputs['REVIEW']['findings'][number]['kind'],
  string
> = {
  conflict: 'Conflicting',
  misleading: 'Could mislead',
  citation: 'Needs a source',
  outdated: 'May be outdated',
  unverified: 'Not in the source',
};

/** A suggestion with its Use button; shows a tick once used. */
export function Suggestion({
  text,
  used,
  disabled,
  onUse,
  label = 'Use',
}: {
  text: React.ReactNode;
  used?: boolean;
  disabled?: boolean;
  onUse: () => void;
  label?: string;
}) {
  return (
    <li className="flex items-start gap-2 rounded-md border bg-background p-2 text-sm">
      <span className="min-w-0 flex-1">{text}</span>
      <Button
        type="button"
        size="sm"
        variant={used ? 'ghost' : 'outline'}
        className="h-7 shrink-0"
        disabled={disabled || used}
        onClick={onUse}
      >
        {used ? <Check /> : <Plus />} {used ? 'Used' : label}
      </Button>
    </li>
  );
}

/** What the automatic checks withheld or removed, so nothing disappears silently. */
export function ChecksNote({ checks }: { checks: AiChecks | null }) {
  const removed = checks?.removed ?? [];
  const withheld = checks?.withheld ?? [];
  if (removed.length + withheld.length === 0) return null;
  return (
    <p className="flex items-start gap-1.5 text-xs text-warning">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      <span>
        The automatic checks{' '}
        {withheld.length > 0 &&
          `withheld ${withheld.length} suggestion${withheld.length > 1 ? 's' : ''}`}
        {withheld.length > 0 && removed.length > 0 && ' and '}
        {removed.length > 0 &&
          `removed ${removed.length} sentence${removed.length > 1 ? 's' : ''}`}{' '}
        with figures that aren’t in the story or its sources
        {removed.some((r) => r.reason === 'copied')
          ? ', or copied wording'
          : ''}
        .
      </span>
    </p>
  );
}

function norm(s: string) {
  return s.replace(/[“”"]/g, '"').replace(/[‘’']/g, "'").toLowerCase();
}

/** Finds `quote` in the story and selects it (whitespace and quote marks forgiven). */
export function selectQuote(editor: Editor, quote: string): boolean {
  const want = norm(quote).replace(/\s+/g, ' ').trim();
  if (!want) return false;
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (range) return false;
    if (!node.isTextblock) return true;
    let text = '';
    const at: number[] = [];
    let space = false;
    node.descendants((child, offset) => {
      const chars = child.isText
        ? (child.text ?? '')
        : child.type.name === 'hardBreak'
          ? ' '
          : '';
      for (let i = 0; i < chars.length; i++) {
        const ch = /\s/.test(chars[i]) ? ' ' : chars[i];
        if (ch === ' ' && space) continue;
        space = ch === ' ';
        text += ch;
        at.push(pos + 1 + offset + i);
      }
    });
    const i = norm(text).indexOf(want);
    if (i >= 0) range = { from: at[i], to: at[i + want.length - 1] + 1 };
    return false;
  });
  if (!range) return false;
  editor.chain().focus().setTextSelection(range).scrollIntoView().run();
  return true;
}

export function FindButton({ onFind }: { onFind: () => void }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 px-2"
      onClick={onFind}
    >
      <Search /> Find in story
    </Button>
  );
}

export function KindBadge({
  kind,
}: {
  kind: Outputs['REVIEW']['findings'][number]['kind'];
}) {
  return (
    <Badge
      variant="outline"
      className={
        kind === 'misleading' || kind === 'conflict'
          ? 'border-destructive/40 text-destructive'
          : 'border-warning/40 text-warning'
      }
    >
      {FINDING_LABELS[kind]}
    </Badge>
  );
}

/** Paragraph nodes for inserting AI text into the editor. */
export const paragraphs = (texts: string[]) =>
  texts.map((t) => ({
    type: 'paragraph',
    content: [{ type: 'text', text: t }],
  }));

/** An AI draft as editor content: optional takeaways widget, headed sections. */
export function draftContent(d: AiDraftOutput) {
  const content: Record<string, unknown>[] = [];
  if (d.keyPoints.length >= 2) {
    content.push({
      type: 'marketWidget',
      attrs: {
        widget: 'key_takeaways',
        v: 1,
        config: { title: 'Key takeaways', items: d.keyPoints.slice(0, 8) },
      },
    });
  }
  d.sections.forEach((s, i) => {
    if (s.heading && (i > 0 || d.sections.length > 1)) {
      content.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: s.heading }],
      });
    }
    content.push(...paragraphs(s.paragraphs));
  });
  return content;
}
