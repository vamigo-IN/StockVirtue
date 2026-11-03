import type { NextRequest } from 'next/server';
import { marketHub } from '@/market/stream-hub';

/**
 * Live prices for the ticker and market widgets (Server-Sent Events). Every
 * reader shares this server's one connection to the API; see stream-hub.
 */
export const dynamic = 'force-dynamic';

export function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let leave = () => {};
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      leave = marketHub().join((chunk) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          leave();
        }
      });
      req.signal.addEventListener('abort', () => {
        leave();
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      });
    },
    cancel() {
      leave();
    },
  });
  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      // no-transform: compression would hold events back.
      'cache-control': 'no-cache, no-transform',
      // nginx: pass each event straight through.
      'x-accel-buffering': 'no',
    },
  });
}
