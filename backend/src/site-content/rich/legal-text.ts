import type { LiveValues } from '../live-values';
import type { BlockNode, InlineNode, SiteDoc } from './types';

/**
 * Plain text of a document as the page renders it, with live values: the
 * token rule (`before + value + after`, else `else`), the stop rule ("."
 * unless the text before already ends with "."), the Cookie settings button
 * only while optional services are on. Blocks are joined with a space and
 * whitespace collapsed, the way the F20 legal extractor reads a page
 * ($R/checks/W6/legal-baseline/extract-legal.mjs), so a seed can be proved
 * equal to the baseline (§2.5, §10.4).
 */

export interface TextOptions {
  /**
   * What the islands contribute: 'none' (hooks, word counts) or 'page' (the
   * texts RequestForm and CookieSettingsButton render today, for the
   * baseline proof).
   */
  islands?: 'none' | 'page';
}

/** RequestForm's visible text before anyone types (privacy/requests/RequestForm.tsx). */
export const REQUEST_FORM_TEXT = 'The email address on your StockVirtue account Email me a code';
export const COOKIE_BUTTON_TEXT = 'Cookie settings';

export function inlineText(
  nodes: readonly InlineNode[] | undefined,
  values: LiveValues,
  opts: TextOptions = {},
): string {
  let out = '';
  for (const n of nodes ?? []) {
    switch (n.type) {
      case 'text':
        out += n.text;
        break;
      case 'token': {
        const v = values[n.attrs.name] ?? '';
        out += v ? `${n.attrs.before ?? ''}${v}${n.attrs.after ?? ''}` : (n.attrs.else ?? '');
        break;
      }
      case 'stop':
        if (!out.endsWith('.')) out += '.';
        break;
      case 'hardBreak':
        out += ' ';
        break;
      case 'cookieSettings':
        if (values['cookies.servicesInUse']) {
          out += `${n.attrs?.before ?? ''}${opts.islands === 'page' ? COOKIE_BUTTON_TEXT : ''}${n.attrs?.after ?? ''}`;
        }
        break;
    }
  }
  return out;
}

function blockText(b: BlockNode, values: LiveValues, opts: TextOptions): string[] {
  switch (b.type) {
    case 'paragraph':
      return [inlineText(b.content, values, opts)];
    case 'heading':
      return [inlineText(b.content, values, opts)];
    case 'bulletList':
    case 'orderedList':
      return b.content.flatMap((li) => li.content.flatMap((c) => blockText(c, values, opts)));
    case 'table':
      return b.content.flatMap((row) =>
        row.content.flatMap((cell) => cell.content.map((p) => inlineText(p.content, values, opts))),
      );
    case 'image':
      return [b.attrs.caption ?? '', b.attrs.credit ?? ''];
    case 'requestForm':
      return [opts.islands === 'page' ? REQUEST_FORM_TEXT : ''];
  }
}

/** The whole document as one normalised line. */
export function docText(doc: SiteDoc, values: LiveValues, opts: TextOptions = {}): string {
  return doc.content
    .flatMap((b) => blockText(b, values, opts))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
