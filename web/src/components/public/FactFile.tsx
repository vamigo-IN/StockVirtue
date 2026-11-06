import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A fact file (spec §4.11): a real <table>. An optional caption (`title`
 * at 16/22, 700, left-aligned), a 2 px `--sv-fg` rule on top, then rows of
 * `th scope="row"` (`small`, `--sv-fg-2`, 40% wide) and `td` (`body`,
 * `--sv-fg`) with hairlines between them. At most 8 rows (the first 8 are
 * shown). Values come from src/content/app.ts (FACT_FILE_ROWS and
 * APP_FACTS), never typed into a page. Server component.
 *
 * Without a caption, give the table a name some other way
 * (`aria-label`), unless a heading right above it names it.
 */
export function FactFile({
  caption,
  rows,
  className,
  'aria-label': ariaLabel,
}: {
  caption?: string;
  rows: { label: string; value: ReactNode }[];
  className?: string;
  'aria-label'?: string;
}) {
  return (
    <table className={cn('sv-factfile', className)} aria-label={ariaLabel}>
      {caption ? <caption>{caption}</caption> : null}
      <tbody>
        {rows.slice(0, 8).map((r) => (
          <tr key={r.label}>
            <th scope="row" className="t-small text-fg-2">
              {r.label}
            </th>
            <td className="t-body text-fg">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
