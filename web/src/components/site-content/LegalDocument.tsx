import 'server-only';
import { Fragment, type ReactNode } from 'react';
import { LegalShell } from '@/components/public/legal/LegalShell';
import { LegalTable } from '@/components/public/legal/LegalTable';
import styles from '@/components/public/legal/legal.module.css';
import { safeId } from '@/content/site/reserved-ids';
import type { DocInlineNode, DocProfile, LegalKey, LiveValues, SiteDoc } from '@/content/site/types';
import { LEGAL_PROFILES } from '@/content/site/types';
import type { LegalDoc } from '@/lib/site-content/answers';
import { legalUpdatedLabel } from '@/lib/site-content/format-date';
import { NoticeLine } from './NoticeLine';
import { RichInline, inlineText } from './RichInline';

/**
 * A rich document from site content (W7 addendum §4.1, §4.3): a legal
 * document or a custom page's body, TipTap JSON mapped to React elements on
 * the server. Never an HTML string: text goes through React's escaping, and
 * only the nodes below produce elements (anything else renders nothing).
 *
 * - paragraph → <p> (variant "note": the small muted note of the terms);
 * - heading → <h2>/<h3> with its stored anchor as the id (checked again:
 *   well formed, not reserved, unique in the page; `cookies` is allowed
 *   only in the two privacy notices). LegalToc lists the H2s and keeps
 *   these ids, so deep links survive heading edits;
 * - bulletList / orderedList / listItem → ul / ol / li (a one-paragraph item
 *   renders its text straight in the <li>, as the pages always have);
 * - table → LegalTable (caption, header row, cells);
 * - image (custom pages) → <figure> with the API-resolved src and srcset;
 * - requestForm → the request form island the page passes, once;
 * - inline text, marks, tokens, stops, hard breaks and the Cookie settings
 *   button through RichInline (links checked again by the href rule).
 *
 * The client islands come in as props (`islands`), so a page ships only
 * the ones it uses: /privacy passes the Cookie settings button, and
 * /privacy/requests the request form. The Cookie settings button shows
 * only while optional services are in use (`cookies.servicesInUse` is not
 * empty), as before.
 *
 * Server component (`server-only`): no TipTap or editor code reaches the
 * page.
 */

export type LegalIslands = {
  /** <NoticeCookieSettings />, for the privacy notice's `cookieSettings` node. */
  cookieSettings?: ReactNode;
  /** <RequestForm />, for the requests page's `requestForm` node. */
  requestForm?: ReactNode;
};

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const posInt = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 100_000 ? v : null;

/** The terms' template note as it looked before `.note` exists in legal.module.css (M7.5, W6). */
const NOTE_FALLBACK_STYLE = { fontSize: '0.85rem', marginTop: 32 } as const;

type Ctx = {
  values: LiveValues;
  /** The Cookie settings button, or undefined (no island, or no optional services). */
  cookieSettings: ReactNode;
  requestForm: ReactNode;
  requestFormShown: boolean;
  /** Ids rendered so far (every id unique in the page). */
  ids: Set<string>;
  /** Exact reserved ids this document may use (`cookies` in the privacy notices). */
  allowIds: readonly string[];
};

function inline(value: unknown, ctx: Ctx): ReactNode {
  return <RichInline value={list(value) as DocInlineNode[]} values={ctx.values} cookieSettings={ctx.cookieSettings} />;
}

function hasInline(value: unknown): boolean {
  return list(value).some((n) => isRec(n));
}

function anchorId(raw: unknown, ctx: Ctx): string | undefined {
  const id = safeId(raw, { allow: ctx.allowIds });
  if (!id || ctx.ids.has(id)) return undefined;
  ctx.ids.add(id);
  return id;
}

function paragraph(node: Rec, key: number, ctx: Ctx): ReactNode {
  if (!hasInline(node.content)) return null;
  const attrs = isRec(node.attrs) ? node.attrs : {};
  if (attrs.variant === 'note') {
    return (
      <p
        key={key}
        className={styles.note || 'muted'}
        style={styles.note ? undefined : NOTE_FALLBACK_STYLE}
      >
        {inline(node.content, ctx)}
      </p>
    );
  }
  return <p key={key}>{inline(node.content, ctx)}</p>;
}

