import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { RedisService } from '../redis/redis.service';

export interface MarketHoliday {
  date: string; // "YYYY-MM-DD"
  name: string;
}

export interface HolidaysPayload {
  source: 'nse' | 'curated';
  fetchedAt: string;
  holidays: MarketHoliday[];
}

const CACHE_KEY = 'market:holidays:v1';
const CACHE_TTL_SECONDS = 24 * 60 * 60;

@Injectable()
export class HolidaysService {
  private readonly logger = new Logger(HolidaysService.name);

  constructor(private readonly redis: RedisService) {}

  /// Returns the canonical Indian-equity holiday calendar for the
  /// current year. Strategy:
  ///   1. If Redis has a non-stale entry, serve it.
  ///   2. Otherwise try to fetch from NSE's public holiday-master JSON.
  ///      Cache + return on success.
  ///   3. On any failure fall back to the hand-curated list. The
  ///      `source` field on the response tells the caller which path
  ///      we took so the client can show a "verified" badge later.
  async getHolidays(force = false): Promise<HolidaysPayload> {
    if (!force) {
      const cached = await this.redis.client.get(CACHE_KEY);
      if (cached) {
        try {
          return JSON.parse(cached) as HolidaysPayload;
        } catch {
          // Corrupt — drop it and re-fetch.
          await this.redis.client.del(CACHE_KEY);
        }
      }
    }
    const fresh = await this.fetchFresh();
    await this.redis.client.set(
      CACHE_KEY,
      JSON.stringify(fresh),
      'EX',
      CACHE_TTL_SECONDS,
    );
    return fresh;
  }

  /// Force-refresh — bypasses the Redis cache. Wired to an admin
  /// endpoint so operators can re-pull after NSE publishes a new list.
  async refresh(): Promise<HolidaysPayload> {
    return this.getHolidays(true);
  }

  private async fetchFresh(): Promise<HolidaysPayload> {
    const fromNse = await this.fetchFromNse().catch((err: Error) => {
      this.logger.warn(`NSE holiday fetch failed: ${err.message}`);
      return null;
    });
    const fetchedAt = new Date().toISOString();
    if (fromNse && fromNse.length > 0) {
      return { source: 'nse', fetchedAt, holidays: fromNse };
    }
    return {
      source: 'curated',
      fetchedAt,
      holidays: curatedHolidaysForYears(new Date().getFullYear()),
    };
  }

  /// Calls NSE's public holiday-master endpoint. They gate bot traffic
  /// behind a cookie check; a "real browser" UA + a no-op homepage hit
  /// to grab the cookie is usually enough. We give it ~6s and bail.
  private async fetchFromNse(): Promise<MarketHoliday[] | null> {
    const headers = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-IN,en;q=0.9',
      Referer: 'https://www.nseindia.com/',
    };
    const jar = axios.create({
      timeout: 6000,
      headers,
      withCredentials: true,
      validateStatus: () => true,
    });
    // Warm-up to get the bot-bypass cookie. NSE rejects API calls that
    // arrive without a session cookie.
    await jar
      .get('https://www.nseindia.com/get-quotes/equity?symbol=RELIANCE')
      .catch(() => undefined);
    const setCookie = (jar.defaults.headers['set-cookie'] as
      | string[]
      | undefined) ?? [];
    if (setCookie.length > 0) {
      jar.defaults.headers.common.Cookie = setCookie
        .map((c) => c.split(';')[0])
        .join('; ');
    }
    const res = await jar.get(
      'https://www.nseindia.com/api/holiday-master?type=trading',
    );
    if (res.status !== 200 || typeof res.data !== 'object' || res.data == null) {
      return null;
    }
    // The payload's shape:
    //   { CM: [ {tradingDate:"04-Mar-2026", description:"Holi", ...}, ... ], FO: [...], ... }
    // We pick CM (cash market) — that's NSE+BSE equity trading days.
    const segment = (res.data as Record<string, unknown>).CM;
    if (!Array.isArray(segment)) return null;
    const out: MarketHoliday[] = [];
    for (const row of segment) {
      if (!row || typeof row !== 'object') continue;
      const r = row as Record<string, unknown>;
      const raw = (r.tradingDate ?? r.holidayDate) as string | undefined;
      const name = (r.description ?? r.holiday) as string | undefined;
      if (!raw || !name) continue;
      const iso = nseDateToIso(raw);
      if (!iso) continue;
      out.push({ date: iso, name: String(name) });
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  }
}

/// "04-Mar-2026" → "2026-03-04".
function nseDateToIso(raw: string): string | null {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const months: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const month = months[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, '0')}`;
}

/// Hand-curated fallback. Same list the mobile app shipped with — kept
/// in sync with the BSE annual trading calendar. Update once a year
/// (BSE publishes around mid-December) so the fallback is current when
/// NSE's API is unreachable.
function curatedHolidaysForYears(currentYear: number): MarketHoliday[] {
  const both = [...CURATED_2025, ...CURATED_2026];
  // Bias toward the current year + next so we don't ship 2024 dates
  // forever once that year is over.
  return both
    .filter((h) => {
      const y = parseInt(h.date.slice(0, 4), 10);
      return y >= currentYear - 1 && y <= currentYear + 1;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

const CURATED_2026: MarketHoliday[] = [
  { date: '2026-01-26', name: 'Republic Day' },
  { date: '2026-02-17', name: 'Maha Shivaratri' },
  { date: '2026-03-03', name: 'Holi' },
  { date: '2026-03-19', name: 'Eid-ul-Fitr (Ramadan Eid)' },
  { date: '2026-03-27', name: 'Good Friday' },
  { date: '2026-04-14', name: 'Dr. Ambedkar Jayanti' },
  { date: '2026-05-01', name: 'Maharashtra Day' },
  { date: '2026-05-27', name: 'Eid-ul-Adha (Bakri Eid)' },
  { date: '2026-08-15', name: 'Independence Day' },
  { date: '2026-08-27', name: 'Ganesh Chaturthi' },
  { date: '2026-10-02', name: 'Mahatma Gandhi Jayanti' },
  { date: '2026-11-09', name: 'Diwali (Laxmi Pujan)' },
  { date: '2026-11-25', name: 'Guru Nanak Jayanti' },
  { date: '2026-12-25', name: 'Christmas' },
];

const CURATED_2025: MarketHoliday[] = [
  { date: '2025-02-26', name: 'Maha Shivaratri' },
  { date: '2025-03-14', name: 'Holi' },
  { date: '2025-03-31', name: 'Eid-ul-Fitr' },
  { date: '2025-04-10', name: 'Mahavir Jayanti' },
  { date: '2025-04-14', name: 'Ambedkar Jayanti' },
  { date: '2025-04-18', name: 'Good Friday' },
  { date: '2025-05-01', name: 'Maharashtra Day' },
  { date: '2025-08-15', name: 'Independence Day' },
  { date: '2025-08-27', name: 'Ganesh Chaturthi' },
  { date: '2025-10-02', name: 'Mahatma Gandhi Jayanti' },
  { date: '2025-10-21', name: 'Diwali (Laxmi Pujan)' },
  { date: '2025-10-22', name: 'Balipratipada' },
  { date: '2025-11-05', name: 'Guru Nanak Jayanti' },
  { date: '2025-12-25', name: 'Christmas' },
];
