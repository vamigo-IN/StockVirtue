/** A listed company found in a piece of text. */
export interface StockMatch {
  exchange: 'NSE';
  symbol: string;
  name: string;
  /** How it was found: the company's name, its ticker, or a staff alias. */
  via: 'name' | 'symbol' | 'alias';
}

export interface AliasRule {
  /** Normalised phrase (see phraseKey). */
  alias: string;
  /** null = never treat this phrase as a company. */
  symbol: string | null;
}

/** Words dropped from the end of company names ("Infosys Limited" → "Infosys"). */
const LEGAL = new Set([
  'limited',
  'ltd',
  'pvt',
  'private',
  'plc',
  'inc',
  'incorporated',
]);
/** A name never ends on one of these once "India" is dropped ("Bank of India"). */
const LINKERS = new Set(['of', 'and', 'for', 'the', 'de', 'in']);

/**
 * Words too common to identify a company on their own. A one-word company
 * name only matches when it is distinctive ("Infosys", "Wipro"); everything
 * else needs at least two words, a ticker in capitals, or an alias.
 */
const COMMON = new Set(
  (
    'about above after again against alpha amber apex apollo asian assets atlas ' +
    'auto bank banks basic bharat black blue board bombay bright build capital ' +
    'carbon central century chemical chemicals choice city classic coal coastal ' +
    'coffee commercial company companies consumer cotton credit crown crystal ' +
    'delta digital diamond eastern eagle earth economy electric electronics elite ' +
    'emerald energy engineering enterprise enterprises equity everest excel ' +
    'export exports express fashion federal finance financial first force fortune ' +
    'future futures garden general glass global globe golden grand great green ' +
    'growth health heritage himalaya holdings home hotel hotels house housing ' +
    'ideal impact india indian industrial industries infra info insurance ' +
    'international invest investment investments jewel kingdom labs laboratories ' +
    'land leader liberty life light lotus magnum majestic market marine matrix ' +
    'media mercury metal metals metro modern money motor motors national nature ' +
    'network northern nova ocean omega orient oriental paper paints pearl pioneer ' +
    'plastic plastics popular power premier prime prism quality radiant rapid ' +
    'regal reliance resources retail rice royal rubber safari savings security ' +
    'select service services shipping sigma silk silver simple smart solar ' +
    'solutions sound southern special speed standard star state steel sterling ' +
    'stock stocks sugar summit sunrise super supreme swift systems tata tech ' +
    'technologies technology textile textiles tiger total trade trading travel ' +
    'trust tyre tyres ultra union unique united universal urban valley value ' +
    'venture ventures vision water wealth western white wind world'
  ).split(' '),
);

/** Capitalised words in headlines that are tickers but almost never mean the company. */
const SYMBOL_STOP = new Set(['BSE', 'NSE', 'MCX', 'IDEA', 'RBI', 'SEBI']);

/** "L&T", "Dr. Reddy's" → ["l", "and", "t"], ["dr", "reddys"]. */
export function phraseTokens(s: string): string[] {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]s\b/g, 's')
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The stored form of an alias phrase. */
export function phraseKey(s: string): string {
  return phraseTokens(s).join(' ');
}

function nameVariants(name: string): string[][] {
  let t = phraseTokens(name);
  while (t.length > 1 && LEGAL.has(t[t.length - 1])) t = t.slice(0, -1);
  if (t.length > 1 && t[0] === 'the') t = t.slice(1);
  const out = [t];
  if (
    t.length >= 2 &&
    t[t.length - 1] === 'india' &&
    !LINKERS.has(t[t.length - 2])
  ) {
    out.push(t.slice(0, -1));
  }
  return out.filter(distinctive);
}

function distinctive(t: string[]): boolean {
  if (t.length === 0) return false;
  if (t.length >= 2) return t.some((w) => w.length >= 3);
  return t[0].length >= 5 && !COMMON.has(t[0]) && !/^\d/.test(t[0]);
}

interface Hit {
  symbol: string | null;
  via: 'name' | 'alias';
}
interface TrieNode {
  next: Map<string, TrieNode>;
  hit?: Hit;
}

/**
 * Finds listed companies in headlines and summaries: full company names
 * (legal suffixes dropped), staff aliases ("RIL" → RELIANCE), and tickers
 * written in capitals ("INFY"). Aliases win over names, and a "never match"
 * alias blocks a phrase entirely. Matches are suggestions for a person to
 * confirm, never facts on their own.
 */
export class StockMatcher {
  private readonly root: TrieNode = { next: new Map() };
  private readonly names = new Map<string, string>();

