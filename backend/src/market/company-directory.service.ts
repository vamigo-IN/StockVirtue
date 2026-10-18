import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import axios from 'axios';
import { CompanyRecord, parseNseEquityList } from './company-directory.parse';
import {
  COMPANY_SNAPSHOT,
  COMPANY_SNAPSHOT_DATE,
} from './data/company-directory.snapshot';

const SOURCES = [
  {
    url: 'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv',
    sme: false,
  },
  {
    url: 'https://nsearchives.nseindia.com/emerge/corporates/content/SME_EQUITY_L.csv',
    sme: true,
  },
];
const CACHE_FILE = path.resolve(
  process.cwd(),
  '.cache',
  'company-directory.json',
);
const REFRESH_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 30 * 60 * 1000;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/130.0 Safari/537.36';

interface CachedDirectory {
  fetchedAt: string;
  records: CompanyRecord[];
}

/// Full company names for NSE-listed equities (mainboard + SME), from NSE's
/// official listed-company files. Angel One's scrip master only carries
/// tickers ("KOTAKBANK"), so this is what turns them into "Kotak Mahindra
/// Bank" across the app and lets search match on the company name.
///
/// Always serves something: the bundled snapshot is loaded synchronously at
/// construction, then replaced by the on-disk cache / a fresh NSE download.
/// Refreshes daily so new listings get their names without a deploy.
@Injectable()
export class CompanyDirectoryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CompanyDirectoryService.name);
  private bySymbol = new Map<string, CompanyRecord>();
  /// Upper-cased name per symbol, precomputed for search.
  private searchIndex: { symbol: string; upper: string; words: string[] }[] =
    [];
  private source: 'snapshot' | 'cache' | 'nse' = 'snapshot';
  private updatedAt: string = COMPANY_SNAPSHOT_DATE;
  private version = 0;
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    this.install(
      COMPANY_SNAPSHOT.map(([symbol, name, listedOn, sme]) => ({
        symbol,
        name,
        listedOn: listedOn || null,
        sme: sme === 1,
      })),
      'snapshot',
      COMPANY_SNAPSHOT_DATE,
    );
  }

  onModuleInit() {
    // Don't block boot on NSE — the snapshot is already serving.
    void this.refresh(false);
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  /// "KOTAKBANK" / "KOTAKBANK-EQ" → "Kotak Mahindra Bank" (null if unknown).
  nameFor(symbol: string): string | null {
    return this.bySymbol.get(stem(symbol))?.name ?? null;
  }

  recordFor(symbol: string): CompanyRecord | null {
    return this.bySymbol.get(stem(symbol)) ?? null;
  }

  /// Symbol → display name for every known company (powers the app's
  /// directory sync). Also returns a version so clients can skip re-parsing.
  snapshot() {
    const names: Record<string, string> = {};
    for (const [sym, r] of this.bySymbol) names[sym] = r.name;
    return {
      version: this.version,
      source: this.source,
      updatedAt: this.updatedAt,
      count: this.bySymbol.size,
      names,
    };
  }

  /// Symbols whose company name matches every word of `query` (each query
  /// word must prefix some word of the name, e.g. "kotak mah" → KOTAKBANK),
  /// best matches first. Pure in-memory scan over ~3k names.
  matchByName(query: string, limit = 25): { symbol: string; score: number }[] {
    const q = query.trim().toUpperCase();
    if (q.length < 2) return [];
    const qWords = q.split(/\s+/).filter(Boolean);
    const hits: { symbol: string; score: number }[] = [];
    for (const row of this.searchIndex) {
      let score = 0;
      if (row.upper.startsWith(q)) {
        score = 700;
      } else if (
        qWords.every((w) => row.words.some((nw) => nw.startsWith(w)))
      ) {
        score = 600;
      } else if (row.upper.includes(q)) {
        score = 300;
      }
      if (score > 0) {
        // Shorter names are closer matches ("Infosys" over "Infosys BPM").
        hits.push({
          symbol: row.symbol,
          score: score - row.upper.length / 100,
        });
      }
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }

  /// Companies listed on/after `sinceIso` (YYYY-MM-DD), newest first.
  listedSince(sinceIso: string): CompanyRecord[] {
    return [...this.bySymbol.values()]
      .filter((r) => r.listedOn !== null && r.listedOn >= sinceIso)
      .sort((a, b) => (b.listedOn ?? '').localeCompare(a.listedOn ?? ''));
  }

  private install(
    records: CompanyRecord[],
    source: 'snapshot' | 'cache' | 'nse',
    updatedAt: string,
  ) {
    const map = new Map<string, CompanyRecord>();
    for (const r of records) {
      // Mainboard wins over SME when a symbol appears in both.
      if (!map.has(r.symbol) || !r.sme) map.set(r.symbol, r);
    }
    this.bySymbol = map;
    this.searchIndex = [...map.values()].map((r) => {
      const upper = r.name.toUpperCase();
      return {
        symbol: r.symbol,
        upper,
        words: upper.split(/[\s\-&().,/]+/).filter(Boolean),
      };
    });
    this.source = source;
    this.updatedAt = updatedAt;
    this.version += 1;
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh(true), ms);
    this.timer.unref?.();
  }

  /// Loads the freshest available directory. `force` skips the on-disk cache.
  private async refresh(force: boolean): Promise<void> {
    try {
      if (!force) {
        const cached = await this.readCache();
        if (cached) {
          const ageMs = Date.now() - new Date(cached.fetchedAt).getTime();
          this.install(cached.records, 'cache', cached.fetchedAt);
          if (ageMs < REFRESH_MS) {
            this.schedule(REFRESH_MS - ageMs);
            return;
          }
        }
      }
      const records = await this.download();
      const fetchedAt = new Date().toISOString();
      this.install(records, 'nse', fetchedAt);
      await this.writeCache({ fetchedAt, records });
      this.logger.log(`Loaded ${records.length} company names from NSE`);
      this.schedule(REFRESH_MS);
    } catch (err) {
      this.logger.warn(
        `Company directory refresh failed (serving ${this.source}): ${(err as Error).message}`,
      );
      this.schedule(RETRY_MS);
    }
  }

  private async download(): Promise<CompanyRecord[]> {
    const all: CompanyRecord[] = [];
    for (const src of SOURCES) {
      const { data, status } = await axios.get<string>(src.url, {
        timeout: 20_000,
        responseType: 'text',
        headers: { 'User-Agent': UA, Accept: 'text/csv,*/*' },
        validateStatus: () => true,
      });
      if (status !== 200 || typeof data !== 'string') {
        throw new Error(`HTTP ${status} from ${src.url}`);
      }
      const rows = parseNseEquityList(data, src.sme);
      // A mainboard list that suddenly parses tiny means NSE changed the
      // format or served an error page — keep what we have.
      if (!src.sme && rows.length < 1000) {
        throw new Error(`Only ${rows.length} rows parsed from ${src.url}`);
      }
      all.push(...rows);
    }
    return all;
  }

  private async readCache(): Promise<CachedDirectory | null> {
    try {
      const raw = await fs.readFile(CACHE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as CachedDirectory;
      return Array.isArray(parsed.records) && parsed.records.length > 0
        ? parsed
        : null;
    } catch {
      return null;
    }
  }

  private async writeCache(dir: CachedDirectory): Promise<void> {
    try {
      await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
      await fs.writeFile(CACHE_FILE, JSON.stringify(dir));
    } catch (err) {
      this.logger.warn(
        `Company directory cache write failed: ${(err as Error).message}`,
      );
    }
  }
}

/// "KOTAKBANK-EQ" → "KOTAKBANK"; tickers like "BAJAJ-AUTO" keep their dash
/// because NSE series suffixes are only the known two-letter codes.
function stem(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  const m = /^(.*)-(EQ|BE|BZ|SM|ST|SZ|IV|RR|GB|MF)$/.exec(upper);
  return m ? m[1] : upper;
}
