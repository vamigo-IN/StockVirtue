import type { ReactNode } from 'react';
import { clsx } from 'clsx';

/**
 * The frame of a teaching diagram (spec §6.8): a <figure> with the label
 * "Diagram" (`label`, `--sv-fg-3`), the diagram's name (`title`), the
 * drawing with its HTML labels (`children`, from the diagram's `Drawing`),
 * an optional actions row (DiagramPlayer puts Replay there) and the
 * caption sentence. Diagrams show no prices and no axis numbers (R5).
 *
 * The name is a heading when `headingLevel` is given (h3 under a chapter or
 * a RuleHead h2; additive, Appendix A has no level here), otherwise a <p>.
 * The figure is labelled by the name. Server-safe: no hooks, so it renders
 * on the server and inside DiagramPlayer alike. Classes are joined with
 * clsx, not tailwind-merge (about 8 KB gzip kept out of the initial JS of
 * /features and Learn; spec §6.10).
 */
export function DiagramFrame({
  name,
  caption,
  children,
  headingLevel,
  actions,
  id,
  className,
}: {
  name: string;
  caption: ReactNode;
  children: ReactNode;
  headingLevel?: 'h2' | 'h3';
  /** Under the drawing, above the caption (DiagramPlayer: Replay). */
  actions?: ReactNode;
  /** The name's id (the figure's aria-labelledby); one is made from it otherwise. */
  id?: string;
  className?: string;
}) {
  const nameId = id ?? `diagram-${slug(name)}`;
  const Name = headingLevel ?? 'p';
  return (
    <figure className={clsx('sv-diagram', className)} aria-labelledby={nameId}>
      <p className="t-label text-fg-3">Diagram</p>
      <Name id={nameId} className="t-title mt-1 text-fg">
        {name}
      </Name>
      <div className="sv-diagram-drawing">{children}</div>
      {actions ? <div className="sv-diagram-actions">{actions}</div> : null}
      <figcaption className="t-small mt-3 text-fg-2">{caption}</figcaption>
    </figure>
  );
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}
