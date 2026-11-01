import { NodeSelection } from '@tiptap/pm/state';
import type { Editor } from '@tiptap/react';

/**
 * Inserts a block at the cursor. When a block itself is selected (an image,
 * a video, a card) the new one goes after it instead of replacing it.
 */
export function insertBlock(editor: Editor, content: Record<string, unknown>) {
  const { selection } = editor.state;
  const chain = editor.chain().focus();
  if (selection instanceof NodeSelection) {
    chain.insertContentAt(selection.to, content).run();
  } else {
    chain.insertContent(content).run();
  }
}

const cell = (header: boolean) => ({
  type: header ? 'tableHeader' : 'tableCell',
  content: [{ type: 'paragraph' }],
});
const row = (header: boolean, cols: number) => ({
  type: 'tableRow',
  content: Array.from({ length: cols }, () => cell(header)),
});

/** A 3×3 table with a header row. */
export const emptyTable = () => ({
  type: 'table',
  content: [row(true, 3), row(false, 3), row(false, 3)],
});
