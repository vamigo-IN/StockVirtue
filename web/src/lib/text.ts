/**
 * Ends a sentence with exactly one full stop. Names such as
 * "Vamigo Media (OPC) Pvt. Ltd." already end in one, so appending "." to
 * them printed "Ltd.." (spec §4.13).
 */
export function withFullStop(s: string): string {
  const t = s.trimEnd();
  return t.endsWith('.') ? t : `${t}.`;
}
