/**
 * Decorative drifting green "aurora" orbs for light sections / page-heads.
 * Pure CSS animation (frozen under reduced motion via globals.css), aria-hidden.
 */
export function GlowField({ dense = false }: { dense?: boolean }) {
  return (
    <div className="glow-field" aria-hidden="true">
      <span className="glow-orb a" />
      <span className="glow-orb b" />
      {dense && <span className="glow-orb c" />}
    </div>
  );
}
