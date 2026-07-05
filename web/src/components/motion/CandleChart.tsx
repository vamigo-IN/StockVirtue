'use client';

import { useEffect, useRef } from 'react';

type Candle = { o: number; h: number; l: number; c: number };

const UP = '#22c55e';
const DOWN = '#ef4444';
const GRID = 'rgba(34,197,94,0.10)';
const LINE = '#4ade80';

/** Bounded random-walk OHLC series so the chart always looks like a real,
 *  mildly-trending-up market without ever running off the canvas. */
function makeSeries(n: number): Candle[] {
  let price = 100;
  const out: Candle[] = [];
  for (let i = 0; i < n; i++) {
    const drift = 0.35; // gentle upward bias — it's a hopeful hero
    const o = price;
    const move = (Math.random() - 0.5) * 6 + drift;
    const c = Math.max(60, Math.min(150, o + move));
    const h = Math.max(o, c) + Math.random() * 2.5;
    const l = Math.min(o, c) - Math.random() * 2.5;
    out.push({ o, h, l, c });
    price = c;
  }
  return out;
}

/**
 * The hero's living instrument. On mount it DRAWS ITSELF left→right (one
 * candle at a time), traces a sparkline along the closes, then keeps the
 * right-most candle "live" with a bounded random walk. Pauses when scrolled
 * out of view; renders a full static frame under reduced motion.
 */
export function CandleChart({
  count = 34,
  className,
}: {
  count?: number;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches;

    const data = makeSeries(count);
    let W = 0;
    let H = 0;
    const pad = { t: 14, r: 10, b: 14, l: 10 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = wrap.clientWidth;
      H = wrap.clientHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const bounds = () => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const d of data) {
        lo = Math.min(lo, d.l);
        hi = Math.max(hi, d.h);
      }
      const span = hi - lo || 1;
      return { lo: lo - span * 0.08, hi: hi + span * 0.08 };
    };

    const draw = (visible: number) => {
      const { lo, hi } = bounds();
      const iw = W - pad.l - pad.r;
      const ih = H - pad.t - pad.b;
      const y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
      const slot = iw / count;
      const bw = Math.max(2, slot * 0.56);

      ctx.clearRect(0, 0, W, H);

      // grid
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      for (let g = 0; g <= 4; g++) {
        const gy = pad.t + (ih / 4) * g;
        ctx.beginPath();
        ctx.moveTo(pad.l, gy);
        ctx.lineTo(W - pad.r, gy);
        ctx.stroke();
      }

      // sparkline along closes (drawn up to `visible`)
      ctx.beginPath();
      for (let i = 0; i < Math.ceil(visible); i++) {
        const cx = pad.l + slot * i + slot / 2;
        const cy = y(data[i].c);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      }
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.6;
      ctx.shadowColor = 'rgba(34,197,94,0.55)';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // candles
      for (let i = 0; i < count; i++) {
        const appear = i + 1 - visible; // >0 while still hidden
        if (appear > 0) continue;
        const grow = Math.max(0, Math.min(1, visible - i)); // 0..1 rise-in
        const d = data[i];
        const cx = pad.l + slot * i + slot / 2;
        const up = d.c >= d.o;
        const color = up ? UP : DOWN;
        const midO = y(d.o);
        const midC = y(d.c);
        const top = Math.min(midO, midC);
        const bottom = Math.max(midO, midC);
        const mid = (top + bottom) / 2;
        // grow from the mid outward for a spring-rise feel
        const gTop = mid - (mid - top) * grow;
        const gBottom = mid + (bottom - mid) * grow;
        // wick
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.5 + 0.5 * grow;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, y(d.h) * grow + mid * (1 - grow));
        ctx.lineTo(cx, y(d.l) * grow + mid * (1 - grow));
        ctx.stroke();
        // body
        ctx.fillStyle = color;
        ctx.globalAlpha = up ? 0.85 * (0.4 + 0.6 * grow) : 0.9 * (0.4 + 0.6 * grow);
        const bh = Math.max(1, gBottom - gTop);
        ctx.fillRect(cx - bw / 2, gTop, bw, bh);
        ctx.globalAlpha = 1;
      }

      // last-candle glow dot
      const last = Math.min(count, Math.floor(visible)) - 1;
      if (last >= 0) {
        const cx = pad.l + slot * last + slot / 2;
        const cy = y(data[last].c);
        ctx.beginPath();
        ctx.arc(cx, cy, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = LINE;
        ctx.shadowColor = LINE;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    let raf = 0;
    let visible = reduce ? count : 0;
    let running = true;
    let lastTick = 0;

    const loop = (t: number) => {
      if (!running) return;
      let dirty = false;
      if (visible < count) {
        visible = Math.min(count, visible + 0.5); // ~ one candle / 2 frames
        dirty = true;
      } else if (!reduce) {
        // keep the right-most candle alive — mutate (and repaint) only on tick
        if (t - lastTick > 700) {
          lastTick = t;
          const d = data[count - 1];
          const prev = data[count - 2]?.c ?? d.o;
          d.o = prev;
          d.c = Math.max(60, Math.min(150, d.c + (Math.random() - 0.48) * 5));
          d.h = Math.max(d.o, d.c) + Math.random() * 2;
          d.l = Math.min(d.o, d.c) - Math.random() * 2;
          dirty = true;
        }
      }
      if (dirty) draw(visible);
      if (visible < count || !reduce) raf = requestAnimationFrame(loop);
    };

    if (reduce) {
      draw(count);
    } else {
      raf = requestAnimationFrame(loop);
    }

    // Pause when offscreen.
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !reduce) {
          if (!running) {
            running = true;
            raf = requestAnimationFrame(loop);
          }
        } else {
          running = false;
          cancelAnimationFrame(raf);
        }
      },
      { threshold: 0.05 },
    );
    io.observe(wrap);

    const ro = new ResizeObserver(() => {
      resize();
      draw(visible);
    });
    ro.observe(wrap);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, [count]);

  return (
    <div
      ref={wrapRef}
      className={`candle-wrap${className ? ` ${className}` : ''}`}
      style={{ height: 150 }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
