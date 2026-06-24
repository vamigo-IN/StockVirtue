import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import axios from 'axios';
import { Exchange, isExchange } from '../common/exchange';
import { Instrument, RawScripMasterEntry } from './scrip-master.types';

const SCRIP_MASTER_URL =
  'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json';
const CACHE_DIR = path.resolve(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'scrip-master.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ScripMasterService implements OnModuleInit {
  private readonly logger = new Logger(ScripMasterService.name);

  private instruments: Instrument[] = [];
  private byToken = new Map<string, Instrument>();
  private equityBySymbol = new Map<string, Instrument>();
  private equityByName = new Map<string, Instrument[]>();
  // F&O lookups
  private optionsByUnderlying = new Map<string, Instrument[]>();
  private futuresByUnderlying = new Map<string, Instrument[]>();
  private bySymbolExchange = new Map<string, Instrument>();
  // Indices (AMXIDX etc.) — separate from equities but searchable.
  private indices: Instrument[] = [];
  private loadedAt: Date | null = null;

  async onModuleInit() {
    try {
      await this.load();
    } catch (err) {
      this.logger.error(
        `Scrip master init failed: ${(err as Error).message}`,
      );
    }
  }

  isReady(): boolean {
    return this.instruments.length > 0;
  }

  stats() {
    return {
      ready: this.isReady(),
      total: this.instruments.length,
      equities: this.equityBySymbol.size,
      indices: this.indices.length,
      optionUnderlyings: this.optionsByUnderlying.size,
      futureUnderlyings: this.futuresByUnderlying.size,
      loadedAt: this.loadedAt?.toISOString() ?? null,
    };
  }

  /** Generic resolver — works for equities AND F&O symbols. */
  getInstrument(symbolOrTrading: string, exchange: Exchange): Instrument | null {
    const upper = symbolOrTrading.toUpperCase();
    return (
      this.bySymbolExchange.get(`${exchange}:${upper}`) ??
      this.equityBySymbol.get(`${exchange}:${upper}`) ??
      this.equityBySymbol.get(`${exchange}:${upper}-EQ`) ??
      this.equityByName.get(`${exchange}:${upper}`)?.[0] ??
      null
    );
  }

  getByToken(exchange: Exchange, token: string): Instrument | null {
    return this.byToken.get(`${exchange}:${token}`) ?? null;
  }

  /** Returns the set of available expiries for an option-bearing underlying. */
  getExpiries(underlying: string): string[] {
    const list = this.optionsByUnderlying.get(underlying.toUpperCase()) ?? [];
    const set = new Set<string>();
    for (const inst of list) {
      if (inst.expiry) set.add(inst.expiry);
    }
    return Array.from(set).sort(
      (a, b) => parseExpiryToMs(a) - parseExpiryToMs(b),
    );
  }

  /**
   * Returns the option chain at a specific expiry as an array of strikes,
   * each carrying optional `call` (CE) and `put` (PE) instruments.
   */
  getOptionChain(
    underlying: string,
    expiry: string,
  ): { strike: number; call: Instrument | null; put: Instrument | null }[] {
    const list = this.optionsByUnderlying.get(underlying.toUpperCase()) ?? [];
    const byStrike = new Map<
      number,
      { strike: number; call: Instrument | null; put: Instrument | null }
    >();
    for (const inst of list) {
      if (inst.expiry !== expiry || inst.strike === null) continue;
      let entry = byStrike.get(inst.strike);
      if (!entry) {
        entry = { strike: inst.strike, call: null, put: null };
        byStrike.set(inst.strike, entry);
      }
      const isCall = inst.symbol.toUpperCase().endsWith('CE');
      if (isCall) entry.call = inst;
      else entry.put = inst;
    }
    return Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);
  }

  getEquity(symbol: string, exchange: Exchange = 'NSE'): Instrument | null {
    const upper = symbol.toUpperCase();
    return (
      this.equityBySymbol.get(`${exchange}:${upper}`) ??
      this.equityBySymbol.get(`${exchange}:${upper}-EQ`) ??
      this.equityByName.get(`${exchange}:${upper}`)?.[0] ??
      null
    );
  }

  searchEquities(
    query: string,
    exchange: Exchange = 'NSE',
    limit = 20,
  ): Instrument[] {
    const q = query.trim().toUpperCase();
    if (!q) return [];

    const prefix: Instrument[] = [];
    const contains: Instrument[] = [];
    for (const inst of this.equityBySymbol.values()) {
      if (inst.exchange !== exchange) continue;
      const name = inst.name.toUpperCase();
      const sym = inst.symbol.toUpperCase();
      if (name.startsWith(q) || sym.startsWith(q)) {
        prefix.push(inst);
      } else if (name.includes(q) || sym.includes(q)) {
        contains.push(inst);
      }
    }
    prefix.sort((a, b) => a.name.length - b.name.length);
    return [...prefix, ...contains].slice(0, limit);
  }

  /**
   * Like {@link searchEquities} but also returns matching indices (NIFTY 50,
   * BANKNIFTY, etc.). Indices are not tradeable spot but are the underlying
   * for F&O, so users need to discover them to find option chains.
   */
  searchInstruments(
    query: string,
    exchange: Exchange = 'NSE',
    limit = 20,
  ): Instrument[] {
    const q = query.trim().toUpperCase();
    if (!q) return [];

    const prefix: Instrument[] = [];
    const contains: Instrument[] = [];
    const sources: Iterable<Instrument>[] = [
      this.equityBySymbol.values(),
      this.indices,
    ];
    for (const source of sources) {
      for (const inst of source) {
        if (inst.exchange !== exchange) continue;
        const name = inst.name.toUpperCase();
        const sym = inst.symbol.toUpperCase();
        if (name.startsWith(q) || sym.startsWith(q)) {
          prefix.push(inst);
        } else if (name.includes(q) || sym.includes(q)) {
          contains.push(inst);
        }
      }
    }
    prefix.sort((a, b) => a.name.length - b.name.length);
    return [...prefix, ...contains].slice(0, limit);
  }

  async refresh() {
    await this.downloadFresh();
    await this.load();
    return this.stats();
  }

  private async load() {
    const raw = await this.loadRaw();
    this.indexInstruments(raw);
    this.loadedAt = new Date();
    this.logger.log(
      `Loaded ${this.instruments.length} instruments ` +
        `(${this.equityBySymbol.size} equities, ` +
        `${this.optionsByUnderlying.size} option underlyings, ` +
        `${this.futuresByUnderlying.size} future underlyings)`,
    );
  }

  private async loadRaw(): Promise<RawScripMasterEntry[]> {
    const cached = await this.tryLoadCache();
    if (cached) {
      this.logger.log('Using cached scrip master');
      return cached;
    }
    return this.downloadFresh();
  }

  private async tryLoadCache(): Promise<RawScripMasterEntry[] | null> {
    try {
      const stat = await fs.stat(CACHE_FILE);
      if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) {
        this.logger.log('Cached scrip master is stale — re-downloading');
        return null;
      }
      const body = await fs.readFile(CACHE_FILE, 'utf-8');
      return JSON.parse(body) as RawScripMasterEntry[];
    } catch {
      return null;
    }
  }

  private async downloadFresh(): Promise<RawScripMasterEntry[]> {
    this.logger.log(`Downloading scrip master from ${SCRIP_MASTER_URL}`);
    const start = Date.now();
    const { data } = await axios.get<RawScripMasterEntry[]>(SCRIP_MASTER_URL, {
      timeout: 60000,
      responseType: 'json',
      maxContentLength: 100 * 1024 * 1024,
      maxBodyLength: 100 * 1024 * 1024,
    });
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, JSON.stringify(data));
    this.logger.log(
      `Downloaded ${data.length} instruments in ${Date.now() - start}ms`,
    );
    return data;
  }

  private indexInstruments(raw: RawScripMasterEntry[]) {
    const instruments: Instrument[] = [];
    const byToken = new Map<string, Instrument>();
    const equityBySymbol = new Map<string, Instrument>();
    const equityByName = new Map<string, Instrument[]>();
    const optionsByUnderlying = new Map<string, Instrument[]>();
    const futuresByUnderlying = new Map<string, Instrument[]>();
    const bySymbolExchange = new Map<string, Instrument>();
    const indices: Instrument[] = [];

    for (const r of raw) {
      if (!isExchange(r.exch_seg)) continue;
      const exchange = r.exch_seg;
      const isEquity =
        r.instrumenttype === '' && (exchange === 'NSE' || exchange === 'BSE');
      const isOption = r.instrumenttype.startsWith('OPT');
      const isFuture = r.instrumenttype.startsWith('FUT');
      // Strike in the scrip master is stored as paise (e.g., 2450000 = ₹24500).
      const strikeRaw = parseFloat(r.strike);
      const strike =
        Number.isFinite(strikeRaw) && strikeRaw > 0 ? strikeRaw / 100 : null;
      const inst: Instrument = {
        token: r.token,
        symbol: r.symbol,
        name: r.name,
        exchange,
        instrumentType: r.instrumenttype,
        lotSize: parseInt(r.lotsize, 10) || 1,
        tickSize: parseFloat(r.tick_size) || 0.05,
        expiry: r.expiry || null,
        strike,
        isEquity,
      };
      instruments.push(inst);
      byToken.set(`${exchange}:${inst.token}`, inst);
      bySymbolExchange.set(
        `${exchange}:${inst.symbol.toUpperCase()}`,
        inst,
      );
      // Also index the friendly `name` field so callers can resolve indices
      // (Angel One ships them with `symbol: "Nifty 50"` and `name: "NIFTY"`,
      // and we standardise on the short name everywhere on the client).
      const isIndex =
        (r.instrumenttype === 'AMXIDX' || r.instrumenttype === 'INDEX') &&
        (exchange === 'NSE' || exchange === 'BSE');
      if (isIndex && inst.symbol.toUpperCase() !== inst.name.toUpperCase()) {
        const nameKey = `${exchange}:${inst.name.toUpperCase()}`;
        // Don't clobber an existing entry (e.g. an equity sharing the name).
        if (!bySymbolExchange.has(nameKey)) {
          bySymbolExchange.set(nameKey, inst);
        }
      }
      if (isEquity) {
        const symKey = `${exchange}:${inst.symbol.toUpperCase()}`;
        const nameKey = `${exchange}:${inst.name.toUpperCase()}`;
        equityBySymbol.set(symKey, inst);
        const list = equityByName.get(nameKey) ?? [];
        list.push(inst);
        equityByName.set(nameKey, list);
      } else if (isOption) {
        const key = inst.name.toUpperCase();
        const list = optionsByUnderlying.get(key) ?? [];
        list.push(inst);
        optionsByUnderlying.set(key, list);
      } else if (isFuture) {
        const key = inst.name.toUpperCase();
        const list = futuresByUnderlying.get(key) ?? [];
        list.push(inst);
        futuresByUnderlying.set(key, list);
      } else if (
        // Indices: AMXIDX (NSE-style) and other index codes on NSE/BSE.
        (r.instrumenttype === 'AMXIDX' || r.instrumenttype === 'INDEX') &&
        (exchange === 'NSE' || exchange === 'BSE')
      ) {
        indices.push(inst);
      }
    }

    this.instruments = instruments;
    this.byToken = byToken;
    this.equityBySymbol = equityBySymbol;
    this.equityByName = equityByName;
    this.optionsByUnderlying = optionsByUnderlying;
    this.futuresByUnderlying = futuresByUnderlying;
    this.bySymbolExchange = bySymbolExchange;
    this.indices = indices;
  }
}

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

// Angel One uses DDMMMYYYY (e.g., "30JAN2025"); parse to ms-epoch for sorting.
function parseExpiryToMs(expiry: string): number {
  const m = /^(\d{1,2})([A-Z]{3})(\d{4})$/.exec(expiry);
  if (!m) return Number.MAX_SAFE_INTEGER;
  const day = parseInt(m[1], 10);
  const mon = MONTHS[m[2]];
  const year = parseInt(m[3], 10);
  if (mon === undefined) return Number.MAX_SAFE_INTEGER;
  return Date.UTC(year, mon, day);
}
