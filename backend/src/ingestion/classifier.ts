import type { NewsSourceType } from '@prisma/client';

/**
 * Rule-based topic labels for incoming items. Explainable and free, so they
 * work with the AI assistant switched off; editors see them as suggestions.
 */
export const TOPICS = {
  ipo: /\bipos?\b|\blisting (?:gains?|day|price)\b|\bprice band\b|\bgrey market premium\b|\bgmp\b|\banchor investors?\b|\bdrhp\b|\bred herring\b|\bsubscription status\b/i,
  results:
    /\bq[1-4](?:\s?fy\s?\d{2,4})?\b|\b(?:quarterly|annual|half-year(?:ly)?|financial) (?:results|earnings|numbers)\b|\bnet profit\b|\bprofit (?:rises|falls|jumps|drops|surges|slumps|declines)\b|\brevenue\b|\bearnings\b|\bebitda\b/i,
  corporate_action:
    /\bdividends?\b|\bbonus (?:issue|shares?)\b|\bstock split\b|\bbuy-?back\b|\brecord date\b|\brights issue\b/i,
  deals:
    /\bacquir(?:e|es|ed|ing)\b|\bacquisitions?\b|\bmergers?\b|\bstake\b|\btakeover\b|\bjoint venture\b|\bdeal\b/i,
  policy:
    /\brbi\b|\brepo rate\b|\bmonetary policy\b|\bmpc\b|\bsebi\b|\bcirculars?\b|\bregulat(?:or|ion|ions|ory)\b|\bgst\b|\bunion budget\b|\bfinance ministry\b|\bnotification\b/i,
  economy:
    /\bgdp\b|\binflation\b|\bcpi\b|\bwpi\b|\biip\b|\bpmi\b|\bfiscal deficit\b|\btrade deficit\b|\bforex reserves\b|\bunemployment\b/i,
  commodities:
    /\bcrude\b|\bbrent\b|\b(?:gold|silver)\b(?!\s+(?:loans?|bonds?|finance))|\bcopper\b|\bnatural gas\b|\bmcx\b|\baluminium\b|\bzinc\b|\bcommodit(?:y|ies)\b/i,
  currency:
    /\brupee\b|\binr\b|\busd\/inr\b|\bdollar index\b|\bforex\b|\bcurrenc(?:y|ies)\b/i,
  global:
    /\bwall street\b|\bdow jones\b|\bnasdaq\b|\bs&p 500\b|\bus fed\b|\bfederal reserve\b|\bglobal markets\b|\basian markets\b|\bnikkei\b|\bhang seng\b|\bftse\b/i,
  markets:
    /\bsensex\b|\bnifty\b|\bstock market\b|\bmarket (?:close|closing|wrap|update|outlook)\b|\bstocks to watch\b|\bshares\b/i,
} as const;
export type Topic = keyof typeof TOPICS;

const SOURCE_TOPICS: Partial<Record<NewsSourceType, Topic>> = {
  RBI: 'policy',
  SEBI: 'policy',
  GOVERNMENT: 'policy',
};

export function classify(
  text: string,
  sourceType: NewsSourceType,
  feedCategories: readonly string[] = [],
): Topic[] {
  const blob = `${text}\n${feedCategories.join(' ')}`;
  const topics = new Set<Topic>();
  const fromSource = SOURCE_TOPICS[sourceType];
  if (fromSource) topics.add(fromSource);
  for (const [topic, re] of Object.entries(TOPICS) as [Topic, RegExp][]) {
    if (re.test(blob)) topics.add(topic);
  }
  return [...topics].slice(0, 4);
}

/** Words that, in a category's slug or name, make it the home for a topic. */
const CATEGORY_HINTS: Record<Topic, string[]> = {
  ipo: ['ipo'],
  results: ['earning', 'result', 'compan', 'corporate'],
  corporate_action: ['corporate', 'compan'],
  deals: ['deal', 'corporate', 'compan'],
  policy: ['policy', 'regulat', 'econom'],
  economy: ['econom'],
  commodities: ['commodit'],
  currency: ['currenc', 'forex'],
  global: ['global', 'world', 'international'],
  markets: ['market', 'stock'],
};

/** The source's default category, else the first active category fitting a topic. */
export function suggestCategory(
  topics: readonly Topic[],
  categories: readonly { id: string; slug: string; name: string }[],
  sourceDefault: string | null,
): string | null {
  if (sourceDefault) return sourceDefault;
  for (const topic of topics) {
    for (const hint of CATEGORY_HINTS[topic]) {
      const hit = categories.find(
        (c) =>
          c.slug.toLowerCase().includes(hint) ||
          c.name.toLowerCase().includes(hint),
      );
      if (hit) return hit.id;
    }
  }
  return null;
}
