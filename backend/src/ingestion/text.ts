import { createHash } from 'node:crypto';

/** Text clean-up and matching helpers shared by the ingestion pipeline. */

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  ndash: '–',
  mdash: '—',
  lsquo: '‘',
  rsquo: '’',
  sbquo: '‚',
  ldquo: '“',
  rdquo: '”',
  bdquo: '„',
  laquo: '«',
  raquo: '»',
  hellip: '…',
  bull: '•',
  middot: '·',
  deg: '°',
  times: '×',
  divide: '÷',
  copy: '©',
  reg: '®',
  trade: '™',
  euro: '€',
  pound: '£',
  yen: '¥',
  cent: '¢',
  prime: '′',
  zwnj: '',
  zwj: '',
  lrm: '',
  rlm: '',
  shy: '',
};

export function decodeEntities(s: string): string {
  return s.replace(
    /&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z][a-z0-9]{1,31});/gi,
    (whole, e: string) => {
      if (e[0] === '#') {
        const code =
          e[1] === 'x' || e[1] === 'X'
            ? parseInt(e.slice(2), 16)
            : parseInt(e.slice(1), 10);
        const valid =
          code > 0 && code < 0x110000 && !(code >= 0xd800 && code <= 0xdfff);
        return valid ? String.fromCodePoint(code) : '';
      }
      return NAMED[e] ?? NAMED[e.toLowerCase()] ?? whole;
    },
  );
}

function stripTags(html: string): string {
  return html
    .replace(
      /<(script|style|noscript|iframe|svg|object)\b[\s\S]*?<\/\1\s*>/gi,
      ' ',
    )
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(
      /<\/(p|div|li|h[1-6]|blockquote|tr|section|article|figure)\s*>/gi,
      '\n',
    )
    .replace(/<[^>]*>/g, ' ');
}

/** Feed HTML (possibly entity-encoded twice) → plain text with paragraph breaks. */
export function htmlToText(html: string): string {
  let t = decodeEntities(stripTags(html));
  if (/<[a-z/!][^>]*>/i.test(t)) t = decodeEntities(stripTags(t));
  return t
    .replace(/[ \t\f\v\u00a0\u200b]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** One line, at most `max` characters, cut at a word with an ellipsis. */
export function oneLine(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** Plain text kept to `max` characters, cut at a paragraph or sentence where possible. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('. '));
  return `${(stop > max * 0.6 ? cut.slice(0, stop + 1) : cut).trimEnd()}…`;
}

/** Tracking parameters dropped from story links, so one story has one address. */
const TRACKING =
  /^(utm_[a-z_]+|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|yclid|_hsenc|_hsmi|mkt_tok|cmpid|ref_src|from)$/i;

/** An absolute http(s) story address without tracking parameters or fragment, or null. */
export function canonicalUrl(
  raw: string | null | undefined,
  base?: string,
): string | null {
  const s = raw?.trim();
  if (!s) return null;
  let u: URL;
  try {
    u = base ? new URL(s, base) : new URL(s);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.hash = '';
  u.username = '';
  u.password = '';
  for (const key of [...u.searchParams.keys()]) {
    if (TRACKING.test(key)) u.searchParams.delete(key);
  }
  let out = u.toString();
  if (out.endsWith('?')) out = out.slice(0, -1);
  return out.length <= 2000 ? out : null;
}

const STOPWORDS = new Set(
  (
    'a an the of in on at to for from by with and or but as is are was were be been ' +
    'being its it this that these those into over after before about amid via vs per ' +
    'cent percent says said say will would can could may might has have had new up ' +
    'down out than more most what why how who when where here there all any not no ' +
    'today report reports news update updates live s'
  ).split(' '),
);

const isNumberToken = (w: string) => /^\d/.test(w);

function stem(w: string): string {
  if (isNumberToken(w)) return w;
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss'))
    return w.slice(0, -1);
  return w;
}

/**
 * Distinct headline words for comparing stories: lower-cased, accents and
 * stopwords removed, plurals folded, numbers kept whole ("1,234.5" → "1234.5").
 */
export function titleTokens(title: string): string[] {
  const t = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/(\d),(?=\d)/g, '$1');
  const words = t.match(/\d+(?:\.\d+)?(?![a-z0-9])|[a-z0-9]+/g) ?? [];
  const out: string[] = [];
  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    if (w.length < 2 && !isNumberToken(w)) continue;
    const s = stem(w);
    if (!out.includes(s)) out.push(s);
  }
  return out;
}

export function titleKey(title: string): string {
  return titleTokens(title).join(' ').slice(0, 500);
}

/**
 * Distinct words of a passage (a headline with its summary), normalised like
 * titleTokens, at most `max`: for spotting one story told in other words.
 */
