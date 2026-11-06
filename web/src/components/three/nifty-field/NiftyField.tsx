'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { COPY, pillText } from '@/components/market/copy';
import { heatBin, type HeatGridAlt } from '@/components/market/HeatGrid';
import { stockHref } from '@/components/market/parts';
import { useInViewMarket } from '@/components/market/useInViewMarket';
import { useQuotable } from '@/components/market/useQuotable';
import { set3DOff, watch3DConditions } from '@/components/three/core/dispose';
import { fmtPct, fmtPrice } from '@/components/widgets/format';
import { StampTime } from '@/components/widgets/StampTime';
import { can3D } from '@/lib/three-gate';
import { clsx } from 'clsx';
import { marketPath, type HeatmapIndex } from '@/market/paths';
import type { Labelled, ListRow } from '@/market/types';
import s from './nifty-field.module.css';
import type { FieldColors, FieldItem, HeatBinKey, NiftyFieldScene } from './scene';

/** Interface strings (spec §6.7, §9.6). */
const LABEL = 'View in 3D';
const LOADING = 'Loading the 3D view';
const FAILED = 'The 3D view couldn’t load. The grid shows the same data.';
const caption = (indexName: string) =>
  `Each block is one ${indexName} company. Height shows the day’s change, up to 4%; blocks below the plane fell. Blocks are equal in size and don’t show index weight.`;
const openLabel = (name: string) => `Open ${name}`;

type AltProps = Parameters<HeatGridAlt['render']>[0];

/**
 * A scene kept for a moment after its component unmounts. HeatGrid draws
 * each index tab's body in its own tab panel, so a tab change remounts the
 * Field: the next mount adopts the kept scene (one WebGL context, the old
 * blocks sink and the new ones rise), and "Back to the grid", then "View in
 * 3D" within the window shows the blocks at full height. Otherwise it is
 * disposed when the window ends.
 */
const KEEP_MS = 2500;
let kept: { scene: NiftyFieldScene; index: string; timer: number } | null = null;

function keepScene(scene: NiftyFieldScene, index: string) {
  if (kept) {
    window.clearTimeout(kept.timer);
    kept.scene.dispose();
  }
  const entry = {
    scene,
    index,
    timer: window.setTimeout(() => {
      if (kept === entry) kept = null;
      scene.dispose();
    }, KEEP_MS),
  };
  scene.onGiveUp = () => {
    if (kept === entry) {
      window.clearTimeout(entry.timer);
      kept = null;
    }
    scene.dispose();
  };
  kept = entry;
}

function takeScene() {
  const k = kept;
  if (!k) return null;
  window.clearTimeout(k.timer);
  kept = null;
  return k;
}

const BINS: HeatBinKey[] = ['n3', 'n2', 'n1', '0', 'p1', 'p2', 'p3'];

/** Dev builds only: the gallery's checks read the latest scene's debug API. */
function exposeForChecks(scene: NiftyFieldScene, root: HTMLElement) {
  if (process.env.NODE_ENV === 'production') return;
  (window as unknown as { __svField?: unknown }).__svField = { scene, root };
}

/** The heat bins and surfaces from the element's computed style (the blue/orange palette follows). */
function readColors(el: Element): FieldColors {
  const cs = getComputedStyle(el);
  const v = (name: string) => cs.getPropertyValue(name).trim() || 'gray';
  const bins = Object.fromEntries(BINS.map((b) => [b, v(`--sv-heat-${b}`)])) as Record<HeatBinKey, string>;
  return {
    bins,
    plane: v('--sv-surface-2'),
    line: v('--sv-line'),
    outline: v('--sv-fg'),
    clear: v('--sv-surface'),
  };
}

/**
 * The Nifty Field (spec §6.7): the selected index's members as equal blocks
 * on a pale plane, in HeatGrid's alternative-view slot. Readers who never
 * press "View in 3D" pay nothing: this component mounts only then, and it
 * imports scene.ts (three.js) on mount. While that loads the tiles stay
 * (HeatGrid's `grid`) with "Loading the 3D view"; if it fails they stay
 * with "The 3D view couldn't load. The grid shows the same data." A lost
 * context, a give-up or the 3D conditions changing (a narrower window,
 * reduced motion) return to the grid through `exit()`.
 *
 * - Hover (fine pointers): the block's outline and a tooltip ("HDFC Bank ·
 *   HDFCBANK · 1,642.30 · ▲ +1.24% · Live · 4 Nov, 3:05 pm IST", the
 *   payload's label and time); a click opens the stock page only when the
 *   symbol is quotable. Parallax on fine pointers only.
 * - Taps (coarse pointers) select a block and show its tooltip, with "Open
 *   {name}" when quotable; a tap elsewhere clears it. No drag-rotate and no
 *   touch handler that blocks scrolling.
 * - Keyboard and screen readers use the card's "View as list" rows:
 *   hovering or focusing one outlines its block (no tooltip). The canvas is
 *   aria-hidden.
 */
