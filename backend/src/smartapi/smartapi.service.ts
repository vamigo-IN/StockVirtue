import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { authenticator } from 'otplib';
import { AxiosError } from 'axios';
import { AppConfig, SmartApiConfig } from '../config/configuration';
import { RedisService } from '../redis/redis.service';
import { SmartApiClient } from './smartapi.client';
import {
  CandleOIRow,
  CandleRequest,
  CandleRow,
  ExpiryBucket,
  GainersLosersRow,
  GainersLosersType,
  LoginData,
  LtpData,
  LtpRequest,
  MarginPosition,
  MarginPreview,
  MultiQuoteData,
  MultiQuoteFetched,
  OIBuildupRow,
  OIBuildupType,
  PutCallRatioRow,
  QuoteMode,
  SessionStatus,
  SmartApiResponse,
} from './smartapi.types';

const SESSION_KEY = 'smartapi:session';
// Refresh well before the ~28h jwt lifetime.
const SESSION_TTL_SECONDS = 4 * 60 * 60;

@Injectable()
export class SmartApiService implements OnModuleInit {
  private readonly logger = new Logger(SmartApiService.name);
  private readonly cfg: SmartApiConfig;
  private loginInFlight: Promise<LoginData> | null = null;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly redis: RedisService,
    private readonly client: SmartApiClient,
  ) {
    this.cfg = config.get('smartapi', { infer: true });
  }

  async onModuleInit() {
    if (!this.cfg.pin) {
      this.logger.warn('SMARTAPI_PIN not set — skipping auto-login');
      return;
    }
    try {
      await this.getValidSession();
      this.logger.log('SmartAPI session ready');
    } catch (err) {
      this.logger.error(
        `SmartAPI auto-login failed: ${(err as Error).message}`,
      );
    }
  }

  generateTotp(): string {
    return authenticator.generate(this.cfg.totpSecret);
  }

  async getStatus(): Promise<SessionStatus> {
    const cached = await this.redis.client.get(SESSION_KEY);
    if (!cached) return { authenticated: false };
    const session = JSON.parse(cached) as LoginData;
    const ttl = await this.redis.client.ttl(SESSION_KEY);
    return {
      authenticated: true,
      ttlSeconds: ttl,
      feedTokenAvailable: Boolean(session.feedToken),
    };
  }

  async getValidSession(): Promise<LoginData> {
    const cached = await this.redis.client.get(SESSION_KEY);
    if (cached) return JSON.parse(cached) as LoginData;
    return this.login();
  }

  private login(): Promise<LoginData> {
    if (this.loginInFlight) return this.loginInFlight;
    if (!this.cfg.pin) {
      throw new ServiceUnavailableException('SMARTAPI_PIN not configured');
    }
    this.loginInFlight = this.doLogin().finally(() => {
      this.loginInFlight = null;
    });
    return this.loginInFlight;
  }

  private async doLogin(): Promise<LoginData> {
    const totp = this.generateTotp();
    try {
      const { data } = await this.client.http.post<SmartApiResponse<LoginData>>(
        '/rest/auth/angelbroking/user/v1/loginByPassword',
        {
          clientcode: this.cfg.clientCode,
          password: this.cfg.pin,
          totp,
        },
      );
      if (!data.status) {
        throw new Error(
          `SmartAPI login rejected: ${data.message} (${data.errorcode})`,
        );
      }
      await this.redis.client.set(
        SESSION_KEY,
        JSON.stringify(data.data),
        'EX',
        SESSION_TTL_SECONDS,
      );
      this.logger.log('SmartAPI login succeeded');
      return data.data;
    } catch (err) {
      if (err instanceof AxiosError) {
        const body = err.response?.data ? JSON.stringify(err.response.data) : err.message;
        throw new Error(`SmartAPI login HTTP ${err.response?.status ?? '?'}: ${body}`);
      }
      throw err;
    }
  }

  async getLtp(req: LtpRequest): Promise<LtpData> {
    return this.callAuthed(async (jwt) => {
      const { data } = await this.client.http.post<SmartApiResponse<LtpData>>(
        '/rest/secure/angelbroking/order/v1/getLtpData',
        req,
        { headers: { Authorization: `Bearer ${jwt}` } },
      );
      if (!data.status) {
        throw new Error(`SmartAPI LTP error: ${data.message} (${data.errorcode})`);
      }
      return data.data;
    });
  }

  async getCandles(req: CandleRequest): Promise<CandleRow[]> {
    return this.callAuthed(async (jwt) => {
      const { data } = await this.client.http.post<
        SmartApiResponse<CandleRow[]>
      >(
        '/rest/secure/angelbroking/historical/v1/getCandleData',
        req,
        { headers: { Authorization: `Bearer ${jwt}` } },
      );
      if (!data.status) {
        throw new Error(
          `SmartAPI candles error: ${data.message} (${data.errorcode})`,
        );
      }
      return data.data ?? [];
    });
  }

  // Bulk quote — up to ~50 tokens per call, grouped by exchange.
  async getMultiQuote(
    exchangeTokens: Record<string, string[]>,
    mode: QuoteMode = 'OHLC',
  ): Promise<MultiQuoteFetched[]> {
    const nonEmpty = Object.fromEntries(
      Object.entries(exchangeTokens).filter(([, v]) => v.length > 0),
    );
    if (Object.keys(nonEmpty).length === 0) return [];
    return this.callAuthed(async (jwt) => {
      const { data } = await this.client.http.post<
        SmartApiResponse<MultiQuoteData>
      >(
        '/rest/secure/angelbroking/market/v1/quote/',
        { mode, exchangeTokens: nonEmpty },
        { headers: { Authorization: `Bearer ${jwt}` } },
      );
      if (!data.status) {
        throw new Error(
          `SmartAPI multi-quote error: ${data.message} (${data.errorcode})`,
        );
      }
      return data.data.fetched;
    });
  }

  /** Candles with open-interest column appended — F&O only. */
  async getCandlesWithOI(req: CandleRequest): Promise<CandleOIRow[]> {
    return this.callAuthed(async (jwt) => {
      const { data } = await this.client.http.post<
        SmartApiResponse<CandleOIRow[]>
      >(
        '/rest/secure/angelbroking/historical/v1/getCandleData',
        { ...req, oi: true },
        { headers: { Authorization: `Bearer ${jwt}` } },
      );
      if (!data.status) {
        throw new Error(
          `SmartAPI candles-OI error: ${data.message} (${data.errorcode})`,
        );
      }
      return data.data ?? [];
    });
  }

  /** Top % price / OI gainers or losers, segmented by expiry bucket. */
  async getGainersLosers(
    datatype: GainersLosersType,
    expirytype: ExpiryBucket = 'NEAR',
  ): Promise<GainersLosersRow[]> {
    return this.callAuthed(async (jwt) => {
      const { data } = await this.client.http.post<
        SmartApiResponse<GainersLosersRow[]>
      >(
        '/rest/secure/angelbroking/marketData/v1/gainersLosers',
        { datatype, expirytype },
        { headers: { Authorization: `Bearer ${jwt}` } },
      );
      if (!data.status) {
        throw new Error(
          `SmartAPI gainers-losers error: ${data.message} (${data.errorcode})`,
        );
      }
      return data.data ?? [];
    });
  }

  /** OI buildup classification (Long Built Up, Short Covering, etc.). */
  async getOIBuildup(
    datatype: OIBuildupType,
    expirytype: ExpiryBucket = 'NEAR',
  ): Promise<OIBuildupRow[]> {
    return this.callAuthed(async (jwt) => {
      const { data } = await this.client.http.post<
        SmartApiResponse<OIBuildupRow[]>
      >(
        '/rest/secure/angelbroking/marketData/v1/OIBuildup',
        { datatype, expirytype },
        { headers: { Authorization: `Bearer ${jwt}` } },
      );
      if (!data.status) {
        throw new Error(
          `SmartAPI OI-buildup error: ${data.message} (${data.errorcode})`,
        );
      }
      return data.data ?? [];
    });
  }

  /** Put-Call Ratio across F&O underlyings. */
  async getPutCallRatio(): Promise<PutCallRatioRow[]> {
    return this.callAuthed(async (jwt) => {
      const { data } = await this.client.http.get<
        SmartApiResponse<PutCallRatioRow[]>
      >(
        '/rest/secure/angelbroking/marketData/v1/putCallRatio',
        { headers: { Authorization: `Bearer ${jwt}` } },
      );
      if (!data.status) {
        throw new Error(
          `SmartAPI PCR error: ${data.message} (${data.errorcode})`,
        );
      }
      return data.data ?? [];
    });
  }

  /** SPAN + exposure margin preview for a basket of positions. */
  async getMarginBatch(positions: MarginPosition[]): Promise<MarginPreview> {
    return this.callAuthed(async (jwt) => {
      const { data } = await this.client.http.post<
        SmartApiResponse<MarginPreview>
      >(
        '/rest/secure/angelbroking/margin/v1/batch',
        { positions },
        { headers: { Authorization: `Bearer ${jwt}` } },
      );
      if (!data.status) {
        throw new Error(
          `SmartAPI margin error: ${data.message} (${data.errorcode})`,
        );
      }
      return data.data;
    });
  }

  private async callAuthed<T>(fn: (jwt: string) => Promise<T>): Promise<T> {
    const session = await this.getValidSession();
    try {
      return await fn(session.jwtToken);
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 401) {
        this.logger.warn('SmartAPI 401 — clearing cached session and retrying');
        await this.redis.client.del(SESSION_KEY);
        const fresh = await this.login();
        return fn(fresh.jwtToken);
      }
      if (err instanceof AxiosError) {
        const body = err.response?.data ? JSON.stringify(err.response.data) : err.message;
        this.logger.error(`SmartAPI HTTP ${err.response?.status ?? '?'}: ${body}`);
        throw new Error(`SmartAPI HTTP ${err.response?.status ?? '?'}: ${body}`);
      }
      throw err;
    }
  }
}
