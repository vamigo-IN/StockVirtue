import 'server-only';
import { API_V1 } from '@/portal/backend';
import { applyQuotes, type LiveView, type QuotesEvent } from './live';

/// A comment line this often keeps proxies from closing quiet connections.
const KEEPALIVE_MS = 15_000;
/// Waits before reconnecting to the API, growing with each failure.
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000];
/// The API connection outlives the last reader briefly (page changes).
const IDLE_MS = 30_000;

type Send = (chunk: string) => void;

/**
 * One live connection to the API, shared by every reader on this server:
 * however many people read, the API streams to the website once. Keeps the
 * current picture so a new reader starts with it, and forwards each event
 * as it comes.
 */
class MarketHub {
  private readonly readers = new Set<Send>();
  private view: LiveView | null = null;
  private upstream: AbortController | null = null;
  private failures = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private idle: ReturnType<typeof setTimeout> | null = null;
  private keepalive: ReturnType<typeof setInterval> | null = null;

  /** Adds a reader; returns its goodbye. */
  join(send: Send): () => void {
    this.readers.add(send);
    if (this.idle) clearTimeout(this.idle);
    this.idle = null;
    send('retry: 5000\n\n');
    if (this.view) send(message('init', JSON.stringify(this.view)));
    this.keepalive ??= setInterval(
      () => this.broadcast(': keepalive\n\n'),
      KEEPALIVE_MS,
    );
    this.connect();
    let gone = false;
    return () => {
      if (gone) return;
      gone = true;
      this.readers.delete(send);
      if (this.readers.size === 0 && !this.idle) {
        this.idle = setTimeout(() => this.shutdown(), IDLE_MS);
      }
    };
  }

  private shutdown() {
    this.idle = null;
    if (this.readers.size) return;
    this.upstream?.abort();
    this.upstream = null;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    if (this.keepalive) clearInterval(this.keepalive);
    this.keepalive = null;
    this.view = null;
  }

  private connect() {
    if (this.upstream || this.retry) return;
    const ac = new AbortController();
    this.upstream = ac;
    void this.pump(ac.signal).finally(() => {
      if (this.upstream === ac) this.upstream = null;
      // Readers keep what they have and poll until the stream is back.
      this.view = null;
      if (ac.signal.aborted || this.readers.size === 0) return;
      const wait = RETRY_MS[Math.min(this.failures++, RETRY_MS.length - 1)];
      this.retry = setTimeout(() => {
        this.retry = null;
        if (this.readers.size) this.connect();
      }, wait);
    });
  }

  private async pump(signal: AbortSignal) {
    try {
      const res = await fetch(`${API_V1}/market/stream`, {
        headers: {
          accept: 'text/event-stream',
          'x-site-admin-key': process.env.SITE_ADMIN_KEY ?? '',
        },
        cache: 'no-store',
        signal,
      });
      if (!res.ok || !res.body) return;
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buf += value.replace(/\r\n?/g, '\n');
        let cut: number;
        while ((cut = buf.indexOf('\n\n')) >= 0) {
          this.handle(buf.slice(0, cut));
          buf = buf.slice(cut + 2);
        }
      }
    } catch {
      // Aborted, or the API went away: connect() retries.
    }
  }

  private handle(block: string) {
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (data.length === 0) return;
    const raw = data.join('\n');
    try {
      if (event === 'init') {
        this.view = JSON.parse(raw) as LiveView;
        this.failures = 0;
      } else if (event === 'quotes') {
        if (!this.view) return;
        this.view = applyQuotes(this.view, JSON.parse(raw) as QuotesEvent);
      } else if (event !== 'ping') {
        return;
      }
    } catch {
      return;
    }
    this.broadcast(message(event, raw));
  }

  private broadcast(chunk: string) {
    for (const send of this.readers) send(chunk);
  }
}

const message = (event: string, data: string) =>
  `event: ${event}\ndata: ${data}\n\n`;

// One hub per server process (kept across dev reloads).
const g = globalThis as typeof globalThis & { svMarketHub?: MarketHub };
export const marketHub = () => (g.svMarketHub ??= new MarketHub());