export function NiftyField({ rows, index, highlighted, exit, grid }: AltProps) {
  const router = useRouter();
  const quotable = useQuotable();
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<NiftyFieldScene | null>(null);
  const exitRef = useRef(exit);
  const indexRef = useRef(index);
  const freshRef = useRef(true);
  const pointerRef = useRef<string>('mouse');
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [hover, setHover] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [tipAt, setTipAt] = useState<{ x: number; y: number } | null>(null);
  const [tipLeft, setTipLeft] = useState<number | null>(null);

  useEffect(() => {
    exitRef.current = exit;
  }, [exit]);

  // The payload's label and time for the tooltip: the same request as
  // HeatGrid's (one store entry), paused off screen like it.
  const heat = useInViewMarket<Labelled<ListRow[]>>(marketPath.heatmap(index as HeatmapIndex), 60);
  const payload = heat.data;

  const items = useMemo<FieldItem[]>(
    () =>
      rows
        .filter((r) => r.changePct !== null)
        .map((r) => ({ symbol: r.symbol, pct: r.changePct ?? 0, bin: heatBin(r.changePct ?? 0) })),
    [rows],
  );
  const itemsRef = useRef(items);
  const bySymbol = useMemo(() => new Map(rows.map((r) => [r.symbol, r])), [rows]);
  const key = items.map((i) => `${i.symbol}:${i.pct}`).join(',');

  // Mount: adopt a kept scene, or load the module and make one.
  useEffect(() => {
    const host = hostRef.current;
    const root = rootRef.current;
    if (!host || !root) return;
    let cancelled = false;
    let dead = false;
    const giveUp = () => {
      if (dead) return;
      dead = true;
      set3DOff();
      const sc = sceneRef.current;
      sceneRef.current = null;
      sc?.dispose();
      exitRef.current();
    };
    const adopted = takeScene();
    if (adopted) {
      freshRef.current = false;
      adopted.scene.onGiveUp = giveUp;
      adopted.scene.attach(host);
      adopted.scene.setColors(readColors(root));
      adopted.scene.setItems(itemsRef.current, adopted.index === indexRef.current ? 'instant' : 'tab');
      sceneRef.current = adopted.scene;
      exposeForChecks(adopted.scene, root);
      setState('ready');
    } else {
      import('./scene')
        .then(async ({ mountNiftyField }) => {
          if (cancelled) return;
          const sc = mountNiftyField(host, {
            items: itemsRef.current,
            colors: readColors(root),
            onGiveUp: giveUp,
          });
          sceneRef.current = sc;
          exposeForChecks(sc, root);
          await sc.ready;
          if (!cancelled && sceneRef.current === sc) setState('ready');
        })
        .catch(() => {
          if (cancelled) return;
          const sc = sceneRef.current;
          sceneRef.current = null;
          sc?.dispose();
          setState('failed');
        });
    }
    // 3D is no longer allowed (narrower window, reduced motion): back to the grid.
    const unwatch = watch3DConditions(() => {
      if (!can3D()) {
        dead = true;
        const sc = sceneRef.current;
        sceneRef.current = null;
        sc?.dispose();
        exitRef.current();
      }
    });
    const onPalette = () => sceneRef.current?.setColors(readColors(root));
    window.addEventListener('sv:palette', onPalette);
    return () => {
      cancelled = true;
      unwatch();
      window.removeEventListener('sv:palette', onPalette);
      const sc = sceneRef.current;
      sceneRef.current = null;
      if (sc && !dead) keepScene(sc, indexRef.current);
    };
  }, []);

  // The first frame after the press: the blocks rise by rank (a fresh scene).
  useLayoutEffect(() => {
    if (state !== 'ready') return;
    if (freshRef.current) sceneRef.current?.reveal(true);
    freshRef.current = false;
  }, [state]);

  // A refresh (60 s) eases heights, colours and places; a new index sinks
  // and rises. The mount above already gave the scene the first rows.
  const seenRef = useRef({ key, index });
  useEffect(() => {
    itemsRef.current = items;
    const seen = seenRef.current;
    if (seen.key === key && seen.index === index) return;
    const tab = seen.index !== index;
    seenRef.current = { key, index };
    indexRef.current = index;
    sceneRef.current?.setItems(items, tab ? 'tab' : 'refresh');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, index]);

  // A tap elsewhere on the page clears the tapped block.
  useEffect(() => {
    if (!picked) return;
    const onDown = (e: globalThis.PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setPicked(null);
        setTipAt(null);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [picked]);

  const shown = hover ?? picked;
  useEffect(() => {
    sceneRef.current?.setOutline(shown ?? highlighted ?? null);
  }, [shown, highlighted, state]);

  // Keep the tooltip inside the card.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    const root = rootRef.current;
    if (!tip || !root || !tipAt) {
      setTipLeft(null);
      return;
    }
    const half = tip.offsetWidth / 2;
    const w = root.clientWidth;
    setTipLeft(Math.min(Math.max(tipAt.x, half + 4), Math.max(half + 4, w - half - 4)));
  }, [tipAt, shown]);

  const point = (e: { clientX: number; clientY: number; currentTarget: HTMLElement }) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    pointerRef.current = e.pointerType;
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    pointerRef.current = 'mouse';
    const sc = sceneRef.current;
    if (!sc || state !== 'ready') return;
    const p = point(e);
    sc.setPointer((p.x / p.w) * 2 - 1, (p.y / p.h) * 2 - 1);
    const sym = sc.pick(p.x, p.y);
    setHover(sym);
    setTipAt(sym ? sc.anchor(sym) : null);
  };
  const onPointerLeave = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    sceneRef.current?.setPointer(null, null);
    setHover(null);
    if (!picked) setTipAt(null);
  };
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const sc = sceneRef.current;
    if (!sc || state !== 'ready') return;
    const p = point(e);
    const sym = sc.pick(p.x, p.y);
    const row = sym ? bySymbol.get(sym) : undefined;
    if (pointerRef.current === 'mouse') {
      if (row && quotable.has(row.ref.toUpperCase())) router.push(stockHref(row.symbol));
      return;
    }
    // Taps select a block (or clear the selection).
    setPicked(sym);
    setTipAt(sym ? sc.anchor(sym) : null);
  };

  const indexName = COPY.heatTabs[index as HeatmapIndex] ?? index;
  const tipRow = shown ? bySymbol.get(shown) : undefined;
  const tipLink = !!tipRow && !hover && !!picked && quotable.has(tipRow.ref.toUpperCase());
  const hoverLink = !!hover && !!bySymbol.get(hover) && quotable.has(bySymbol.get(hover)!.ref.toUpperCase());

  return (
    <div ref={rootRef} className={s.field} data-nifty-field={state}>
      {state !== 'ready' ? grid : null}
      <div
        ref={hostRef}
        className={s.host}
        data-state={state}
        data-pick={hoverLink ? 'link' : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
      />
      {state === 'ready' && tipRow && tipAt ? (
        <div
          ref={tipRef}
          className={s.tip}
          style={{ left: tipLeft ?? tipAt.x, top: tipAt.y }}
          data-interactive={tipLink ? '' : undefined}
        >
          <p className="t-small m-0">
            <span className="font-semibold">{tipRow.name}</span> · {tipRow.symbol} · {fmtPrice(tipRow.ltp)} ·{' '}
            {(tipRow.changePct ?? 0) > 0 ? '▲ ' : (tipRow.changePct ?? 0) < 0 ? '▼ ' : ''}
            {fmtPct(tipRow.changePct)}
            {payload?.label && payload.asOf ? (
              <>
                {' · '}
                {pillText(payload.label)} · <StampTime iso={payload.asOf} />
              </>
            ) : null}
          </p>
          {tipLink ? (
            <Link href={stockHref(tipRow.symbol)} prefetch={false} className={clsx(s.tipLink, 'sv-quiet t-small')}>
              {openLabel(tipRow.name)}
            </Link>
          ) : null}
        </div>
      ) : null}
      <p ref={heat.ref} className={clsx(s.status, 't-meta text-fg-2')} aria-live="polite">
        {state === 'loading' ? LOADING : state === 'failed' ? FAILED : ''}
      </p>
      {state === 'ready' ? <p className={clsx(s.caption, 't-meta text-fg-3')}>{caption(indexName)}</p> : null}
    </div>
  );
}

/**
 * HeatGrid's alternative view (spec §4.10, §6.7): "View in 3D", offered
 * when the 3D gate passes (can3D(): at least 768 × 600, no reduced motion,
 * a capable device; HeatGrid itself shows the button only with a LIVE
 * heatmap). A module constant, so HeatGrid's effect sees a stable object.
 */
export const niftyFieldAlt: HeatGridAlt = {
  label: LABEL,
  available: () => can3D(),
  render: (p) => <NiftyField {...p} />,
};
