import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { marketSession } from '../common/market-hours';
import { AppConfig, FeedConfig } from '../config/configuration';
import { FeedAuthService } from './feed.auth.service';
import { FeedService } from './feed.service';
import { FeedStore } from './feed.store';
import { FeedSnapshotFrame } from './feed.types';
import { FEED_UNIVERSE_IDS, isFeedInstrumentId } from './feed.universe';

/** Clients with no symbol filter — the common case — share one broadcast. */
const ROOM_ALL = 'all';

/** Inbound message budget per socket. Generous for a client that only ever
 *  sends a `subscribe` and the odd `refresh`; tight enough to stop a loop. */
const MSG_LIMIT = 30;
const MSG_WINDOW_MS = 10_000;

interface SocketState {
  clientId: string;
  ip: string;
  /** null = every instrument. */
  filter: Set<string> | null;
  msgCount: number;
  msgWindowStart: number;
}

/**
 * The single public market-data WebSocket.
 *
 * It lives on its own Socket.IO namespace (`/fincalc`), which keeps it
 * completely separate from the trading app's tick gateway on `/`: different
 * authentication (API key, not a user JWT), different data (ten fixed
 * instruments, no user state), different limits. Neither can affect the other,
 * and both share the one broker connection this process already maintains.
 *
 * Protocol
 * --------
 *   connect   handshake `auth: { token: "<credential>", symbols?: [ids] }`
 *   ← snapshot  { ts, marketOpen, live, data: [Quote, …] }   once, on connect
 *   ← update    { ts, data: [Quote, …] }                     changed only, ~1/s
 *   → subscribe { symbols: [ids] }  → ack { ok, symbols }    optional filter
 *   → refresh   → ack (a fresh snapshot frame)               optional
 *
 * Socket.IO's own heartbeat handles liveness; there is no app-level ping.
 */
