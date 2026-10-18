import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { CompanyDirectoryService } from '../market/company-directory.service';
import { ScripMasterService } from '../market/scrip-master.service';
import { Instrument } from '../market/scrip-master.types';
import { RedisService } from '../redis/redis.service';
import { SmartApiService } from '../smartapi/smartapi.service';

/// NSE's public IPO feeds (the same JSON nseindia.com's IPO pages render).
const NSE = 'https://www.nseindia.com';
const FEEDS = {
  current: { path: '/api/ipo-current-issue', ttlSec: 5 * 60 },
  upcoming: { path: '/api/all-upcoming-issues?category=ipo', ttlSec: 15 * 60 },
  past: { path: '/api/public-past-issues', ttlSec: 6 * 60 * 60 },
} as const;
type FeedKey = keyof typeof FEEDS;

const RECENT_LISTING_DAYS = 60;
const LISTING_SOON_DAYS = 20;
const MAX_RECENT = 40;
const EQUITY_TYPES = new Set(['EQ', 'BE', 'SME']);

export type IpoSegment = 'MAINBOARD' | 'SME';

export interface IpoIssue {
  symbol: string;
  companyName: string;
  segment: IpoSegment;
  /** "₹665 – ₹700" style label straight from the issue. */
  priceRange: string | null;
  priceBandLow: number | null;
  priceBandHigh: number | null;
  /** Shares on offer. */
  issueSize: number | null;
  openDate: string | null; // YYYY-MM-DD
  closeDate: string | null;
  /** Overall subscription, in times (e.g. 5.2 = 5.2x). Open issues only. */
  subscription: number | null;
}

export interface ListedIpo {
  symbol: string;
  companyName: string;
  segment: IpoSegment;
  issuePrice: number | null;
  listingDate: string; // YYYY-MM-DD
  tradeable: boolean;
  exchange: 'NSE';
  tradingsymbol: string | null;
  symboltoken: string | null;
  ltp: number | null;
  dayChangePct: number | null;
  /** Gain/loss vs the IPO issue price, in %. */
  gainPct: number | null;
}