function heading(node: Rec, key: number, ctx: Ctx): ReactNode {
  const attrs = isRec(node.attrs) ? node.attrs : {};
  const id = anchorId(attrs.anchor, ctx);
  const content = inline(node.content, ctx);
  return attrs.level === 3 ? (
    <h3 key={key} id={id}>
      {content}
    </h3>
  ) : (
    <h2 key={key} id={id}>
      {content}
    </h2>
  );
}

/** A list item: a one-paragraph item renders its text straight in the <li>. */
function listItem(node: Rec, key: number, ctx: Ctx): ReactNode {
  const children = list(node.content).filter(isRec);
  let first = true;
  return (
    <li key={key}>
      {children.map((child, i) => {
        if (child.type === 'paragraph') {
          if (first) {
            first = false;
            return <Fragment key={i}>{inline(child.content, ctx)}</Fragment>;
          }
          return paragraph(child, i, ctx);
        }
        if (child.type === 'bulletList' || child.type === 'orderedList') return listBlock(child, i, ctx);
        return null;
      })}
    </li>
  );
}

function listBlock(node: Rec, key: number, ctx: Ctx): ReactNode {
  const items = list(node.content)
    .filter(isRec)
    .filter((i) => i.type === 'listItem')
    .map((item, i) => listItem(item, i, ctx));
  if (items.length === 0) return null;
  if (node.type === 'orderedList') {
    const start = posInt(isRec(node.attrs) ? node.attrs.start : null);
    return (
      <ol key={key} start={start && start !== 1 ? start : undefined}>
        {items}
      </ol>
    );
  }
  return <ul key={key}>{items}</ul>;
}

/** A cell's paragraphs: one renders as its text; more, as paragraphs. */
function cell(node: Rec, ctx: Ctx): ReactNode {
  const paras = list(node.content).filter((p) => isRec(p) && p.type === 'paragraph') as Rec[];
  if (paras.length <= 1) return paras[0] ? inline(paras[0].content, ctx) : null;
  return paras.map((p, i) => (
    <p key={i} style={{ margin: i ? '8px 0 0' : 0 }}>
      {inline(p.content, ctx)}
    </p>
  ));
}

function table(node: Rec, key: number, ctx: Ctx): ReactNode {
  const attrs = isRec(node.attrs) ? node.attrs : {};
  const rows = list(node.content).filter((r) => isRec(r) && r.type === 'tableRow') as Rec[];
  if (rows.length === 0) return null;
  const [head, ...body] = rows;
  const columns = list(head.content)
    .filter(isRec)
    .map((c) =>
      list(c.content)
        .filter(isRec)
        .map((p) => inlineText(list(p.content) as DocInlineNode[], ctx.values))
        .join(' ')
        .trim(),
    );
  const cells = body.map((r) => list(r.content).filter(isRec).map((c) => cell(c, ctx)));
  const caption = str(attrs.caption).trim() || columns.join(', ');
  return <LegalTable key={key} caption={caption} columns={columns} rows={cells} />;
}

function image(node: Rec, key: number): ReactNode {
  const a = isRec(node.attrs) ? node.attrs : {};
  const src = str(a.src);
  // A missing asset is served with src null: the image is left out, never an error.
  if (!src || !/^(https?:\/\/|\/)/.test(src)) return null;
  const width = posInt(a.width) ?? undefined;
  const height = posInt(a.height) ?? undefined;
  const caption = str(a.caption).trim();
  const credit = str(a.credit).trim();
  return (
    <figure key={key} className="my-8 max-w-[68ch]">
      {/* eslint-disable-next-line @next/next/no-img-element -- API-resolved media with its own srcset */}
      <img
        src={src}
        srcSet={str(a.srcSet) || undefined}
        sizes="(min-width: 1024px) 680px, 100vw"
        width={width}
        height={height}
        alt={str(a.alt)}
        loading="lazy"
        decoding="async"
        className="block h-auto w-full rounded-[8px]"
      />
      {caption || credit ? (
        <figcaption className="t-small mt-2 text-fg-3">
          {caption}
          {caption && credit ? ' · ' : null}
          {credit}
        </figcaption>
      ) : null}
    </figure>
  );
}

