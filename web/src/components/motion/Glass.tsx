import type { ReactNode } from 'react';

/** Frosted-glass surface primitive. Below 860px / low-power the flat
 *  translucent fill in globals.css stands in for the blur. */
export function GlassPanel({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`glass${className ? ` ${className}` : ''}`} style={style}>
      {children}
    </div>
  );
}

/** Persistent honesty chip pinned to terminal / app-mock panels. */
export function SimChip({ label }: { label?: string }) {
  return (
    <span className="sim-chip">
      <span className="d" />
      {label ?? 'Simulated · virtual money · live prices'}
    </span>
  );
}
