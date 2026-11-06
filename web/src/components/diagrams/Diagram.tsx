import { DiagramPlayer } from './DiagramPlayer';
import type { DiagramEntry } from './types';

/**
 * A teaching diagram as a server page renders it (spec §6.8):
 * `<Diagram entry={DIAGRAMS['stop-loss']} page="features" />`.
 *
 * Server-safe (no directive, no hooks). The drawing renders HERE, on the
 * server, and reaches the client player only as `children` (RSC payload), so
 * the drawings never ship as client JS; the player finds the animation by id
 * in `animations.ts`. Only DiagramPlayer (about 2 KB) and the animate
 * functions are client code.
 */
export function Diagram({
  entry,
  page,
  headingLevel = 'h3',
}: {
  entry: DiagramEntry;
  page: 'features' | 'learn';
  headingLevel?: 'h2' | 'h3';
}) {
  const { Drawing } = entry;
  return (
    <DiagramPlayer id={entry.id} name={entry.name} caption={entry.captions[page]} headingLevel={headingLevel}>
      <Drawing />
    </DiagramPlayer>
  );
}
