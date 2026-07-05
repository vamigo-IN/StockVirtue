import type { ReactNode } from 'react';
import { GlowField } from './GlowField';
import { Reveal } from './Reveal';
import { LegalTOC } from './LegalTOC';

/**
 * Modern document layout for the legal pages: a glow-lit head with an
 * "updated" badge + summary, then a two-column body with a sticky
 * auto-generated table of contents beside the styled prose. Pass the existing
 * prose as children (its <h2>s become the TOC entries).
 */
export function LegalShell({
  title,
  updated,
  summary,
  badge = 'Legal',
  children,
}: {
  title: string;
  updated?: string;
  summary?: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="page-head">
        <GlowField />
        <div className="container">
          <Reveal>
            <span className="eyebrow">
              <span className="dot" /> {badge}
            </span>
          </Reveal>
          <Reveal delay={0.06}>
            <h1>{title}</h1>
          </Reveal>
          {updated && (
            <Reveal delay={0.1}>
              <span className="updated-badge mono">Updated {updated}</span>
            </Reveal>
          )}
          {summary && (
            <Reveal delay={0.14}>
              <p className="lead" style={{ marginTop: 14 }}>
                {summary}
              </p>
            </Reveal>
          )}
        </div>
      </div>

      <section className="section">
        <div className="container legal-grid">
          <aside className="legal-aside">
            <LegalTOC />
          </aside>
          <Reveal className="legal-body prose">{children}</Reveal>
        </div>
      </section>
    </>
  );
}