// `cors` mirrors TicksGateway on purpose. Socket.IO has ONE server per port and
// takes its options from whichever gateway is constructed first, so declaring
// the same value here makes module ordering irrelevant — reordering imports can
// never silently strip CORS from the trading app's socket. Origin policy for
// THIS feed is enforced per-connection below, against FEED_ALLOWED_ORIGINS.
@WebSocketGateway({
  namespace: 'fincalc',
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
})
export class FeedGateway
  implements
    OnGatewayConnection,
    OnGatewayDisconnect,
    OnModuleInit,
    OnModuleDestroy
{
  private readonly logger = new Logger(FeedGateway.name);
  private readonly cfg: FeedConfig;
  private readonly states = new Map<string, SocketState>();
  private readonly perIp = new Map<string, number>();
  private flushTimer: NodeJS.Timeout | null = null;

  @WebSocketServer() server!: Namespace;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly auth: FeedAuthService,
    private readonly feed: FeedService,
    private readonly store: FeedStore,
  ) {
    this.cfg = config.get('feed', { infer: true });
  }

  onModuleInit(): void {
    if (!this.cfg.enabled) return;
    this.flushTimer = setInterval(() => this.flush(), this.cfg.broadcastMs);
    this.logger.log(
      `Public market feed live on /fincalc — ${FEED_UNIVERSE_IDS.length} instruments, ${this.cfg.broadcastMs}ms broadcast`,
    );
  }

  onModuleDestroy(): void {
    if (this.flushTimer) clearInterval(this.flushTimer);
  }

  async handleConnection(client: Socket): Promise<void> {
    if (!this.cfg.enabled) {
      return this.reject(client, 'feed_disabled', 'Market feed is disabled');
    }
    if (this.states.size >= this.cfg.maxConnections) {
      return this.reject(client, 'server_busy', 'Feed is at capacity');
    }

    // Browser clients only: native apps send no Origin header, so an empty
    // allowlist (the default) is not a hole for them — it just means we do not
    // police a header they never send.
    const origin = (client.handshake.headers.origin ?? '').toLowerCase();
    if (this.cfg.allowedOrigins.length > 0 && origin) {
      if (!this.cfg.allowedOrigins.includes(origin)) {
        return this.reject(client, 'origin_denied', 'Origin not allowed');
      }
    }

    const ip = this.clientIp(client);
    const existing = this.perIp.get(ip) ?? 0;
    if (existing >= this.cfg.maxConnectionsPerIp) {
      return this.reject(
        client,
        'too_many_connections',
        'Too many connections',
      );
    }

    const credential =
      (client.handshake.auth?.token as string | undefined) ??
      (client.handshake.auth?.key as string | undefined) ??
      this.bearerHeader(client);
    const result = this.auth.verify(credential);
    if (!result.ok) {
      // The reason is logged, never sent: telling a caller *why* a credential
      // failed is a free oracle for guessing a valid one.
      this.logger.warn(`feed auth rejected (${result.reason}) ip=${ip}`);
      return this.reject(client, 'unauthorized', 'Unauthorized');
    }

    const filter = this.parseSymbols(client.handshake.auth?.symbols);
    this.perIp.set(ip, existing + 1);
    this.states.set(client.id, {
      clientId: result.clientId,
      ip,
      filter,
      msgCount: 0,
      msgWindowStart: Date.now(),
    });
    if (!filter) await client.join(ROOM_ALL);

    client.emit('snapshot', this.snapshotFrame(filter));
    this.logger.debug(
      `feed client connected ${client.id} (${result.clientId}, ${result.mode})`,
    );
  }

  handleDisconnect(client: Socket): void {
    const state = this.states.get(client.id);
    if (!state) return;
    this.states.delete(client.id);
    const left = (this.perIp.get(state.ip) ?? 1) - 1;
    if (left <= 0) this.perIp.delete(state.ip);
    else this.perIp.set(state.ip, left);
  }

  /** Narrow the stream to a subset of the universe. Optional — the default is
   *  every instrument, which is what a home-screen strip wants. */
  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @MessageBody() body: unknown,
    @ConnectedSocket() client: Socket,
  ) {
    const state = this.states.get(client.id);
    if (!state) return { ok: false, error: 'unauthorized' };
    if (!this.allowMessage(state, client)) return;

    const raw = (body as { symbols?: unknown } | undefined)?.symbols;
    const filter = this.parseSymbols(raw);
    state.filter = filter;
    if (filter) await client.leave(ROOM_ALL);
    else await client.join(ROOM_ALL);

    // Send the current values for the new selection straight away so the
    // client never shows an empty tile waiting for the next tick.
    client.emit('snapshot', this.snapshotFrame(filter));
    return {
      ok: true,
      symbols: filter ? [...filter] : [...FEED_UNIVERSE_IDS],
    };
  }

  /** Re-request the full current state — useful after the app returns from
   *  background and wants to repaint without reconnecting. */
  @SubscribeMessage('refresh')
  handleRefresh(@ConnectedSocket() client: Socket) {
    const state = this.states.get(client.id);
    if (!state) return { ok: false, error: 'unauthorized' };
    if (!this.allowMessage(state, client)) return;
    return this.snapshotFrame(state.filter);
  }

  /** Coalesced fan-out: one frame per broadcast window carrying only what
   *  moved. Ticks arrive far faster than this; sending each one would burn
   *  mobile battery for changes no eye can follow. */
  private flush(): void {
    const changed = this.store.drainDirty();
    if (changed.length === 0 || this.states.size === 0) return;
    const ts = Date.now();

    // One serialized broadcast covers every unfiltered client.
    this.server.to(ROOM_ALL).emit('update', { ts, data: changed });

    for (const [socketId, state] of this.states) {
      if (!state.filter) continue;
      const subset = changed.filter((q) => state.filter!.has(q.id));
      if (subset.length === 0) continue;
      this.server.sockets.get(socketId)?.emit('update', { ts, data: subset });
    }
  }

  private snapshotFrame(filter: Set<string> | null): FeedSnapshotFrame {
    const all = this.store.snapshot();
    const now = new Date();
    return {
      ts: Date.now(),
      marketOpen: {
        equity: marketSession(now).kind === 'open',
        commodity: marketSession(now, undefined, 'MCX').kind === 'open',
      },
      live: this.feed.isLive(),
      data: filter ? all.filter((q) => filter.has(q.id)) : all,
    };
  }

  /** null means "no filter"; unknown ids are dropped rather than erroring, so
   *  a newer app asking for an instrument we do not carry still works. */
  private parseSymbols(raw: unknown): Set<string> | null {
    if (!Array.isArray(raw)) return null;
    const ids = raw.filter(isFeedInstrumentId);
    if (ids.length === 0 || ids.length === FEED_UNIVERSE_IDS.length)
      return null;
    return new Set(ids);
  }

  private allowMessage(state: SocketState, client: Socket): boolean {
    const now = Date.now();
    if (now - state.msgWindowStart > MSG_WINDOW_MS) {
      state.msgWindowStart = now;
      state.msgCount = 0;
    }
    state.msgCount += 1;
    if (state.msgCount > MSG_LIMIT) {
      this.logger.warn(
        `feed client ${state.clientId} exceeded message rate — disconnecting`,
      );
      client.emit('error_frame', { code: 'rate_limited' });
      client.disconnect(true);
      return false;
    }
    return true;
  }

  private reject(client: Socket, code: string, message: string): void {
    client.emit('error_frame', { code, message });
    client.disconnect(true);
  }

  private bearerHeader(client: Socket): string | undefined {
    const header = client.handshake.headers['authorization'];
    return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  }

  /** Behind the reverse proxy the socket address is the proxy's, so per-IP
   *  limits would count every user as one host. Trust exactly one hop — the
   *  same assumption `trust proxy 1` makes for HTTP. */
  private clientIp(client: Socket): string {
    const forwarded = client.handshake.headers['x-forwarded-for'];
    const raw = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    if (raw) {
      const first = raw.split(',')[0]?.trim();
      if (first) return first;
    }
    return client.handshake.address;
  }
}
