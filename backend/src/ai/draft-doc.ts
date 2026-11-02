import type { DraftOutput } from './ai-tasks';

/**
 * An AI draft as an editor document: key takeaways as the Key takeaways
 * widget, then the body's sections. The server validates it like any save.
 */
export function draftDoc(d: DraftOutput): Record<string, unknown> {
  const text = (t: string) => [{ type: 'text', text: t }];
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
        content: text(s.heading),
      });
    }
    for (const p of s.paragraphs)
      content.push({ type: 'paragraph', content: text(p) });
  });
  return {
    type: 'doc',
    content: content.length ? content : [{ type: 'paragraph' }],
  };
}
