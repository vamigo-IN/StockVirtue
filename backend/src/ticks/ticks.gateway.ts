import { Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Exchange, isExchange } from '../common/exchange';
import { AppConfig } from '../config/configuration';
import { ScripMasterService } from '../market/scrip-master.service';
import { SmartApiWsService } from './smartapi-ws.service';
import { SubscribeDto } from './dto/subscribe.dto';
import { TickBusService } from './tick-bus.service';

interface ClientSubscription {
  exchange: Exchange;
  token: string;
  symbol: string;
}

interface JwtPayload {
  sub: string;
  type: 'access' | 'refresh';
}

@WebSocketGateway({
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
})
export class TicksGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  private readonly logger = new Logger(TicksGateway.name);
  // socket.id -> set of "exchange:token" keys
  private readonly clientSubs = new Map<string, Set<string>>();
  // "exchange:token" -> symbol (for emitting friendly payloads)
  private readonly tokenIndex = new Map<string, ClientSubscription>();
  private readonly accessSecret: string;

  @WebSocketServer() server!: Server;

  constructor(
    private readonly upstream: SmartApiWsService,
    private readonly bus: TickBusService,
    private readonly scripMaster: ScripMasterService,
    private readonly jwt: JwtService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.accessSecret = config.get('jwt', { infer: true }).accessSecret;
  }

  onModuleInit() {
    this.bus.onTick((tick) => {
      const room = `${tick.exchange}:${tick.token}`;
      const entry = this.tokenIndex.get(room);
      this.server.to(room).emit('tick', {
        symbol: entry?.symbol,
        exchange: tick.exchange,
        token: tick.token,
        ltp: tick.ltp,
        ts: tick.ts,
        open: tick.open,
        high: tick.high,
        low: tick.low,
        close: tick.close,
        volume: tick.volume,
        lastTradedQty: tick.lastTradedQty,
        bids: tick.bids,
        asks: tick.asks,
        upperCircuit: tick.upperCircuit,
        lowerCircuit: tick.lowerCircuit,
        yearHigh: tick.yearHigh,
        yearLow: tick.yearLow,
      });
    });
  }

  async handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`reject ${client.id}: missing token`);
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: this.accessSecret,
      });
      if (payload.type !== 'access') {
        throw new Error('wrong token type');
      }
      client.data.userId = payload.sub;
    } catch (err) {
      this.logger.warn(
        `reject ${client.id}: invalid token (${(err as Error).message})`,
      );
      client.disconnect(true);
      return;
    }
    this.clientSubs.set(client.id, new Set());
    this.logger.log(
      `client connected ${client.id} (user ${client.data.userId})`,
    );
  }

  async handleDisconnect(client: Socket) {
    const subs = this.clientSubs.get(client.id);
    if (!subs) return;
    for (const key of subs) {
      const entry = this.tokenIndex.get(key);
      if (entry) await this.upstream.removeRef(entry.exchange, entry.token);
    }
    this.clientSubs.delete(client.id);
    this.logger.log(`client disconnected ${client.id}`);
  }

  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @MessageBody() body: SubscribeDto,
    @ConnectedSocket() client: Socket,
  ) {
    const subs = this.clientSubs.get(client.id);
    if (!subs) return { ok: false, error: 'unknown client' };
    if (!this.scripMaster.isReady()) {
      return { ok: false, error: 'scrip master not ready' };
    }
    const accepted: ClientSubscription[] = [];
    const rejected: { symbol: string; reason: string }[] = [];
    for (const item of body.symbols) {
      const exchange = this.parseExchange(item.exchange ?? 'NSE');
      if (!exchange) {
        rejected.push({ symbol: item.symbol, reason: 'bad exchange' });
        continue;
      }
      const inst = this.scripMaster.getInstrument(item.symbol, exchange);
      if (!inst) {
        rejected.push({ symbol: item.symbol, reason: 'not found' });
        continue;
      }
      const key = `${inst.exchange}:${inst.token}`;
      if (subs.has(key)) continue;
      subs.add(key);
      this.tokenIndex.set(key, {
        exchange: inst.exchange,
        token: inst.token,
        symbol: inst.name,
      });
      await client.join(key);
      await this.upstream.addRef(inst.exchange, inst.token);
      accepted.push({
        exchange: inst.exchange,
        token: inst.token,
        symbol: inst.name,
      });
    }
    return { ok: true, accepted, rejected };
  }

  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(
    @MessageBody() body: SubscribeDto,
    @ConnectedSocket() client: Socket,
  ) {
    const subs = this.clientSubs.get(client.id);
    if (!subs) return { ok: false, error: 'unknown client' };
    const removed: string[] = [];
    for (const item of body.symbols) {
      const exchange = this.parseExchange(item.exchange ?? 'NSE');
      if (!exchange) continue;
      const inst = this.scripMaster.getInstrument(item.symbol, exchange);
      if (!inst) continue;
      const key = `${inst.exchange}:${inst.token}`;
      if (!subs.has(key)) continue;
      subs.delete(key);
      await client.leave(key);
      await this.upstream.removeRef(inst.exchange, inst.token);
      removed.push(key);
    }
    return { ok: true, removed };
  }

  @SubscribeMessage('status')
  status() {
    return {
      upstream: this.upstream.stats(),
      clients: this.clientSubs.size,
    };
  }

  private parseExchange(value: string): Exchange | null {
    const upper = value.toUpperCase();
    return isExchange(upper) ? upper : null;
  }

  private extractToken(client: Socket): string | undefined {
    const fromAuth = client.handshake.auth?.token as string | undefined;
    if (fromAuth) return fromAuth;
    const authHeader = client.handshake.headers['authorization'] as
      | string
      | undefined;
    if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);
    const fromQuery = client.handshake.query['token'];
    if (typeof fromQuery === 'string') return fromQuery;
    return undefined;
  }
}