function block(node: unknown, key: number, ctx: Ctx): ReactNode {
  if (!isRec(node)) return null;
  switch (node.type) {
    case 'paragraph':
      return paragraph(node, key, ctx);
    case 'heading':
      return heading(node, key, ctx);
    case 'bulletList':
    case 'orderedList':
      return listBlock(node, key, ctx);
    case 'table':
      return table(node, key, ctx);
    case 'image':
      return image(node, key);
    case 'requestForm':
      if (ctx.requestFormShown || !ctx.requestForm) return null;
      ctx.requestFormShown = true;
      return <Fragment key={key}>{ctx.requestForm}</Fragment>;
    default:
      return null;
  }
}

/** The H2s a document renders (the custom template uses the contents list from two). */
export function countH2(doc: SiteDoc | null | undefined): number {
  return list(doc?.content).filter((n) => isRec(n) && n.type === 'heading' && isRec(n.attrs) && n.attrs.level !== 3)
    .length;
}

export function LegalDocument({
  doc,
  values,
  profile = 'simple',
  islands,
}: {
  doc: SiteDoc;
  /** The revision's liveValues (legal) or the API's values (custom pages). */
  values: LiveValues;
  /** The document's profile (§4.4): which reserved anchor it may use. */
  profile?: DocProfile;
  islands?: LegalIslands;
}) {
  const services = values['cookies.servicesInUse'] ?? '';
  const ctx: Ctx = {
    values,
    cookieSettings: services.trim() ? islands?.cookieSettings : undefined,
    requestForm: islands?.requestForm,
    requestFormShown: false,
    ids: new Set(),
    allowIds: profile === 'privacy-en' || profile === 'privacy-hi' ? ['cookies'] : [],
  };
  return <>{list(doc?.content).map((node, i) => block(node, i, ctx))}</>;
}

/**
 * A legal page: LegalShell (the H1, "Updated …", the summary, the
 * breadcrumbs and, on the two notices, the dated "We updated this notice"
 * line) around the document, all from the API's answer and its recorded
 * values. The route files are thin: `getLegalDoc(key)` → this.
 */
export function LegalPage({
  doc,
  breadcrumbs,
  islands,
  showUpdated = true,
}: {
  doc: LegalDoc;
  /** /privacy/hi and /privacy/requests (B-9); the last item is the current page. */
  breadcrumbs?: { name: string; href?: string; lang?: string }[];
  islands?: LegalIslands;
  /** /privacy/requests shows no date. */
  showUpdated?: boolean;
}) {
  const { content, liveValues: values, lang } = doc;
  const summary = inlineText(content.summary, values).trim();
  const notice =
    doc.notice && (doc.key === 'privacy' || doc.key === 'privacy-hi') ? (
      <NoticeLine
        kind="notice"
        lang={lang}
        date={doc.notice.materialAt}
        summary={lang === 'hi' ? doc.notice.summaryHi : doc.notice.summaryEn}
        until={doc.notice.showUntil}
      />
    ) : null;
  // `notice` is LegalShell's M7.5 prop (W6; addendum §5.6, plan Appendix A:
  // rendered as PageHead children). Until it lands, the shell ignores it.
  // The other language's notice, as a button in the head (owner, 6 Nov 2026:
  // the footer no longer lists the Hindi notice).
  const switchTo =
    doc.key === 'privacy'
      ? { href: '/privacy/hi', label: 'हिंदी में पढ़ें', lang: 'hi' as const, title: 'Read this notice in Hindi' }
      : doc.key === 'privacy-hi'
        ? { href: '/privacy', label: 'Read in English', lang: 'en' as const, title: 'यह सूचना अंग्रेज़ी में पढ़ें' }
        : undefined;
  const shell = {
    title: content.title,
    updated: showUpdated ? legalUpdatedLabel(doc.revision, lang) || undefined : undefined,
    summary: summary || undefined,
    lang,
    breadcrumbs,
    notice,
    switchTo,
  };
  return (
    <LegalShell {...shell}>
      <LegalDocument doc={content.body} values={values} profile={LEGAL_PROFILES[doc.key]} islands={islands} />
    </LegalShell>
  );
}

/** The document profile of a legal key. */
export const legalProfile = (key: LegalKey): DocProfile => LEGAL_PROFILES[key];
