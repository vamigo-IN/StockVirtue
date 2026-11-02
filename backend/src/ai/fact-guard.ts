/**
 * Automatic checks on everything the AI writes, before a person sees it:
 *  - figures: every number in the output must appear in the material it was
 *    given (allowing for rounding), so the AI can't introduce prices, results,
 *    dates or statistics of its own;
 *  - copying: no run of 12 or more words lifted from a third-party source
 *    outside quotation marks, so drafts are original writing.
 * Sentences that fail are removed and listed for the writer; suggestions
 * that fail are withheld.
 */

/** A number as written ("1,23,456", "12.5") with its value. */
interface Figure {
  text: string;
  value: number;
  decimals: number;
}

const NUMBER = /(?<![\w.])(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d+))?(?!\d)/g;
/** Q2, FY26, H1, G20, 2nd: digits inside a word. */
const IDENT = /\b(?:[A-Za-z]+\d+[A-Za-z0-9]*|\d+(?:st|nd|rd|th))\b/g;

function figures(text: string): Figure[] {
  const out: Figure[] = [];
  for (const m of text.matchAll(NUMBER)) {
    const whole = m[1].replace(/,/g, '');
    const decimals = m[2]?.length ?? 0;
    const value = Number(decimals ? `${whole}.${m[2]}` : whole);
    if (Number.isFinite(value)) out.push({ text: m[0], value, decimals });
  }
  return out;
}

const round = (v: number, d: number) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

export class AllowedFacts {
  private readonly values: Figure[];
  private readonly lower: string;

  /**
   * @param texts the material the AI was given
   * @param dates dates it may mention (today, the source's publication time)
   */
  constructor(texts: readonly string[], dates: readonly Date[] = []) {
    const all = texts.join('\n');
    this.lower = all.toLowerCase();
    this.values = figures(all);
    for (const d of dates) {
      const ist = new Date(d.getTime() + 330 * 60_000);
      for (const v of [
        ist.getUTCDate(),
        ist.getUTCMonth() + 1,
        ist.getUTCFullYear(),
      ]) {
        this.values.push({ text: String(v), value: v, decimals: 0 });
      }
    }
  }

  private known(value: number, decimals: number): boolean {
    return this.values.some(
      (a) => a.value === value || round(a.value, decimals) === value,
    );
  }

  /** The figures in `text` that the material doesn't contain. */
  unverified(text: string): string[] {
    const bad: string[] = [];
    // Identifiers first ("FY26"): fine if written the same way, or if their
    // number appears ("2025-26" covers "FY26").
    const masked = text.replace(IDENT, (token) => {
      const digits = token.replace(/\D/g, '');
      const ok =
        this.lower.includes(token.toLowerCase()) ||
        this.known(Number(digits), 0) ||
        (digits.length === 2 && this.known(2000 + Number(digits), 0));
      if (!ok) bad.push(token);
      return ' ';
    });
    for (const f of figures(masked)) {
      if (!this.known(f.value, f.decimals)) bad.push(f.text);
    }
    return [...new Set(bad)];
  }
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** Detects runs of `n` or more words copied from a source text. */
export class CopyCheck {
  private readonly shingles = new Set<string>();

  constructor(
    source: string,
    private readonly n = 12,
  ) {
    const w = words(source);
    for (let i = 0; i + n <= w.length; i++) {
      this.shingles.add(w.slice(i, i + n).join(' '));
    }
  }

  copied(sentence: string): boolean {
    if (this.shingles.size === 0) return false;
    // Quoting someone is attribution, not copying.
    const unquoted = sentence.replace(/“[^”]*”|"[^"]*"|‘[^’]*’/g, ' | ');
    for (const part of unquoted.split('|')) {
      const w = words(part);
      for (let i = 0; i + this.n <= w.length; i++) {
        if (this.shingles.has(w.slice(i, i + this.n).join(' '))) return true;
      }
    }
    return false;
  }
}

/** A sentence ends at . ! or ? before a capital — but not after "Rs.", "Dr." and the like. */
const SENTENCE_END =
  /(?<=[.!?])(?<!\b(?:Rs|Mr|Mrs|Ms|Dr|Ltd|Co|Inc|St|No|vs|approx|est|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.)\s+(?=[A-Z“"‘(])/;

export function sentences(paragraph: string): string[] {
  return paragraph
    .split(SENTENCE_END)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface RemovedSentence {
  text: string;
  reason: 'figures' | 'copied';
  figures?: string[];
}

/** One check result, recorded with the AI job. */
export interface GuardReport {
  removed: RemovedSentence[];
  /** Suggestions withheld whole (headlines, summaries…). */
  withheld: { text: string; figures: string[] }[];
}

export const emptyReport = (): GuardReport => ({ removed: [], withheld: [] });

/** Removes failing sentences from paragraphs; drops paragraphs left empty. */
export function cleanParagraphs(
  paragraphs: readonly string[],
  facts: AllowedFacts,
  copy: CopyCheck | null,
  report: GuardReport,
): string[] {
  const out: string[] = [];
  for (const p of paragraphs) {
    const kept: string[] = [];
    for (const s of sentences(p)) {
      const bad = facts.unverified(s);
      if (bad.length) {
        report.removed.push({ text: s, reason: 'figures', figures: bad });
      } else if (copy?.copied(s)) {
        report.removed.push({ text: s, reason: 'copied' });
      } else {
        kept.push(s);
      }
    }
    if (kept.length) out.push(kept.join(' '));
  }
  return out;
}

/** A short text (headline, summary) passes whole or not at all. */
export function checkWhole(
  text: string,
  facts: AllowedFacts,
  copy: CopyCheck | null,
  report: GuardReport,
): boolean {
  const bad = facts.unverified(text);
  if (bad.length) {
    report.withheld.push({ text, figures: bad });
    return false;
  }
  if (copy?.copied(text)) {
    report.withheld.push({ text, figures: [] });
    return false;
  }
  return true;
}
