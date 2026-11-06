import { APP_FACTS, type FactId } from '@/content/app';
import { LIMITS, textLength, inlineLength, type FieldRule } from '@/content/site/limits';
import { collectStrings, inlineText } from './plain-text';
import { parsePath, rulePath } from './form-paths';

/**
 * The portal's copy lint (W7 addendum §8.8; spec §9.2, §9.2.1, §9.10).
 * Advisory: it runs on every change and in the publish dialogs, and never
 * blocks a publish (the hard rules are the API's). It lives in the portal
 * because it needs the product facts (src/content/app.ts).
 *
 * Legal documents are linted only where the draft differs from the live
 * text, and only for the rules that apply to legal wording (relative times,
 * loose legal words, "Ltd.."): seeded wording is never second-guessed.
 * Structured items get the per-field rules only on fields whose text differs
 * from the live page (the seed is spec §9 copy, approved word for word); the
 * page-wide rules (dashes, claims, facts, links) look at everything.
 */

export interface LintWarning {
  /** The field or block it is about ("hero.title", "body.content[3]"), or '' for the page. */
  path: string;
  message: string;
}

const RELATIVE = /\b(today|yesterday|tomorrow|tonight|ago|just now|this (?:morning|afternoon|evening|week|month))\b/i;
const FILLER =
  /\b(unlock|empower|elevate|seamless(?:ly)?|journey|level up|dive in|supercharge|game[- ]changer|cutting[- ]edge|delve|in today's fast-paced markets)\b/i;
const STOCK_PHRASES = [
  "we're on a mission",
  "let's talk",
  'your wallet is waiting',
  'see it for yourself',
  'everything you might want to know',
  'straight answers about',
  'someone on the team reads every message',
];
const LOOSE_LEGAL = /\b(risk[- ]free|zero (?:real )?risk|guaranteed)\b/i;
const ACRONYMS = new Set([
  'NSE', 'BSE', 'MCX', 'SEBI', 'STT', 'GST', 'PAN', 'KYC', 'IPO', 'IPOS', 'IST', 'UPI', 'RBI', 'DPDP', 'OTP', 'FAQ',
  'ETF', 'NAV', 'API', 'PDF', 'URL', 'GTT', 'AMC', 'CIN', 'OPC', 'LLP', 'PVT', 'LTD', 'USA', 'MD', 'CEO', 'CTO', 'SIP',
  'EOD', 'OHLC', 'MTM', 'SL', 'SLM', 'RSI', 'MACD', 'EMA', 'SMA', 'NIFTY', 'GA4', 'IOS', 'HDFC', 'TCS', 'ITC', 'SBI',
  // Names the site's own menus and notices use (the footer's "RSS feed", the notice's laws and bodies).
  'RSS', 'XML', 'HTML', 'DPO', 'EEA', 'GDPR', 'SMS', 'FCM', 'APK', 'AWS', 'TMPV',
]);

/** Words that point at a product fact (spec §9.3), for "mentions … without a tag". */
const FACT_WORDS: { re: RegExp; facts: FactId[]; word: string }[] = [
  { re: /\blessons?\b|\bquiz/i, facts: ['F9'], word: 'lessons' },
  { re: /\bbadges?\b/i, facts: ['F10'], word: 'badges' },
  { re: /\bmargin\b/i, facts: ['F6'], word: 'margin' },
  { re: /\biphone\b|\bios\b/i, facts: ['F15'], word: 'iPhone' },
  { re: /₹\s?10 lakh|10,00,000/i, facts: ['F1'], word: '₹10 lakh' },
  { re: /\bSTT\b|contract note|brokerage/i, facts: ['F5'], word: 'charges' },
  { re: /\bstop-loss\b|\btrailing stop\b/i, facts: ['F2'], word: 'order types' },
  { re: /\boption chain\b|\blot sizes?\b/i, facts: ['F4'], word: 'F&O' },
  { re: /\bby the unit\b|\bsingle units?\b/i, facts: ['F7'], word: 'commodities by the unit' },
  { re: /\btournaments?\b|\brooms?\b/i, facts: ['F11'], word: 'rooms' },
  { re: /\breferral/i, facts: ['F12'], word: 'referrals' },
];

/** The claim patterns of spec §9.2.1. */
const CLAIMS: { key: string; name: string; re: RegExp }[] = [
  { key: 'noRisk', name: 'the no-risk point', re: /virtual money|practice money|real money|real funds|cost you a rupee/i },
  { key: 'advice', name: '“not investment advice”', re: /investment advice|advice or a recommendation/i },
  { key: 'lakh', name: '₹10 lakh', re: /₹\s?10 lakh|₹\s?10,00,000/i },
  { key: 'android', name: 'Android only', re: /android only|iphone/i },
  { key: 'kyc', name: 'PAN, Aadhaar and bank details', re: /PAN, Aadhaar/i },
  { key: 'unit', name: 'commodities by the unit', re: /by the unit|single units/i },
  { key: 'charges', name: 'charges', re: /\bSTT\b|contract note/i },
  { key: 'academy', name: 'the Academy’s size', re: /17 lessons|seventeen/i },
];

/**
 * Each designed page's claim budget (spec §9.2.1), less what the page shows
 * outside this item (the footer, the shared block): the blocks this item may
 * still spend.
 */
const CLAIM_ROOM: Partial<Record<string, Partial<Record<string, number>>>> = {
  home: { noRisk: 1, advice: 0, lakh: 2, android: 0, kyc: 1, unit: 0, charges: 1, academy: 1 },
  features: { noRisk: 1, advice: 0, lakh: 1, android: 0, kyc: 1, unit: 1, charges: 2, academy: 1 },
  download: { noRisk: 1, advice: 0, lakh: 1, android: 2, kyc: 0, unit: 0, charges: 0, academy: 0 },
  about: { noRisk: 1, advice: 1, lakh: 1, android: 0, kyc: 0, unit: 0, charges: 0, academy: 0 },
  faq: { noRisk: 0, advice: 0, lakh: 0, android: 0, kyc: 0, unit: 0, charges: 0, academy: 0 },
};

/**
 * The page's blocks for the claim count (spec §9.2.1): its top-level groups
 * but `seo`. Text inside a closed `<details>` doesn't count, so the FAQ's
 * question rows are left out: each is a closed `<details>`, and a question
 * that names a claim ("Is any of this investment advice?") asks rather than
 * states it.
 */
function visibleBlocks(itemKey: string, content: Record<string, unknown>): [string, unknown][] {
  return Object.entries(content).filter(([k]) => k !== 'seo' && !(itemKey === 'faq' && k === 'groups'));
}

/**
 * Slots the fold check and the phone budgets measured (spec §9.2 "Measured
 * strings"; W1's and W2's measurements behind the final limits, M7.2b).
 */
const MEASURED: Partial<Record<string, readonly string[]>> = {
  home: ['hero.title', 'hero.lead', 'hero.smallPrint', 'stage.steps[].body', 'finalCta.line'],
  features: ['head.summary', 'chapters[].intro'],
  about: [
    'why.paragraphs[]',
    'principles.items[].body',
    'notUs.body',
    'company.product',
    'writeToUs.text',
  ],
  faq: ['groups[].items[].question'],
  download: ['head.lead'],
  contact: ['form.collectionNotice', 'aside.privacy.text', 'aside.mistake.text'],
  'wont-do': ['items[].lead', 'items[].body'],
};

const digits = (s: string) => s.replace(/(\d),(?=\d)/g, '$1');

/** Numbers, ₹ amounts, percentages and times in a text. */
function numbersIn(s: string): string[] {
  const out = new Set<string>();
  for (const m of digits(s).matchAll(/₹?\s?\d+(?:\.\d+)?(?:\s?(?:lakh|crore|%))?|\d{1,2}:\d{2}\s?(?:am|pm)?/gi)) {
    const v = m[0].replace(/\s+/g, ' ').trim();
    if (/^\d$/.test(v)) continue; // single digits are rarely facts ("1 of 3")
    out.add(v.toLowerCase());
  }
  return [...out];
}

function factNumbersMissing(text: string, facts: FactId[]): string[] {
  const pool = digits(facts.map((f) => APP_FACTS[f]?.text ?? '').join(' ')).toLowerCase();
  return numbersIn(text).filter((n) => !pool.includes(n.replace(/^₹\s?/, '').replace(/ (lakh|crore|%)$/, '')));
}

function isFact(v: unknown): v is { value: unknown; facts: FactId[]; fallback?: unknown } {
  return !!v && typeof v === 'object' && 'value' in (v as object) && Array.isArray((v as { facts?: unknown }).facts);
}

const valueText = (v: unknown) => (Array.isArray(v) ? inlineText(v) : String(v ?? ''));

function measureOf(rule: FieldRule | undefined, v: unknown): number {
  if (!rule) return 0;
  const val = isFact(v) ? v.value : v;
  return Array.isArray(val) ? inlineLength(val as { type: string; text?: unknown }[]) : textLength(String(val ?? ''));
}

function textRules(path: string, text: string, legalLocked: boolean, legal: boolean): LintWarning[] {
  const w: LintWarning[] = [];
  if (!text.trim()) return w;
  if (RELATIVE.test(text) && !legalLocked) {
    w.push({ path, message: `“${text.match(RELATIVE)![0]}” is a relative time; cached pages make it wrong. Use a date.` });
  }
  if (LOOSE_LEGAL.test(text)) w.push({ path, message: `Avoid “${text.match(LOOSE_LEGAL)![0]}”: it is a loose legal word.` });
  if (/Ltd\.\./.test(text)) w.push({ path, message: '“Ltd..” has a full stop too many.' });
  if (legal || legalLocked) return w;
  if (FILLER.test(text)) w.push({ path, message: `“${text.match(FILLER)![0]}” is filler; say the specific thing.` });
  const lower = text.toLowerCase();
  const stock = STOCK_PHRASES.find((p) => lower.includes(p));
  if (stock) w.push({ path, message: `“${stock}” is a stock phrase.` });
  if (text.includes('!')) w.push({ path, message: 'No exclamation marks.' });
  const caps = text.match(/\b[A-Z]{3,}\b/g)?.filter((x) => !ACRONYMS.has(x));
  if (caps?.length) w.push({ path, message: `“${caps[0]}” is in capitals; use sentence case.` });
  // Quotation marks only: an apostrophe inside a word ("app's", "isn't") is fine as typed.
  if (/["']/.test(text.replace(/(?<=\p{L})'(?=\p{L})/gu, ''))) {
    w.push({ path, message: 'Use typographic quotes (‘ ’ “ ”) instead of straight ones.' });
  }
  return w;
}

export interface LintOptions {
  /** The LIMITS key of the item ('home', 'wont-do', 'legal', 'custom', 'chrome'). */
  limitsKey: keyof typeof LIMITS;
  /** The item's key (for claim budgets): 'home', 'about' … */
  itemKey: string;
  kind: 'DESIGNED' | 'SHARED' | 'CHROME' | 'LEGAL' | 'CUSTOM';
  /** The live content: legal documents are linted only where they changed. */
  live?: unknown;
}

/** The warnings for an item's content (never blocking). */
export function lintContent(content: unknown, o: LintOptions): LintWarning[] {
  const rules = LIMITS[o.limitsKey] ?? {};
  const legal = o.kind === 'LEGAL';
  const out: LintWarning[] = [];
  let dashes = 0;
  const liveStrings = collectStrings(o.live);
  const liveTexts = new Set(legal ? liveStrings.map((s) => s.text) : []);
  // Structured items: a field's text as the live page shows it (the seed is approved copy).
  const liveByPath = new Map(legal ? [] : liveStrings.map((s) => [s.path, s.text] as const));
  const ruleOf = (path: string) => {
    const segs = parsePath(path);
    // A string inside a fact: its rule is the fact field's.
    for (let n = segs.length; n > 0; n--) {
      const r = rules[rulePath(segs.slice(0, n))];
      if (r) return r;
    }
    return undefined;
  };

  for (const { path, text } of collectStrings(content)) {
    if (legal && liveTexts.has(text)) continue;
    const rule = ruleOf(path);
    const locked = !!rule?.legalLocked;
    if (!locked && !legal) dashes += (text.match(/—| – /g) ?? []).length;
    // The per-field rules look at what this draft wrote: text the live page already shows is left alone.
    if (!legal && liveByPath.get(path) === text) continue;
    out.push(...textRules(path, text, locked, legal));
  }
  if (dashes > 1) {
    out.push({ path: '', message: `This page has ${dashes} dashes (— or spaced –); the style allows one. Use a full stop or a comma.` });
  }

  // Facts: numbers a fact field's facts don't state, and fact words without a tag.
  const walk = (v: unknown, path: string) => {
    if (isFact(v)) {
      const text = valueText(v.value);
      if (v.facts.length) {
        const missing = factNumbersMissing(text, v.facts);
        if (missing.length) {
          out.push({ path, message: `This says “${missing[0]}”; ${v.facts.join(', ')} ${v.facts.length > 1 ? 'don’t' : 'doesn’t'} say that. Check the fact.` });
        }
      } else {
        const hit = FACT_WORDS.find((f) => f.re.test(text));
        if (hit) out.push({ path, message: `This mentions ${hit.word} but has no fact tag (${hit.facts.join(', ')}).` });
      }
      return;
    }
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object' && (v as { type?: unknown }).type !== 'doc') {
      for (const [k, x] of Object.entries(v)) walk(x, path ? `${path}.${k}` : k);
    }
  };
  if (!legal) walk(content, '');

  // Claim budgets, counted per section of the page (spec §9.2.1).
  const room = CLAIM_ROOM[o.itemKey];
  if (room && content && typeof content === 'object') {
    const blocks = visibleBlocks(o.itemKey, content as Record<string, unknown>);
    for (const c of CLAIMS) {
      const max = room[c.key];
      if (max === undefined) continue;
      const hits = blocks.filter(([k, v]) => collectStrings(v, k).some((s) => c.re.test(s.text))).length;
      if (hits > max) out.push({ path: '', message: `${c.name} appears in ${hits} sections; this page has room for ${max} beside the footer and shared blocks.` });
    }
  }

  // External links on About: at most one.
  if (o.itemKey === 'about') {
    const ext = JSON.stringify(content).match(/"href":"https?:\/\//g)?.length ?? 0;
    if (ext > 1) out.push({ path: '', message: `About links to ${ext} other sites; keep it to one.` });
  }

  // Measured slots near their maximum, where this draft changed their text (a
  // seed may sit at its slot's maximum: the limits were measured from it).
  // Compared as visible text: the API stores content with its keys reordered.
  const shown = (v: unknown) => valueText(isFact(v) ? v.value : v);
  const liveAt = new Map<string, string>();
  for (const p of MEASURED[o.itemKey] ?? []) {
    for (const x of collectFacts(o.live, p)) liveAt.set(x.path, shown(x.value));
  }
  for (const p of MEASURED[o.itemKey] ?? []) {
    const rule = rules[p];
    const max = rule?.len?.[1];
    if (!max) continue;
    const hit = collectFacts(content, p).find(
      (x) => liveAt.get(x.path) !== shown(x.value) && measureOf(rule, x.value) >= max * 0.95,
    );
    if (hit) out.push({ path: hit.path, message: 'Near the measured maximum: check the preview at 390 px.' });
  }

  return dedupe(out);
}

/** Values at a limits path with "[]" (every item of a list). */
function collectFacts(content: unknown, p: string): { path: string; value: unknown }[] {
  const segs = parsePath(p);
  const out: { path: string; value: unknown }[] = [];
  const go = (v: unknown, i: number, path: string) => {
    if (i === segs.length) return void out.push({ path, value: v });
    const s = segs[i];
    if (s === -1) {
      if (Array.isArray(v)) v.forEach((x, j) => go(x, i + 1, `${path}[${j}]`));
      return;
    }
    if (v && typeof v === 'object') go((v as Record<string | number, unknown>)[s], i + 1, typeof s === 'number' ? `${path}[${s}]` : path ? `${path}.${s}` : String(s));
  };
  go(content, 0, '');
  return out;
}

function dedupe(list: LintWarning[]): LintWarning[] {
  const seen = new Set<string>();
  return list.filter((w) => {
    const k = `${w.path}|${w.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
