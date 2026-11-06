import { collectStrings, docBlocks, wordsChanged } from './plain-text';
import { parsePath, rulePath } from './form-paths';
import type { FormNode, FormSchema } from './SchemaForm';

/**
 * What changed between two versions of an item, in editors' words (W7
 * addendum §8.5, §8.6): field labels for structured items, block counts for
 * documents. Pure.
 */

/** Labels by limits path ("items[].lead" → "Limits › Lead"). */
export function schemaLabels(schema: FormSchema | null | undefined): Map<string, string> {
  const out = new Map<string, string>();
  if (!schema) return out;
  // `section`: the section's title, for a top-level name ("Closing › Heading"); inside a list
  // the list's own name is context enough ("Groups › Questions › Question (1.2)").
  const walk = (nodes: FormNode[], base: string, prefix: string, section = '') => {
    for (const n of nodes) {
      const p = n.path ? (base ? `${base}${n.path.startsWith('[') ? '' : '.'}${n.path}` : n.path) : base;
      const own = prefix ? `${prefix} › ${n.label}` : n.label;
      const label = !prefix && section && section !== n.label ? `${section} › ${n.label}` : own;
      if (n.node === 'field' || n.node === 'custom') out.set(rulePath(parsePath(p)), label);
      else if (n.node === 'list') {
        out.set(rulePath(parsePath(p)), label);
        walk(n.children, `${p}[]`, own);
      } else walk(n.children, p, label);
    }
  };
  for (const s of schema.sections) walk(s.nodes, '', '', schema.sectionPrefix ? s.title : '');
  return out;
}

function labelFor(path: string, labels: Map<string, string>): string {
  const segs = parsePath(path);
  for (let n = segs.length; n > 0; n--) {
    const l = labels.get(rulePath(segs.slice(0, n)));
    if (l) {
      const idx = segs.slice(0, n).filter((s) => typeof s === 'number') as number[];
      return idx.length ? `${l} (${idx.map((i) => i + 1).join('.')})` : l;
    }
  }
  return path;
}

export interface FieldChange {
  path: string;
  label: string;
  before: string;
  after: string;
}

/** Every text that differs, by field, with labels from the schema. */
export function fieldChanges(before: unknown, after: unknown, schema?: FormSchema | null): FieldChange[] {
  const labels = schemaLabels(schema);
  const a = new Map(collectStrings(before).map((s) => [s.path, s.text]));
  const b = new Map(collectStrings(after).map((s) => [s.path, s.text]));
  const paths = new Set([...a.keys(), ...b.keys()]);
  const out: FieldChange[] = [];
  for (const p of paths) {
    if (p.includes('.content[') || p.startsWith('body')) continue; // documents are compared by block
    const x = a.get(p) ?? '';
    const y = b.get(p) ?? '';
    if (x !== y) out.push({ path: p, label: labelFor(p, labels), before: x, after: y });
  }
  return out;
}

/** "3 paragraphs changed, a heading added" for a document. */
export function docChangeSummary(before: unknown, after: unknown): string[] {
  const a = docBlocks(before);
  const b = docBlocks(after);
  const out: string[] = [];
  const count = (list: typeof a, k: string) => list.filter((x) => x.kind === k).length;
  const kinds: [string, string, string][] = [
    ['h2', 'heading', 'headings'],
    ['h3', 'subheading', 'subheadings'],
    ['row', 'table row', 'table rows'],
    ['li', 'list item', 'list items'],
    ['caption', 'table', 'tables'],
  ];
  for (const [k, one, many] of kinds) {
    const d = count(b, k) - count(a, k);
    if (d) out.push(`${Math.abs(d) === 1 ? 'a' : Math.abs(d)} ${Math.abs(d) === 1 ? one : many} ${d > 0 ? 'added' : 'removed'}`);
  }
  const liveTexts = new Set(a.map((x) => x.text));
  const changed = b.filter((x) => !liveTexts.has(x.text)).length;
  if (changed) out.push(`${changed} block${changed === 1 ? '' : 's'} with new wording`);
  const words = wordsChanged(a.map((x) => x.text).join('\n'), b.map((x) => x.text).join('\n'));
  if (words) out.push(`${words} word${words === 1 ? '' : 's'} changed`);
  return out;
}

/** The fact texts the content relies on (the publish's factsSnapshot, §1.4). */
export function factIdsIn(content: unknown): string[] {
  const ids = new Set<string>();
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (Array.isArray(o.facts) && 'value' in o) for (const f of o.facts) if (typeof f === 'string') ids.add(f);
      Object.values(o).forEach(walk);
    }
  };
  walk(content);
  return [...ids].sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)));
}