  constructor(
    companies: Iterable<[symbol: string, name: string]>,
    aliases: readonly AliasRule[],
  ) {
    for (const [symbol, name] of companies) {
      const sym = symbol.toUpperCase();
      this.names.set(sym, name);
      for (const tokens of nameVariants(name)) {
        this.insert(tokens, { symbol: sym, via: 'name' }, false);
      }
    }
    for (const a of aliases) {
      const tokens = a.alias.split(' ').filter(Boolean);
      if (tokens.length === 0) continue;
      const symbol = a.symbol?.toUpperCase() ?? null;
      // An alias to a company that isn't listed (any more) is ignored.
      if (symbol && !this.names.has(symbol)) continue;
      this.insert(tokens, { symbol, via: 'alias' }, true);
    }
  }

  get size(): number {
    return this.names.size;
  }

  nameOf(symbol: string): string | null {
    return this.names.get(symbol.toUpperCase()) ?? null;
  }

  private insert(tokens: string[], hit: Hit, override: boolean) {
    let node = this.root;
    for (const t of tokens) {
      let next = node.next.get(t);
      if (!next) {
        next = { next: new Map() };
        node.next.set(t, next);
      }
      node = next;
    }
    if (override || !node.hit) node.hit = hit;
  }

  match(text: string, max = 8): StockMatch[] {
    const found = new Map<string, StockMatch>();
    const add = (symbol: string, via: StockMatch['via']) => {
      if (found.size >= max || found.has(symbol)) return;
      const name = this.names.get(symbol);
      if (name) found.set(symbol, { exchange: 'NSE', symbol, name, via });
    };

    // Names and aliases: longest phrase at each position.
    const tokens = phraseTokens(text);
    for (let i = 0; i < tokens.length; ) {
      let node: TrieNode | undefined = this.root;
      let best: { hit: Hit; end: number } | null = null;
      for (let j = i; j < tokens.length; j++) {
        node = node.next.get(tokens[j]);
        if (!node) break;
        if (node.hit) best = { hit: node.hit, end: j + 1 };
      }
      if (best) {
        if (best.hit.symbol) add(best.hit.symbol, best.hit.via);
        i = best.end;
      } else {
        i++;
      }
    }

    // Tickers in capitals ("INFY", "M&M"), unless the whole text shouts.
    const letters = text.replace(/[^A-Za-z]/g, '');
    const upper = letters.replace(/[^A-Z]/g, '').length;
    if (letters.length === 0 || upper / letters.length < 0.6) {
      for (const raw of text.match(/[A-Za-z0-9&-]+/g) ?? []) {
        if (raw.length < 3 || !/^[A-Z][A-Z0-9&-]+$/.test(raw)) continue;
        if (SYMBOL_STOP.has(raw)) continue;
        if (this.names.has(raw)) add(raw, 'symbol');
      }
    }
    return [...found.values()];
  }
}

/**
 * Starting aliases: common nicknames in Indian business news, plus phrases
 * that contain a company's name without meaning it (the RBI is not Bank of
 * India). Staff can remove any of them.
 */
export const DEFAULT_ALIASES: { label: string; symbol: string | null }[] = [
  { label: 'Reserve Bank of India', symbol: null },
  { label: 'RIL', symbol: 'RELIANCE' },
  { label: 'SBI', symbol: 'SBIN' },
  { label: 'HUL', symbol: 'HINDUNILVR' },
  { label: 'L&T', symbol: 'LT' },
  { label: 'M&M', symbol: 'M&M' },
  { label: 'Airtel', symbol: 'BHARTIARTL' },
  { label: 'LIC', symbol: 'LICI' },
  { label: 'Kotak Bank', symbol: 'KOTAKBANK' },
  { label: 'HCL Tech', symbol: 'HCLTECH' },
  { label: 'Sun Pharma', symbol: 'SUNPHARMA' },
  { label: "Dr Reddy's", symbol: 'DRREDDY' },
  { label: 'Adani Ports', symbol: 'ADANIPORTS' },
  { label: 'Power Grid', symbol: 'POWERGRID' },
  { label: 'UltraTech', symbol: 'ULTRACEMCO' },
  { label: 'IOCL', symbol: 'IOC' },
  { label: 'DMart', symbol: 'DMART' },
  { label: 'Paytm', symbol: 'PAYTM' },
  { label: 'Nykaa', symbol: 'NYKAA' },
  { label: 'Britannia', symbol: 'BRITANNIA' },
  { label: 'Maruti', symbol: 'MARUTI' },
  { label: 'Titan', symbol: 'TITAN' },
  { label: 'Hindalco', symbol: 'HINDALCO' },
  { label: 'Grasim', symbol: 'GRASIM' },
  { label: 'Eicher', symbol: 'EICHERMOT' },
];
