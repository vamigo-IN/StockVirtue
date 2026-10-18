/// Parsing + clean-up for NSE's official listed-company files, shared by the
/// runtime CompanyDirectoryService and scripts/gen-company-directory.ts (which
/// bakes the offline snapshot). Pure functions — no I/O.
///
///   Mainboard: https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv
///     SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE
///   SME:       https://nsearchives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv
///     SYMBOL,NAME_OF_COMPANY,SERIES,DATE_OF_LISTING,PAID_UP_VALUE,ISIN_NUMBER,FACE_VALUE,

export interface CompanyRecord {
  /** NSE ticker, e.g. "KOTAKBANK" (no "-EQ" suffix). */
  symbol: string;
  /** Display name, e.g. "Kotak Mahindra Bank". */
  name: string;
  /** Listing date as YYYY-MM-DD, or null when NSE didn't give a parseable one. */
  listedOn: string | null;
  /** True for NSE Emerge (SME platform) listings. */
  sme: boolean;
}

const MONTHS: Record<string, string> = {
  JAN: '01',
  FEB: '02',
  MAR: '03',
  APR: '04',
  MAY: '05',
  JUN: '06',
  JUL: '07',
  AUG: '08',
  SEP: '09',
  OCT: '10',
  NOV: '11',
  DEC: '12',
};

/// "06-OCT-2008" (mainboard) or "12-Oct-26" (SME) → "2008-10-06" / "2026-10-12".
export function parseNseDate(raw: string): string | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2}|\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const month = MONTHS[m[2].toUpperCase()];
  if (!month) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${month}-${m[1].padStart(2, '0')}`;
}

/// Minimal RFC-4180 line splitter (NSE quotes names that contain commas).
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === ',' && !quoted) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

// Words that stay lower-case / fixed when an ALL-CAPS name is title-cased.
const LOWER_WORDS = new Set(['AND', 'OF', 'FOR', 'IN', 'ON', 'AT', 'TO']);
const FIXED_WORDS: Record<string, string> = {
  INDIA: 'India',
  '(INDIA)': '(India)',
  THE: 'The',
};

function titleCaseWord(word: string, index: number): string {
  if (FIXED_WORDS[word]) return FIXED_WORDS[word];
  if (index > 0 && LOWER_WORDS.has(word)) return word.toLowerCase();
  // Short all-letter words are usually acronyms (ICICI, NTPC, BIL, WAM) —
  // keep them as-is. So are words containing digits or '&'.
  const letters = word.replace(/[^A-Z]/g, '');
  if (letters.length <= 3 || /[0-9&]/.test(word)) return word;
  return word
    .toLowerCase()
    .replace(
      /(^|[\s\-(./])([a-z])/g,
      (_, p: string, c: string) => p + c.toUpperCase(),
    );
}

/// "Kotak Mahindra Bank Limited" → "Kotak Mahindra Bank";
/// "ETERNAL LIMITED" → "Eternal"; collapses NSE's stray double spaces.
export function cleanCompanyName(raw: string): string {
  let name = raw.replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim();
  name = name.replace(/[\s,]+(limited|ltd)\.?$/i, '').trim();
  const hasLower = /[a-z]/.test(name);
  if (!hasLower && /[A-Z]{4,}/.test(name)) {
    name = name
      .split(' ')
      .map((w, i) => titleCaseWord(w, i))
      .join(' ');
  }
  return name;
}

export function parseNseEquityList(csv: string, sme: boolean): CompanyRecord[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toUpperCase());
  const col = (...names: string[]) =>
    header.findIndex((h) => names.includes(h.replace(/[\s_]+/g, ' ')));
  const iSym = col('SYMBOL');
  const iName = col('NAME OF COMPANY');
  const iDate = col('DATE OF LISTING');
  if (iSym < 0 || iName < 0) return [];
  const out: CompanyRecord[] = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const symbol = cells[iSym]?.toUpperCase();
    const rawName = cells[iName];
    if (!symbol || !rawName) continue;
    out.push({
      symbol,
      name: cleanCompanyName(rawName),
      listedOn: iDate >= 0 ? parseNseDate(cells[iDate] ?? '') : null,
      sme,
    });
  }
  return out;
}
