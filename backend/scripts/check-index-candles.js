#!/usr/bin/env node
/**
 * Index chart check, for the API server. Read-only, and prints no secrets.
 *
 * Asks SmartAPI, through the backend's own compiled services (dist/), for
 * daily candles of NIFTY, BANKNIFTY, SENSEX and RELIANCE over 1 month and
 * 1 year, the way the website's charts and the app's /market/candles do.
 * For each it prints the scrip-master row the backend charts from, the
 * number of candles with the first and last dates, or SmartAPI's error
 * message and code. It also asks once each for the 1-month candles of the
 * other Nifty and Bank Nifty row: Angel lists each F&O index twice (the
 * index row, NSE 99926000 "Nifty 50", and a share-typed index code row,
 * NSE 26000 "NIFTY"), and only the index row has history.
 *
 * Run it on the server, in the backend folder, after `npm run build`:
 *
 *   cd <backend folder> && node scripts/check-index-candles.js
 *
 * - It reads the backend's .env the way the API does, and prints none of
 *   it: no API key, client code, PIN, TOTP secret, session or feed token,
 *   no JWT. Instrument tokens such as 99926000 are public scrip-master ids.
 * - It never signs in to Angel One. It reuses the session the running API
 *   keeps in Redis, stops if there is none, and never writes or deletes it.
 * - At most 10 SmartAPI calls, each paced by the backend's own rate limiter
 *   and at least 2 seconds after the previous one, so it can run beside the
 *   live API.
 * - It loads the scrip master like the API: backend/.cache/scrip-master.json
 *   when under a day old, else Angel's public file (which it saves there,
 *   as the API's daily refresh does).
 *
 * Exit code: 0 when every chart had candles, 1 otherwise, 2 when it could
 * not run (no build, no Redis, no session).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BACKEND = path.resolve(__dirname, '..');
const DIST = path.join(BACKEND, 'dist');
// The API reads .env and keeps the scrip master in .cache/, both relative
// to the backend folder.
process.chdir(BACKEND);

const MAX_CALLS = 10;
const GAP_MS = 2_000;
const IST_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
/** The website's 1M and 1Y charts (market-display/market-data.service.ts). */
const RANGES = { '1M': 24 * 35, '1Y': 24 * 370 };
/** getCandles widens an index's daily window to at least this (market.service.ts). */
const INDEX_MIN_DAYS = 90;
const SESSION_KEY = 'smartapi:session';
const SCRIP_CACHE = path.join(BACKEND, '.cache', 'scrip-master.json');

// ── Never print a secret ─────────────────────────────────────────────
const secrets = new Set();
function keepSecret(value) {
  if (typeof value === 'string' && value.length >= 6) secrets.add(value);
}
function redact(text) {
  let s = String(text);
  for (const v of secrets) s = s.split(v).join('[hidden]');
  // Anything shaped like a JWT, and long opaque strings (keys, tokens).
  s = s.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[hidden]');
  s = s.replace(/\b[A-Za-z0-9+/_-]{32,}={0,2}/g, '[hidden]');
  return s;
}
const message = (err) =>
  redact(err && err.message ? err.message : String(err)).slice(0, 300);

function out(line = '') {
  process.stdout.write(`${redact(line)}\n`);
}

function stop(code, line) {
  out(line);
  process.exit(code);
}

function load(rel) {
  const file = path.join(DIST, `${rel}.js`);
  if (!fs.existsSync(file)) {
    stop(2, `Missing dist/${rel}.js. Build the backend first: npm run build`);
  }
  return require(file);
}

