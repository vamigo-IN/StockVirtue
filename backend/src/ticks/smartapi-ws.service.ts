import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebSocket } from 'ws';
import { AppConfig, SmartApiConfig } from '../config/configuration';
import { Exchange } from '../common/exchange';
import { SmartApiService } from '../smartapi/smartapi.service';
import { parseTick } from './tick-parser';
import { TickBusService } from './tick-bus.service';
import {
  EXCHANGE_TO_WS_TYPE,
  PublishedTick,
  WS_TYPE_TO_EXCHANGE,
} from './tick.types';

const WS_URL = 'wss://smartapisocket.angelone.in/smart-stream';
const HEARTBEAT_INTERVAL_MS = 25_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const CORRELATION_ID = 'stockvirtue';

interface SubscriptionState {
  refCount: number;
  exchangeType: number;
}

@Injectable()
export class SmartApiWsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SmartApiWsService.name);
  private readonly cfg: SmartApiConfig;
  private ws: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectDelay = RECONNECT_BASE_MS;
  // key = "{exchangeType}:{token}"
  private readonly subscriptions = new Map<string, SubscriptionState>();
  private destroyed = false;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly smartapi: SmartApiService,
    private readonly bus: TickBusService,
  ) {
    this.cfg = config.get('smartapi', { infer: true });
  }

  async onModuleInit() {
    if (!this.cfg.pin) {
      this.logger.warn('SMARTAPI_PIN not set — skipping tick WS connect');
      return;
    }
    void this.connect();
  }

  async onModuleDestroy() {
    this.destroyed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  async addRef(exchange: Exchange, token: string): Promise<void> {
    const exchangeType = EXCHANGE_TO_WS_TYPE[exchange];
    const key = `${exchangeType}:${token}`;
    const existing = this.subscriptions.get(key);
    if (existing) {
      existing.refCount += 1;
      return;
    }
    this.subscriptions.set(key, { refCount: 1, exchangeType });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe([{ exchangeType, tokens: [token] }], 1);
    }
  }

  async removeRef(exchange: Exchange, token: string): Promise<void> {
    const exchangeType = EXCHANGE_TO_WS_TYPE[exchange];
    const key = `${exchangeType}:${token}`;
    const existing = this.subscriptions.get(key);
    if (!existing) return;
    existing.refCount -= 1;
    if (existing.refCount > 0) return;
    this.subscriptions.delete(key);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe([{ exchangeType, tokens: [token] }], 0);
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  stats() {
    return {
      connected: this.isConnected(),
      activeSubscriptions: this.subscriptions.size,
    };
  }

  private async connect(): Promise<void> {
    if (this.destroyed) return;
    try {
      const session = await this.smartapi.getValidSession();
      this.ws = new WebSocket(WS_URL, {
        headers: {
          Authorization: `Bearer ${session.feedToken}`,
          'x-api-key': this.cfg.apiKey,
          'x-client-code': this.cfg.clientCode,
          'x-feed-token': session.feedToken,
        },
      });
      this.ws.on('open', () => this.onOpen());
      this.ws.on('message', (data, isBinary) => this.onMessage(data, isBinary));
      this.ws.on('close', (code, reason) =>
        this.onClose(code, reason.toString()),
      );
      this.ws.on('error', (err) => this.logger.warn(`WS error: ${err.message}`));
    } catch (err) {
      this.logger.error(`WS connect failed: ${(err as Error).message}`);
      this.scheduleReconnect();
    }
  }

  private onOpen(): void {
    this.logger.log('SmartAPI WS connected');
    this.reconnectDelay = RECONNECT_BASE_MS;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send('ping');
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Replay existing subscriptions
    const byExchangeType = new Map<number, string[]>();
    for (const [key, state] of this.subscriptions) {
      const token = key.split(':')[1];
      const list = byExchangeType.get(state.exchangeType) ?? [];
      list.push(token);
      byExchangeType.set(state.exchangeType, list);
    }
    if (byExchangeType.size > 0) {
      const tokenList = Array.from(byExchangeType.entries()).map(
        ([exchangeType, tokens]) => ({ exchangeType, tokens }),
      );
      this.sendSubscribe(tokenList, 1);
      this.logger.log(`Replayed ${this.subscriptions.size} subscription(s)`);
    }
  }

  private onMessage(data: unknown, isBinary: boolean): void {
    if (!isBinary) {
      const txt = data?.toString() ?? '';
      if (txt === 'pong') return;
      this.logger.debug(`WS text: ${txt}`);
      return;
    }
    const buf = data as Buffer;
    const tick = parseTick(buf);
    if (!tick) return;
    const exchange = WS_TYPE_TO_EXCHANGE[tick.exchangeType];
    const published: PublishedTick = {
      exchange: exchange ?? 'UNKNOWN',
      exchangeType: tick.exchangeType,
      token: tick.token,
      ltp: tick.ltp,
      ts: tick.ts,
      lastTradedQty: tick.lastTradedQty,
      avgTradedPrice: tick.avgTradedPrice,
      volume: tick.volume,
      open: tick.open,
      high: tick.high,
      low: tick.low,
      close: tick.close,
      bids: tick.bids,
      asks: tick.asks,
      openInterest: tick.openInterest,
      upperCircuit: tick.upperCircuit,
      lowerCircuit: tick.lowerCircuit,
      yearHigh: tick.yearHigh,
      yearLow: tick.yearLow,
    };
    void this.bus.publish(published);
  }

  private onClose(code: number, reason: string): void {
    this.logger.warn(`SmartAPI WS closed (code=${code} reason="${reason}")`);
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.ws = null;
    if (!this.destroyed) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      RECONNECT_MAX_MS,
    );
    this.logger.log(`Reconnecting in ${delay}ms`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private sendSubscribe(
    tokenList: { exchangeType: number; tokens: string[] }[],
    action: 1 | 0,
  ): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const payload = {
      correlationID: CORRELATION_ID,
      action,
      // mode 3 = SnapQuote (Quote + 5-level depth + 52w hi/lo + circuit limits)
      params: { mode: 3, tokenList },
    };
    this.ws.send(JSON.stringify(payload));
  }
}
