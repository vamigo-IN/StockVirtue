// One-off generator: turns the academy-content-authoring workflow JSON into
// Dart `const _xModule = LessonModule(...)` declarations for the mobile app.
// Run: node scripts/gen-lessons.js <output.json> > lessons.gen.dart
const fs = require('fs');

const SRC = process.argv[2];
const raw = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const result = raw.result;

// Per-module + per-lesson presentation metadata (icons/tints/titles/blurbs).
const MODULES = {
  foundations: {
    varName: '_foundationsModule',
    title: 'Market foundations',
    blurb: 'How the market actually works — start here.',
    lessons: {
      what_is_stock: { title: 'What is a stock?', blurb: 'Ownership, listing, and what moves a price.', icon: 'Icons.account_balance_outlined', tint: '0xFF22C55E' },
      exchanges_indices: { title: 'Exchanges & indices', blurb: 'NSE, BSE, NIFTY, SENSEX & Bank Nifty.', icon: 'Icons.account_tree_outlined', tint: '0xFF06B6D4' },
      market_cap: { title: 'Market cap tiers', blurb: 'Large, mid & small-cap — and why size means risk.', icon: 'Icons.straighten', tint: '0xFF6366F1' },
    },
  },
  sectors: {
    varName: '_sectorsModule',
    title: 'Know your sectors',
    blurb: 'Why IT, banks, FMCG & autos move differently.',
    lessons: {
      sector_it: { title: 'IT & tech', blurb: 'The export engine and the rupee.', icon: 'Icons.memory', tint: '0xFF6366F1' },
      sector_banking: { title: 'Banks & financials', blurb: 'How banks earn; private vs public.', icon: 'Icons.account_balance', tint: '0xFF22C55E' },
      sector_fmcg: { title: 'FMCG & consumer', blurb: 'Defensive demand and everyday brands.', icon: 'Icons.shopping_basket_outlined', tint: '0xFFEC4899' },
      sector_auto: { title: 'Autos', blurb: 'Cyclical demand and the EV shift.', icon: 'Icons.directions_car_outlined', tint: '0xFFF59E0B' },
      sector_energy: { title: 'Energy, metals & pharma', blurb: 'Commodity cycles and defensive pharma.', icon: 'Icons.bolt', tint: '0xFF06B6D4' },
    },
  },
  orders: {
    varName: '_ordersModule',
    title: 'Orders & execution',
    blurb: 'Place trades the right way.',
    lessons: {
      order_types: { title: 'Market, limit & stop', blurb: 'Pick the right order for the job.', icon: 'Icons.tune', tint: '0xFF8B5CF6' },
      product_types: { title: 'Intraday vs delivery', blurb: 'CNC vs MIS — holding vs same-day.', icon: 'Icons.event_repeat', tint: '0xFF22C55E' },
    },
  },
  derivatives: {
    varName: '_derivativesModule',
    title: 'Futures & options',
    blurb: 'Leverage, calls & puts — handle with care.',
    lessons: {
      futures_basics: { title: 'Futures basics', blurb: 'Lots, margin and leverage.', icon: 'Icons.trending_up', tint: '0xFFF59E0B' },
      options_basics: { title: 'Calls & puts', blurb: 'Rights, premium, CE vs PE.', icon: 'Icons.call_split', tint: '0xFF8B5CF6' },
    },
  },
};

// Dart single-quoted string escaping.
function dq(s) {
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/\$/g, '\\$').replace(/'/g, "\\'") + "'";
}

function emitCard(card, tint) {
  if (card.type === 'note') {
    return `        LessonNote(\n          heading: ${dq(card.heading)},\n          body: ${dq(card.body)},\n        ),`;
  }
  if (card.type === 'example') {
    return `        LessonExample(\n          heading: ${dq(card.heading)},\n          body: ${dq(card.body)},\n          icon: Icons.insights,\n          tint: Color(${tint}),\n        ),`;
  }
  if (card.type === 'quiz') {
    const opts = card.options.map((o) => `            ${dq(o)},`).join('\n');
    return `        LessonQuiz(\n          question: ${dq(card.question)},\n          options: [\n${opts}\n          ],\n          correctIndex: ${card.correctIndex},\n          explanation: ${dq(card.explanation)},\n        ),`;
  }
  throw new Error('unknown card type ' + card.type);
}

function emitLesson(lesson, meta) {
  const cards = lesson.cards.map((c) => emitCard(c, meta.tint)).join('\n');
  return `      Lesson(\n        id: ${dq(lesson.id)},\n        title: ${dq(meta.title)},\n        blurb: ${dq(meta.blurb)},\n        icon: ${meta.icon},\n        tint: Color(${meta.tint}),\n        cards: [\n${cards}\n        ],\n      ),`;
}

let out = '// GENERATED from the academy-content-authoring workflow. Lessons are\n// anchored on real Indian companies; numbers are illustrative, not advice.\n// Edit the workflow + re-run scripts/gen-lessons.js to regenerate.\n\n';

for (const entry of result) {
  const mod = MODULES[entry.module];
  if (!mod) throw new Error('no metadata for module ' + entry.module);
  const lessons = entry.data.lessons
    .map((l) => {
      const lm = mod.lessons[l.id];
      if (!lm) throw new Error('no metadata for lesson ' + l.id);
      return emitLesson(l, lm);
    })
    .join('\n');
  out += `const ${mod.varName} = LessonModule(\n  id: ${dq(entry.module)},\n  title: ${dq(mod.title)},\n  blurb: ${dq(mod.blurb)},\n  lessons: [\n${lessons}\n  ],\n);\n\n`;
}

process.stdout.write(out);
