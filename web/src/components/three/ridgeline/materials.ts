/**
 * The Ridgeline's materials and colours (spec §6.4.3, §6.4.7). One slot
 * table for both renderings (layout.ts `slotStyle`): the poster mixes the
 * same tokens in CSS with color-mix(in srgb …), and this module mixes them
 * in sRGB here, so a slot's fill is the same colour in both.
 *
 * - Bodies: MeshBasicMaterial in the slot fill (--sv-surface mixed toward
 *   --sv-paper by 15% per slot), opaque, with polygonOffset so the edge
 *   drawn at the same depth wins.
 * - Edges: LineMaterial in --sv-fg at the slot's width and opacity. The
 *   opacity is applied by pre-mixing --sv-fg over the slot fill and drawing
 *   the line opaque: a translucent Line2 blends each segment separately, so
 *   its round joins would darken where segments overlap, which the poster's
 *   single SVG stroke never does. Every ridge sits on near-white (the fills
 *   and the paper differ by at most 9 levels), so the pre-mixed colour
 *   matches the poster's stroke within 2 levels on both sides of the line.
 * - Reference lines: one segment each (no joins), so they stay truly
 *   translucent, drawn last and above every ridge, like the poster's.
 *
 * Colour management stays on: colours are given as sRGB, so a token's hex
 * renders as that hex.
 */
import { Color, MeshBasicMaterial, SRGBColorSpace } from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { REF_OPACITY, slotStyle } from '@/components/home/ridgeline/layout';

/** The token colours the scene needs, read from the page (getComputedStyle). */
export interface RidgeTokens {
  paper: string;
  surface: string;
  fg: string;
}

type RGB = readonly [number, number, number];

/** A CSS colour as resolved by the browser ("rgb(246, 245, 241)") → [r, g, b] 0–255. */
function parseRgb(css: string): RGB | null {
  const m = css.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = css.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!h) return null;
  const hex =
    h[1].length === 3
      ? h[1]
          .split('')
          .map((c) => c + c)
          .join('')
      : h[1];
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/**
 * Reads --sv-paper, --sv-surface and --sv-fg as the browser resolves them
 * at `el` (so a surface scope or the colour-blind palette applies), through
 * a hidden probe's computed colour.
 */
export function readTokens(el: HTMLElement): RidgeTokens {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;visibility:hidden';
  el.appendChild(probe);
  const read = (name: string, fallback: string) => {
    probe.style.color = fallback;
    probe.style.color = `var(${name}, ${fallback})`;
    return getComputedStyle(probe).color || fallback;
  };
  const tokens = {
    paper: read('--sv-paper', '#F6F5F1'),
    surface: read('--sv-surface', '#FFFFFF'),
    fg: read('--sv-fg', '#111714'),
  };
  probe.remove();
  return tokens;
}

export interface Palette {
  paper: RGB;
  surface: RGB;
  fg: RGB;
}

export function palette(t: RidgeTokens): Palette {
  return {
    paper: parseRgb(t.paper) ?? [246, 245, 241],
    surface: parseRgb(t.surface) ?? [255, 255, 255],
    fg: parseRgb(t.fg) ?? [17, 23, 20],
  };
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** The slot fill: --sv-surface mixed toward --sv-paper by 15% per slot (slot 0 pure white). */
export function fillRgb(p: Palette, slot: number): RGB {
  return mix(p.surface, p.paper, slotStyle(slot).paperMix / 100);
}

/** The edge colour: --sv-fg at the slot's opacity over the slot fill. */
export function edgeRgb(p: Palette, slot: number): RGB {
  return mix(fillRgb(p, slot), p.fg, slotStyle(slot).edgeOpacity);
}

export function setSrgb(color: Color, rgb: RGB): void {
  color.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, SRGBColorSpace);
}

export function bodyMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

/** Screen-space (CSS px) edge line; alpha-to-coverage smooths it only where MSAA runs. */
export function edgeMaterial(antialias: boolean): LineMaterial {
  const m = new LineMaterial({ linewidth: 2.5, worldUnits: false });
  m.alphaToCoverage = antialias;
  return m;
}

/** Look of one ridge at a (possibly fractional) slot. */
export function applySlot(
  p: Palette,
  body: MeshBasicMaterial,
  edge: LineMaterial,
  slot: number,
): void {
  setSrgb(body.color, fillRgb(p, slot));
  setSrgb(edge.color, edgeRgb(p, slot));
  edge.linewidth = slotStyle(slot).edgeWidth;
}

/** A 1 px reference line in --sv-fg at its opacity, drawn after and above everything. */
export function refMaterial(p: Palette, which: 'zero' | 'second'): LineMaterial {
  const m = new LineMaterial({
    linewidth: 1,
    worldUnits: false,
    transparent: true,
    opacity: REF_OPACITY[which],
    depthTest: false,
    depthWrite: false,
  });
  setSrgb(m.color, p.fg);
  return m;
}
