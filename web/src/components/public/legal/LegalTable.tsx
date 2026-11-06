import type { ReactNode } from 'react';

/**
 * A table in a legal page (spec §4.13). The wrapper keeps the hooks the
 * privacy tests and readers rely on: `.legal-table`, role="region", an
 * aria-label and tabIndex={0}; headers are th scope="col". Below 640 px each
 * row restacks into a bordered block and every cell shows its column name
 * (td::before, from data-label), with explicit table roles so the semantics
 * survive the display change. No sideways scrolling, no hidden column.
 * Styles live in legal.module.css (inside LegalShell's .legal-body).
 */
export function LegalTable({
  caption,
  columns,
  rows,
}: {
  /** Names the region and the table. */
  caption: string;
  columns: string[];
  rows: ReactNode[][];
}) {
  return (
    <div
      className="legal-table"
      role="region"
      aria-label={caption}
      tabIndex={0}
      data-stack=""
    >
      <table role="table">
        <caption className="sr-only">{caption}</caption>
        <thead role="rowgroup">
          <tr role="row">
            {columns.map((c) => (
              <th key={c} scope="col" role="columnheader">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup">
          {rows.map((cells, r) => (
            <tr key={r} role="row">
              {cells.map((cell, i) => (
                <td key={i} role="cell" data-label={columns[i]}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