/** "YYYY-MM-DD HH:mm" in IST, as SmartAPI wants it. */
function ist(ms) {
  return new Date(ms + IST_MS).toISOString().slice(0, 16).replace('T', ' ');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // The same .env the API reads; values already in the environment win, as
  // they do for the API. dotenv comes with @nestjs/config.
  const configDir = path.dirname(require.resolve('@nestjs/config/package.json'));
  const dotenv = require(require.resolve('dotenv', { paths: [configDir] }));
  dotenv.config({ path: path.join(BACKEND, '.env'), quiet: true });

  const { Logger } = require('@nestjs/common');
  const { default: configuration } = load('config/configuration');
  const { SmartApiClient } = load('smartapi/smartapi.client');
  const { SmartApiRateLimiter } = load('smartapi/smartapi.rate-limiter');
  const { SmartApiService } = load('smartapi/smartapi.service');
  const { ScripMasterService } = load('market/scrip-master.service');
  const { MarketService } = load('market/market.service');

  const cfg = configuration();
  // (The PIN is never sent or printed; this check doesn't sign in.)
  for (const key of ['apiKey', 'secret', 'clientCode', 'totpSecret']) {
    keepSecret(cfg.smartapi[key]);
  }
  keepSecret(cfg.redis.password);
  const missing = [
    ['SMARTAPI_KEY', cfg.smartapi.apiKey],
    ['SMARTAPI_CLIENT_CODE', cfg.smartapi.clientCode],
  ].filter(([, v]) => !v);
  if (missing.length) {
    stop(2, `Not set in backend/.env: ${missing.map(([k]) => k).join(', ')}.`);
  }

  // The backend's own warnings (rate limits, "no rows"), redacted.
  const print = (level) => (msg, ...rest) => {
    const ctx = rest.filter((x) => typeof x === 'string').pop();
    out(`  [${level}${ctx ? ` ${ctx}` : ''}] ${msg}`);
  };
  Logger.overrideLogger({
    log: () => {},
    debug: () => {},
    verbose: () => {},
    warn: print('warn'),
    error: print('error'),
    fatal: print('error'),
  });

  // ── Redis: read the API's session, never change it ──
  const IORedis = require('ioredis');
  const Redis = IORedis.default || IORedis;
  const where = `${cfg.redis.host || 'localhost'}:${cfg.redis.port}`;
  const redis = new Redis({
    host: cfg.redis.host || 'localhost',
    port: cfg.redis.port,
    password: cfg.redis.password || undefined,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 5_000,
    retryStrategy: () => null,
  });
  redis.on('error', () => {});
  try {
    await redis.connect();
  } catch (err) {
    stop(2, `Can't reach Redis at ${where}: ${message(err)}`);
  }
  const raw = await redis.get(SESSION_KEY);
  if (!raw) {
    await redis.quit();
    stop(
      2,
      'No SmartAPI session in Redis. Start the API (it signs in on boot) or ' +
        'wait for it to sign in, then run this again. This check never signs in.',
    );
  }
  try {
    const s = JSON.parse(raw);
    keepSecret(s.jwtToken);
    keepSecret(s.refreshToken);
    keepSecret(s.feedToken);
  } catch {
    // An unreadable session: the calls below will say so.
  }
  const sessionTtl = await redis.ttl(SESSION_KEY);
  const readOnly = {
    client: {
      get: (k) => redis.get(k),
      ttl: (k) => redis.ttl(k),
      // The API's session is shared: this check never writes or deletes it.
      set: async () => 'OK',
      del: async () => 0,
    },
  };
  // No PIN: SmartApiService can't sign in, whatever happens.
  const noLogin = {
    get: (key) => (key === 'smartapi' ? { ...cfg.smartapi, pin: '' } : cfg[key]),
  };
  const smartapi = new SmartApiService(
    noLogin,
    readOnly,
    new SmartApiClient(noLogin),
    new SmartApiRateLimiter(),
  );

  // ── Every SmartAPI candle call goes through here: budget and pacing ──
  const made = [];
  let lastAt = 0;
  const realGetCandles = smartapi.getCandles.bind(smartapi);
  smartapi.getCandles = async (req) => {
    const call = { req, error: null, skipped: false };
    made.push(call);
    if (made.filter((c) => !c.skipped).length > MAX_CALLS) {
      call.skipped = true;
      call.error = `skipped: this check makes at most ${MAX_CALLS} SmartAPI calls`;
      throw new Error(call.error);
    }
    const wait = lastAt + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await realGetCandles(req);
    } catch (err) {
      call.error = message(err);
      throw err;
    } finally {
      lastAt = Date.now();
    }
  };
  const callCount = () => made.filter((c) => !c.skipped).length;

  // ── The scrip master, loaded as the API loads it ──
  const freshCache =
    fs.existsSync(SCRIP_CACHE) &&
    Date.now() - fs.statSync(SCRIP_CACHE).mtimeMs < DAY_MS;
  const scrip = new ScripMasterService();
  await scrip.onModuleInit();
  scrip.onModuleDestroy();
  if (!scrip.isReady()) stop(2, "The scrip master didn't load (see above).");
  const stats = scrip.stats();
  const fixed = typeof scrip.indexTwin === 'function';
  const market = new MarketService(smartapi, scrip, { nameFor: () => null });

  out(`StockVirtue index chart check, ${ist(Date.now())} IST`);
  out(
    `SmartAPI session: found in Redis, expires in about ${Math.max(0, Math.round(sessionTtl / 60))} min. ` +
      'This check never signs in.',
  );
  out(
    `Scrip master: ${stats.total} instruments, ${stats.indices} indices` +
      (fixed ? `, ${stats.indexTwins} index code rows` : '') +
      `, from ${freshCache ? 'backend/.cache' : "Angel's public file"}.`,
  );
  out(
    `This build charts indices from their index rows: ${fixed ? 'yes' : 'NO, deploy the index fix'}.`,
  );
  out();

  const isIndex = (i) => i.instrumentType === 'AMXIDX' || i.instrumentType === 'INDEX';
  /** The index row (AMXIDX) with this short name, whatever the build resolves to. */
  const indexRow = (symbol, exchange) =>
    scrip
      .searchInstruments(symbol, exchange, 400)
      .find((i) => isIndex(i) && i.name.toUpperCase() === symbol) || null;
  /** A share-typed row named like an index: Angel's index code row. */
  const isCodeRow = (i) =>
    !i.instrumentType &&
    i.symbol.toUpperCase() === i.name.toUpperCase() &&
    !!indexRow(i.name.toUpperCase(), i.exchange);
  const describe = (i) =>
    i
      ? `${i.exchange}:${i.token} "${i.symbol}" (` +
        (isIndex(i)
          ? 'index row'
          : isCodeRow(i)
            ? 'index code row, typed as a share'
            : i.instrumentType || 'share') +
        ')'
      : 'not found';
  const day = (t) => String(t).slice(0, 10);
  const span = (ts) => (ts.length ? `  ${day(ts[0])} .. ${day(ts[ts.length - 1])}` : '');
  const asked = (req) =>
    `asked ${req.exchange}:${req.symboltoken} ${req.interval} ${day(req.fromdate)}..${day(req.todate)}`;
  const results = [];

  /** The chart the website and the app get (MarketService.getCandles). */
  async function chart(symbol, exchange, range) {
    const from = made.length;
    let res = null;
    let error = null;
    try {
      res = await market.getCandles(symbol, exchange, 'ONE_DAY', RANGES[range]);
    } catch (err) {
      error = message(err);
    }
    const mine = made.slice(from);
    const sent = mine.filter((c) => !c.skipped);
    const errors = [
      ...new Set([error, ...mine.map((c) => c.error)].filter(Boolean)),
    ];
    const n = res ? res.candles.length : 0;
    results.push({ symbol, range, kind: 'chart', n });
    out(
      `  ${`${exchange}:${symbol}`.padEnd(14)} ${range}  chart      ` +
        `${sent.map((c) => asked(c.req)).join(', then ') || 'no call sent'}  ->  ${n} candles` +
        (res ? span(res.candles.map((c) => c.t)) : '') +
        (errors.length
          ? `  (${errors.join('; ')})`
          : n === 0 && sent.length
            ? ' (SmartAPI said success, with no rows)'
            : ''),
    );
  }

  /** One direct 1M daily request for a row, in an index chart's window. */
  async function direct(symbol, exchange, inst) {
    const t = Date.now();
    const req = {
      exchange: inst.exchange,
      symboltoken: inst.token,
      interval: 'ONE_DAY',
      fromdate: ist(t - INDEX_MIN_DAYS * DAY_MS),
      todate: ist(t),
    };
    let rows = null;
    let error = null;
    try {
      rows = await smartapi.getCandles(req);
    } catch (err) {
      error = message(err);
    }
    const n = rows ? rows.length : 0;
    results.push({ symbol, range: '1M', kind: 'other', n });
    out(
      `  ${`${exchange}:${symbol}`.padEnd(14)} 1M  other row  ${describe(inst)}: ${asked(req)}  ->  ` +
        (error
          ? `error: ${error}`
          : n
            ? `${n} candles${span(rows.map((r) => r[0]))}`
            : '0 candles (SmartAPI said success, with no rows)'),
    );
  }

  const LIST = [
    ['NIFTY', 'NSE'],
    ['BANKNIFTY', 'NSE'],
    ['SENSEX', 'BSE'],
    ['RELIANCE', 'NSE'],
  ];
  out('What the backend charts from');
  const other = {};
  for (const [symbol, exchange] of LIST) {
    const inst = scrip.getInstrument(symbol, exchange);
    const twin = inst && fixed ? scrip.indexTwin(inst) : null;
    out(
      `  ${`${exchange}:${symbol}`.padEnd(14)} resolves to ${describe(inst)}` +
        (twin ? `; candles from ${describe(twin)}` : ''),
    );
    // An index listed twice: probe the row the chart does NOT use (the
    // code row on a fixed build, the index row on an old one).
    const index = inst ? indexRow(symbol, exchange) : null;
    if (twin) other[symbol] = inst;
    else if (!fixed && index && index.token !== inst.token) other[symbol] = index;
  }
  out();

  out(`Candles (each call at least ${GAP_MS / 1000} s after the last, at most ${MAX_CALLS})`);
  await chart('NIFTY', 'NSE', '1M');
  if (other.NIFTY) await direct('NIFTY', 'NSE', other.NIFTY);
  await chart('BANKNIFTY', 'NSE', '1M');
  if (other.BANKNIFTY) await direct('BANKNIFTY', 'NSE', other.BANKNIFTY);
  await chart('SENSEX', 'BSE', '1M');
  await chart('RELIANCE', 'NSE', '1M');
  // An old build may spend a fallback call on each Nifty chart: ask the
  // instruments that still chart first.
  const yearOrder = fixed ? LIST : [LIST[2], LIST[3], LIST[0], LIST[1]];
  for (const [symbol, exchange] of yearOrder) await chart(symbol, exchange, '1Y');
  out();
  out(`SmartAPI calls made: ${callCount()} of at most ${MAX_CALLS}.`);

  const charts = results.filter((r) => r.kind === 'chart');
  const empty = charts.filter((r) => r.n === 0);
  const otherHad = (s) =>
    results.some((r) => r.kind === 'other' && r.symbol === s && r.n > 0);
  if (!empty.length) {
    out('Result: every chart has candles (Nifty 50, Bank Nifty, Sensex and Reliance).');
  } else if (!fixed && otherHad('NIFTY')) {
    out(
      "Result: root cause confirmed. This build charts Nifty from its share-typed code row, which has " +
        'no candles, while the index row has them. Deploy the backend with the index fix.',
    );
  } else {
    out(
      `Result: no candles for ${empty.map((r) => `${r.symbol} ${r.range}`).join(', ')}. ` +
        "See SmartAPI's answer on each line above.",
    );
  }
  await redis.quit();
  return empty.length ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => stop(2, `The check stopped: ${message(err)}`),
);