export interface IpoBoard {
  /** False when NSE couldn't be reached and nothing was cached — the app
   *  hides the IPO section entirely instead of showing a broken one. */
  available: boolean;
  fetchedAt: string;
  open: IpoIssue[];
  upcoming: IpoIssue[];
  listingSoon: IpoIssue[];
  recentlyListed: ListedIpo[];
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

/// "15-Oct-2026" / "15-OCT-2026" → "2026-10-15".
function isoDate(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const month = MONTHS[m[2].toUpperCase()];
  return month ? `${m[3]}-${month}-${m[1].padStart(2, '0')}` : null;
}

function num(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const n = parseFloat(raw.replace(/[^0-9.eE+-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/// "Rs.665 to Rs.700" → [665, 700]; "Rs.1000" → [1000, 1000].
function priceBand(raw: unknown): [number | null, number | null] {
  if (typeof raw !== 'string') return [null, null];
  const nums = (raw.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (nums.length === 0) return [null, null];
  return [nums[0], nums[nums.length - 1]];
}

function rangeLabel(low: number | null, high: number | null): string | null {
  if (low === null) return null;
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  return high !== null && high !== low
    ? `${fmt(low)} – ${fmt(high)}`
    : fmt(low);
}

/// NSE fields arrive as untyped JSON — read one as a string or ''.
function str(raw: unknown): string {
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw) : '';
}

/// "Kotak Mahindra Bank Limited" → "Kotak Mahindra Bank".
function cleanName(raw: unknown): string {
  return str(raw)
    .replace(/\s+/g, ' ')
    .replace(/[\s,]+(limited|ltd)\.?$/i, '')
    .trim();
}

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

/// IPO board for the app, sourced from NSE's public IPO feeds. Each upstream
/// feed is cached in Redis (and kept in memory as last-good), so NSE sees at
/// most a handful of requests per hour no matter how many users open the
/// screen, and a brief NSE outage serves the last good board instead of an
/// error. Recently-listed IPOs are joined to the scrip master + live quotes
/// so users can see listing gains and trade them like any other stock.
@Injectable()
export class IpoService {
  private readonly logger = new Logger(IpoService.name);
  private readonly http: AxiosInstance;
  private cookie: string | null = null;
  private readonly lastGood = new Map<FeedKey, unknown[]>();

  constructor(
    private readonly redis: RedisService,
    private readonly scripMaster: ScripMasterService,
    private readonly smartapi: SmartApiService,
    private readonly directory: CompanyDirectoryService,
  ) {
    this.http = axios.create({
      baseURL: NSE,
      timeout: 8000,
      validateStatus: () => true,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/130.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-IN,en;q=0.9',
        Referer: `${NSE}/market-data/all-upcoming-issues-ipo`,
      },
    });
  }

  async getBoard(): Promise<IpoBoard> {
    const [current, upcoming, past] = await Promise.all([
      this.feed('current'),
      this.feed('upcoming'),
      this.feed('past'),
    ]);
    const available = current !== null || upcoming !== null || past !== null;
    const board: IpoBoard = {
      available,
      fetchedAt: new Date().toISOString(),
      open: [],
      upcoming: [],
      listingSoon: [],
      recentlyListed: [],
    };
    if (!available) return board;

    // Subscription multiples only come on the "current issue" feed.
    const subscription = new Map<string, number | null>();
    for (const row of current ?? []) {
      const r = row as Record<string, unknown>;
      if (typeof r.symbol === 'string') {
        subscription.set(r.symbol.toUpperCase(), num(r.noOfTime));
      }
    }

    const seen = new Set<string>();
    for (const row of [...(upcoming ?? []), ...(current ?? [])]) {
      const r = row as Record<string, unknown>;
      const symbol = str(r.symbol).toUpperCase();
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);
      const [low, high] = priceBand(r.issuePrice);
      const issue: IpoIssue = {
        symbol,
        companyName: cleanName(r.companyName),
        segment: str(r.series).toUpperCase() === 'SME' ? 'SME' : 'MAINBOARD',
        priceRange: rangeLabel(low, high),
        priceBandLow: low,
        priceBandHigh: high,
        issueSize: num(r.issueSize),
        openDate: isoDate(r.issueStartDate),
        closeDate: isoDate(r.issueEndDate),
        subscription: subscription.get(symbol) ?? null,
      };
      const status = str(r.status).toLowerCase();
      if (status === 'active') board.open.push(issue);
      else board.upcoming.push(issue);
    }
    board.upcoming.sort((a, b) =>
      (a.openDate ?? '').localeCompare(b.openDate ?? ''),
    );

    const soonCutoff = daysAgoIso(LISTING_SOON_DAYS);
    const listedCutoff = daysAgoIso(RECENT_LISTING_DAYS);
    const recent: { r: Record<string, unknown>; listingDate: string }[] = [];
    for (const row of past ?? []) {
      const r = row as Record<string, unknown>;
      const type = str(r.securityType).toUpperCase();
      if (!EQUITY_TYPES.has(type)) continue; // skip debt / NCD issues
      const symbol = str(r.symbol).toUpperCase();
      if (!symbol || seen.has(symbol)) continue;
      const listingDate = isoDate(r.listingDate);
      if (listingDate === null) {
        // Closed, awaiting allotment + listing.
        const closeDate = isoDate(r.ipoEndDate);
        if (closeDate && closeDate >= soonCutoff) {
          const [low, high] = priceBand(r.priceRange);
          board.listingSoon.push({
            symbol,
            companyName: cleanName(r.companyName ?? r.company),
            segment: type === 'SME' ? 'SME' : 'MAINBOARD',
            priceRange: rangeLabel(low, high),
            priceBandLow: low,
            priceBandHigh: high,
            issueSize: null,
            openDate: isoDate(r.ipoStartDate),
            closeDate,
            subscription: null,
          });
        }
        continue;
      }
      if (listingDate >= listedCutoff) recent.push({ r, listingDate });
    }
    recent.sort((a, b) => b.listingDate.localeCompare(a.listingDate));
    board.recentlyListed = await this.enrichListed(recent.slice(0, MAX_RECENT));
    return board;
  }

  private async enrichListed(
    rows: { r: Record<string, unknown>; listingDate: string }[],
  ): Promise<ListedIpo[]> {
    const resolved = rows.map(({ r, listingDate }) => {
      const symbol = str(r.symbol).toUpperCase();
      const inst: Instrument | null = this.scripMaster.isReady()
        ? this.scripMaster.getEquity(symbol, 'NSE')
        : null;
      return { r, listingDate, symbol, inst };
    });
    const tokens = resolved
      .map((x) => x.inst?.token)
      .filter((t): t is string => !!t);
    const quotes = new Map<string, { ltp: number; close: number }>();
    for (let i = 0; i < tokens.length; i += 50) {
      try {
        const fetched = await this.smartapi.getMultiQuote(
          { NSE: tokens.slice(i, i + 50) },
          'OHLC',
        );
        for (const q of fetched) {
          quotes.set(q.symbolToken, { ltp: q.ltp, close: q.close });
        }
      } catch (err) {
        this.logger.warn(`IPO quote batch failed: ${(err as Error).message}`);
      }
    }
    return resolved.map(({ r, listingDate, symbol, inst }) => {
      const issuePrice = num(r.issuePrice);
      const q = inst ? quotes.get(inst.token) : undefined;
      const ltp = q && q.ltp > 0 ? q.ltp : null;
      return {
        symbol,
        companyName:
          this.directory.nameFor(symbol) ??
          cleanName(r.companyName ?? r.company),
        segment:
          str(r.securityType).toUpperCase() === 'SME' ? 'SME' : 'MAINBOARD',
        issuePrice,
        listingDate,
        tradeable: inst !== null,
        exchange: 'NSE' as const,
        tradingsymbol: inst?.symbol ?? null,
        symboltoken: inst?.token ?? null,
        ltp,
        dayChangePct:
          ltp !== null && q && q.close > 0
            ? ((ltp - q.close) / q.close) * 100
            : null,
        gainPct:
          ltp !== null && issuePrice
            ? ((ltp - issuePrice) / issuePrice) * 100
            : null,
      };
    });
  }

  /// One upstream feed: Redis cache → NSE → in-memory last-good. Returns null
  /// only when there's nothing at all to serve.
  private async feed(key: FeedKey): Promise<unknown[] | null> {
    const cacheKey = `ipo:nse:${key}`;
    try {
      const cached = await this.redis.client.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached) as unknown[];
        this.lastGood.set(key, parsed);
        return parsed;
      }
    } catch {
      // Redis hiccup — fall through to NSE.
    }
    try {
      const data = await this.fetchNse(FEEDS[key].path);
      this.lastGood.set(key, data);
      await this.redis.client
        .set(cacheKey, JSON.stringify(data), 'EX', FEEDS[key].ttlSec)
        .catch(() => undefined);
      return data;
    } catch (err) {
      this.logger.warn(
        `NSE IPO feed "${key}" failed: ${(err as Error).message}`,
      );
      return this.lastGood.get(key) ?? null;
    }
  }

  private async fetchNse(path: string): Promise<unknown[]> {
    let res = await this.http.get<unknown>(path, {
      headers: this.cookie ? { Cookie: this.cookie } : undefined,
    });
    if (res.status === 401 || res.status === 403) {
      // NSE occasionally gates bots behind a session cookie — grab one from
      // a page hit and retry once.
      const page = await this.http.get('/market-data/all-upcoming-issues-ipo', {
        headers: { Accept: 'text/html' },
      });
      const setCookie = page.headers['set-cookie'];
      if (Array.isArray(setCookie) && setCookie.length > 0) {
        this.cookie = setCookie.map((c) => c.split(';')[0]).join('; ');
      }
      res = await this.http.get<unknown>(path, {
        headers: this.cookie ? { Cookie: this.cookie } : undefined,
      });
    }
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    // Some feeds answer an empty object instead of an empty list.
    if (Array.isArray(res.data)) return res.data as unknown[];
    if (res.data && typeof res.data === 'object') return [];
    throw new Error('Unexpected payload');
  }
}