export function textTokens(text: string, max = 120): string[] {
  const t = text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/(\d),(?=\d)/g, '$1');
  const seen = new Set<string>();
  for (const w of t.match(/\d+(?:\.\d+)?(?![a-z0-9])|[a-z0-9]+/g) ?? []) {
    if (STOPWORDS.has(w) || (w.length < 2 && !isNumberToken(w))) continue;
    seen.add(stem(w));
    if (seen.size >= max) break;
  }
  return [...seen];
}

/** At or above: the same text (status DUPLICATE). */
export const DUPLICATE_TEXT_SIMILARITY = 0.75;
/** At or above: possibly the same story, told differently. */
export const POSSIBLE_TEXT_SIMILARITY = 0.4;

/** How alike two passages are (0–1, Jaccard over their words; 8 shared at least). */
export function textSimilarity(a: string[], b: Set<string>): number {
  if (a.length === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  if (shared < 8) return 0;
  return shared / (a.length + b.size - shared);
}

/** At or above: the same story (status DUPLICATE). */
export const DUPLICATE_SIMILARITY = 0.6;
/** At or above: possibly the same story (flagged for a person to judge). */
export const POSSIBLE_SIMILARITY = 0.45;

/**
 * How alike two headlines are (0–1, Jaccard over their words). Headlines that
 * carry different figures describe different events ("Sensex up 300" vs
 * "Sensex up 450"), so they score 0.
 */
export function headlineSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const na = a.filter(isNumberToken);
  const nb = b.filter(isNumberToken);
  if (na.length && nb.length) {
    const same = na.length === nb.length && na.every((n) => nb.includes(n));
    if (!same) return 0;
  }
  const B = new Set(b);
  let shared = 0;
  for (const w of new Set(a)) if (B.has(w)) shared++;
  if (shared < 3) return 0;
  return shared / (new Set(a).size + B.size - shared);
}

const TZ: Record<string, string> = {
  IST: '+0530',
  GMT: '+0000',
  UTC: '+0000',
  UT: '+0000',
  EST: '-0500',
  EDT: '-0400',
  CST: '-0600',
  CDT: '-0500',
  PST: '-0800',
  PDT: '-0700',
  BST: '+0100',
  CET: '+0100',
  CEST: '+0200',
  SGT: '+0800',
  HKT: '+0800',
  JST: '+0900',
};

/**
 * A source's publication time. Handles RFC 822 / ISO dates, zone names such
 * as "IST", and day-first Indian dates ("03-11-2026 10:30", read as IST).
 * A time in the future becomes `now`; nonsense or pre-2000 dates are dropped.
 */
const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

/** 1–12 from "11" or "Nov"/"November"; 0 when it isn't a month. */
function monthNumber(m: string): number {
  if (/^\d+$/.test(m)) {
    const n = Number(m);
    return n >= 1 && n <= 12 ? n : 0;
  }
  return MONTHS.indexOf(m.slice(0, 3).toLowerCase()) + 1;
}

export function parseSourceDate(
  raw: string | null | undefined,
  now = new Date(),
): Date | null {
  const s = raw?.trim();
  if (!s) return null;
  let at: number;
  // "02-11-2026 19:54", and "02-Nov-2026 19:54:29" (NSE, BSE): India's time.
  const dmy =
    /^(\d{1,2})[-/.](\d{1,2}|[a-z]{3,9})[-/.](\d{4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i.exec(
      s,
    );
  const month = dmy ? monthNumber(dmy[2]) : 0;
  if (dmy && month) {
    let hours = Number(dmy[4] ?? 0);
    const meridiem = dmy[7]?.toLowerCase();
    if (meridiem === 'pm' && hours < 12) hours += 12;
    if (meridiem === 'am' && hours === 12) hours = 0;
    at =
      Date.UTC(
        Number(dmy[3]),
        month - 1,
        Number(dmy[1]),
        hours,
        Number(dmy[5] ?? 0),
        Number(dmy[6] ?? 0),
      ) -
      330 * 60_000;
  } else {
    // "30 Oct, 2026 +0530" (SEBI): drop the comma, and give a date with a
    // zone but no time a midnight, or the parser rejects it.
    let t = s.replace(/^(\d{1,2}) ([A-Za-z]{3,9}),\s*(\d{4})/, '$1 $2 $3');
    if (!/\d{1,2}:\d{2}/.test(t)) {
      t = t.replace(/\s+([+-]\d{4}|[A-Z]{2,4})$/, ' 00:00 $1');
    }
    at = Date.parse(t.replace(/\b([A-Z]{2,4})$/, (z) => TZ[z] ?? z));
  }
  if (!Number.isFinite(at)) return null;
  const d = new Date(at);
  if (d.getUTCFullYear() < 2000) return null;
  return at > now.getTime() + 10 * 60_000 ? now : d;
}
