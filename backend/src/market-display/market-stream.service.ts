import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { Response } from 'express';
import { MarketConfigService, TickerConfig } from './market-config.service';
import {
  DisplayQuote,
  MarketDataService,
  MarketSnapshot,
  tickerView,
} from './market-data.service';

/// Prices go out at most this often.
const PUSH_EVERY_MS = 1_000;
/// Ticker settings are re-read this often.
const SETTINGS_EVERY_MS = 5_000;
/// A sign of life while prices stand still (the market is closed).
const PING_EVERY_MS = 10_000;
/// A listener this far behind is dropped; it reconnects and starts afresh.
const MAX_BACKLOG_BYTES = 1 << 20;

/** The parts of a quote that move; a change in any of them is sent. */
const MOVING = [
  'ltp',
  'open',
  'high',
  'low',
  'prevClose',
  'change',
  'changePct',
  'label',
  'asOf',
] as const;

export type QuoteMove = Pick<DisplayQuote, 'ref' | (typeof MOVING)[number]>;

interface LiveView {
  snapshot: MarketSnapshot;
  ticker: ReturnType<typeof tickerView>;
}

const move = (q: DisplayQuote): QuoteMove => {
  const out = { ref: q.ref } as Record<string, unknown>;
  for (const k of MOVING) out[k] = q[k];
  return out as QuoteMove;
};

/**
 * Live prices for the website (Server-Sent Events). The website's server
 * holds one connection and shares it with all its readers. A listener gets
 * the whole picture when it connects (`init`), again whenever the curated
 * list, licence, sessions or ticker settings change, and otherwise only the
 * quotes that moved (`quotes`), once a second at most — the same values,
 * labels and delays as the snapshot endpoint. Runs only while someone
 * listens.
 */
@Injectable()
export class MarketStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(MarketStreamService.name);
  private readonly listeners = new Set<Response>();
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  /** What every listener has, as of the last message. */
  private view: LiveView | null = null;
  private frame = '';
  private sent = new Map<string, string>();
  private settings: { config: TickerConfig; at: number } | null = null;
  private lastWrite = 0;

  constructor(
    private readonly data: MarketDataService,
    private readonly config: MarketConfigService,
  ) {}

  /** Starts streaming to `res` until the caller goes away. */
  open(res: Response): void {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    // no-transform: compression would hold events back to fill its window.
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.socket?.setNoDelay(true);
    res.write('retry: 3000\n\n');
    this.listeners.add(res);
    res.on('close', () => {
      this.listeners.delete(res);
      if (this.listeners.size === 0) this.stop();
    });
    if (this.view) this.write(res, 'init', this.view);
    if (!this.timer) {
      this.timer = setInterval(() => void this.step(), PUSH_EVERY_MS);
      this.timer.unref();
    }
    // The first listener's picture comes from this step.
    if (!this.view) void this.step();
  }

  onModuleDestroy(): void {
    for (const res of this.listeners) res.end();
    this.listeners.clear();
    this.stop();
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.view = null;
    this.frame = '';
    this.sent.clear();
    this.settings = null;
  }

  private async step(): Promise<void> {
    if (this.busy || this.listeners.size === 0) return;
    this.busy = true;
    try {
      const now = Date.now();
      let settings = this.settings;
      if (!settings || now - settings.at >= SETTINGS_EVERY_MS) {
        settings = { config: (await this.config.ticker()).config, at: now };
        this.settings = settings;
      }
      const snapshot = await this.data.snapshot('web');
      // Everyone may have left meanwhile (stop() cleared the state).
      if (this.listeners.size === 0) return;
      const ticker = tickerView(settings.config, snapshot);
      const frame = JSON.stringify([
        snapshot.right,
        snapshot.delayMinutes,
        snapshot.attribution,
        snapshot.sessions,
        ticker.config,
        ticker.items.map((q) => q.ref),
        snapshot.instruments.map((q) => [
          q.ref,
          q.kind,
          q.name,
          q.unit,
          q.contract,
          q.inTicker,
        ]),
      ]);
      const sent = new Map<string, string>();
      const moved: QuoteMove[] = [];
      for (const q of snapshot.instruments) {
        const key = JSON.stringify(MOVING.map((k) => q[k]));
        sent.set(q.ref, key);
        if (this.sent.get(q.ref) !== key) moved.push(move(q));
      }
      this.sent = sent;
      this.view = { snapshot, ticker };
      if (frame !== this.frame) {
        this.frame = frame;
        this.broadcast('init', this.view);
      } else if (moved.length) {
        this.broadcast('quotes', {
          generatedAt: snapshot.generatedAt,
          quotes: moved,
        });
      } else if (now - this.lastWrite >= PING_EVERY_MS) {
        this.broadcast('ping', { generatedAt: snapshot.generatedAt });
      }
    } catch (err) {
      this.logger.warn(`Live market update failed: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  private broadcast(event: string, data: unknown): void {
    const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of this.listeners) this.send(res, chunk);
    this.lastWrite = Date.now();
  }

  private write(res: Response, event: string, data: unknown): void {
    this.send(res, `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  private send(res: Response, chunk: string): void {
    if (res.writableLength > MAX_BACKLOG_BYTES) {
      res.destroy();
      return;
    }
    res.write(chunk);
  }
}
