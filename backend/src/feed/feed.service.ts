import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig, FeedConfig } from '../config/configuration';
import { ScripMasterService } from '../market/scrip-master.service';
import { SmartApiService } from '../smartapi/smartapi.service';
import { SmartApiWsService } from '../ticks/smartapi-ws.service';
import { TickBusService } from '../ticks/tick-bus.service';
import { FeedStore } from './feed.store';
import { ResolvedFeedInstrument } from './feed.types';
import { FEED_UNIVERSE } from './feed.universe';

/** Retry cadence while the scrip master is still loading at boot. */
const RESOLVE_RETRY_MS = 15_000;

/**
 * Owns the feed's upstream side: it resolves the ten instruments to live Angel
 * One tokens, holds a permanent subscription to them on the SHARED broker
 * WebSocket the trading app already runs, and keeps the store seeded from REST.
 *
 * Nothing here scales with client count. One upstream subscription serves one
 * viewer or a hundred thousand, so FinCalc traffic can never consume the broker
 * budget the trading app depends on.
 */
@Injectable()
export class FeedService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeedService.name);
  private readonly cfg: FeedConfig;
  private instruments: ResolvedFeedInstrument[] = [];
  private unsubscribeTicks: (() => void) | null = null;
  private snapshotTimer: NodeJS.Timeout | null = null;
  private universeTimer: NodeJS.Timeout | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private destroyed = false;
  private lastSnapshotAt = 0;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly scripMaster: ScripMasterService,
    private readonly upstream: SmartApiWsService,
    private readonly bus: TickBusService,
    private readonly smartapi: SmartApiService,
    private readonly store: FeedStore,
  ) {
    this.cfg = config.get('feed', { infer: true });
  }

  onModuleInit(): void {
    if (!this.cfg.enabled) {
      this.logger.log('Public market feed disabled (FEED_ENABLED=false)');
      return;
    }
    // Every tick in the process arrives here (the bus is a Redis fan-out), so
    // the handler is a single Map lookup and nothing more.
    this.unsubscribeTicks = this.bus.onTick((tick) => {
      this.store.applyTick(tick);
    });

    void this.resolveAndSubscribe();

    this.snapshotTimer = setInterval(() => {
      void this.refreshSnapshot();
    }, this.cfg.snapshotRefreshMs);

    this.universeTimer = setInterval(() => {
      void this.resolveAndSubscribe();
    }, this.cfg.universeRefreshMs);
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyed = true;
    this.unsubscribeTicks?.();
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    if (this.universeTimer) clearInterval(this.universeTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    // Release our refs so the shared upstream drops the tokens if nothing else
    // wants them — otherwise a restart would leak subscriptions.
    for (const inst of this.instruments) {
      await this.upstream.removeRef(inst.exchange, inst.token).catch(() => {});
    }
    this.instruments = [];
  }

  isEnabled(): boolean {
    return this.cfg.enabled;
  }

  stats() {
    return {
      enabled: this.cfg.enabled,
      instruments: this.instruments.length,
      expected: FEED_UNIVERSE.length,
      priced: this.store.pricedCount(),
      upstream: this.upstream.stats(),
      lastSnapshotAt: this.lastSnapshotAt || null,
    };
  }

  /** Is the upstream broker feed currently connected? */
  isLive(): boolean {
    return this.upstream.isConnected();
  }

  /**
   * Resolve every universe entry to a live token and reconcile the upstream
   * subscription. Runs at boot and on a timer: a front-month commodity future
   * rolls monthly, and its token changes when it does.
   */
  private async resolveAndSubscribe(): Promise<void> {
    if (this.destroyed) return;
    if (!this.scripMaster.isReady()) {
      // The scrip master downloads ~30 MB on its own boot; wait it out rather
      // than resolving against an empty index.
      this.logger.warn(
        `Scrip master not ready — retrying feed resolution in ${RESOLVE_RETRY_MS}ms`,
      );
      if (!this.retryTimer) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          void this.resolveAndSubscribe();
        }, RESOLVE_RETRY_MS);
      }
      return;
    }

    const resolved: ResolvedFeedInstrument[] = [];
    for (const entry of FEED_UNIVERSE) {
      const inst =
        entry.kind === 'commodity'
          ? this.scripMaster.getNearestFuture(entry.lookup, entry.exchange)
          : this.scripMaster.getInstrument(entry.lookup, entry.exchange);
      if (!inst) {
        // One unresolvable instrument must not take the feed down — the others
        // still stream, and the gap is loud in the logs.
        this.logger.error(
          `Feed instrument "${entry.id}" (${entry.exchange}:${entry.lookup}) not found in scrip master`,
        );
        continue;
      }
      resolved.push({
        ...entry,
        token: inst.token,
        tradingSymbol: inst.symbol,
        expiry: inst.expiry,
      });
    }
    if (resolved.length === 0) {
      this.logger.error('Feed resolved zero instruments — feed will be empty');
      return;
    }

    const before = new Map(
      this.instruments.map((i) => [`${i.exchange}:${i.token}`, i]),
    );
    const after = new Map(resolved.map((i) => [`${i.exchange}:${i.token}`, i]));

    for (const [key, inst] of before) {
      if (!after.has(key)) {
        await this.upstream.removeRef(inst.exchange, inst.token);
      }
    }
    for (const [key, inst] of after) {
      if (!before.has(key)) {
        await this.upstream.addRef(inst.exchange, inst.token);
      }
    }

    this.instruments = resolved;
    this.store.setInstruments(resolved);

    const added = [...after.keys()].filter((k) => !before.has(k)).length;
    const removed = [...before.keys()].filter((k) => !after.has(k)).length;
    if (added > 0 || removed > 0) {
      this.logger.log(
        `Feed universe resolved: ${resolved.length}/${FEED_UNIVERSE.length} instruments (+${added} / -${removed})`,
      );
    }
    await this.refreshSnapshot();
  }

  /**
   * Seed prices from REST. One batched call covers NSE + BSE + MCX, so this
   * costs a single upstream request per minute regardless of universe size.
   * It never overwrites a price the live feed just delivered — see FeedStore.
   */
  private async refreshSnapshot(): Promise<void> {
    if (this.destroyed || this.store.size() === 0) return;
    try {
      const rows = await this.smartapi.getMultiQuote(
        this.store.tokenGroups(),
        'FULL',
      );
      this.store.applySnapshot(rows);
      this.lastSnapshotAt = Date.now();
    } catch (err) {
      // Best-effort: the live tick feed is the real path, so a failed reseed
      // degrades staleness rather than breaking the stream.
      this.logger.warn(
        `Feed snapshot refresh failed: ${(err as Error).message}`,
      );
    }
  }
}
