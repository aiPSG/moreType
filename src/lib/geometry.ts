import type { Cell, Connection, Letter, LetterSettings } from "../types";

/** Base size of a single cell box in internal SVG units. */
export const CELL = 100;

export const cellKey = (c: number, r: number) => `${c},${r}`;
export const parseKey = (k: string): Cell => {
  const [c, r] = k.split(",").map(Number);
  return { c, r };
};

export const connKey = (a: Cell, b: Cell) => {
  // Order-independent key so {a,b} == {b,a}.
  const ka = cellKey(a.c, a.r);
  const kb = cellKey(b.c, b.r);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

export const areAdjacent = (a: Cell, b: Cell) => {
  const dc = Math.abs(a.c - b.c);
  const dr = Math.abs(a.r - b.r);
  return dc <= 1 && dr <= 1 && !(dc === 0 && dr === 0);
};

export const defaultSettings = (cols = 4, rows = 5): LetterSettings => ({
  cols,
  rows,
  cellShape: "circle",
  gapX: 0.25,
  gapY: 0.25,
  contentScale: 0.7,
  connectionWidth: 0.55,
  connectMode: "geometry",
  goo: 0.6,
  fill: true,
  fillColor: "#111111",
  outline: false,
  outlineColor: "#111111",
  outlineWidth: 0.06,
  showGrid: true,
  gridColor: "#d8d8e0",
});

/** Layout maths derived from settings. All values in internal SVG units. */
export interface Layout {
  pitchX: number;
  pitchY: number;
  width: number;
  height: number;
  /** Padding around the artwork to leave room for blur/outline bleed. */
  pad: number;
  /** Center point of a cell in SVG coordinates. */
  center: (c: number, r: number) => { x: number; y: number };
  /** Radius/half-size of a cell's content. */
  contentRadius: number;
}

export const computeLayout = (s: LetterSettings): Layout => {
  const pitchX = CELL * (1 + s.gapX);
  const pitchY = CELL * (1 + s.gapY);
  const width = s.cols * CELL + (s.cols - 1) * s.gapX * CELL;
  const height = s.rows * CELL + (s.rows - 1) * s.gapY * CELL;
  const pad = CELL * 0.7;
  return {
    pitchX,
    pitchY,
    width,
    height,
    pad,
    contentRadius: (s.contentScale * CELL) / 2,
    center: (c, r) => ({
      x: pad + c * pitchX + CELL / 2,
      y: pad + r * pitchY + CELL / 2,
    }),
  };
};

/** Center of a gap (interior vertex) shared by 4 cells starting at (gc,gr). */
export const gapCenter = (layout: Layout, gc: number, gr: number) => {
  const c = layout.center(gc, gr);
  return { x: c.x + layout.pitchX / 2, y: c.y + layout.pitchY / 2 };
};

/**
 * The column range actually occupied by a letter's content (cells + gaps),
 * used to trim the empty grid columns when composing so letters sit at their
 * true widths. Returns null for an empty letter.
 */
export function contentColumnSpan(
  letter: Letter,
): { minCol: number; maxCol: number } | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const k of letter.active) {
    const { c } = parseKey(k);
    lo = Math.min(lo, c);
    hi = Math.max(hi, c);
  }
  for (const k of letter.gaps ?? []) {
    const { c } = parseKey(k);
    lo = Math.min(lo, c);
    hi = Math.max(hi, c + 1); // a gap spans columns c..c+1
  }
  if (lo > hi) return null;
  return { minCol: lo, maxCol: hi };
}

/**
 * Group active cells into connected components using the connection graph.
 * Each component is rendered inside its own goo filter group so that only
 * *intentionally* connected cells merge into a metaball.
 */
export function connectedComponents(
  activeKeys: string[],
  connections: Connection[],
): string[][] {
  const active = new Set(activeKeys);
  const adj = new Map<string, Set<string>>();
  for (const k of activeKeys) adj.set(k, new Set());

  for (const conn of connections) {
    const ka = cellKey(conn.a.c, conn.a.r);
    const kb = cellKey(conn.b.c, conn.b.r);
    if (!active.has(ka) || !active.has(kb)) continue;
    adj.get(ka)!.add(kb);
    adj.get(kb)!.add(ka);
  }

  const seen = new Set<string>();
  const comps: string[][] = [];
  for (const start of activeKeys) {
    if (seen.has(start)) continue;
    const comp: string[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const n of adj.get(cur) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    comps.push(comp);
  }
  return comps;
}

/** SVG path data for one cell's content shape, centered at (cx, cy). */
export function shapePath(
  shape: LetterSettings["cellShape"],
  cx: number,
  cy: number,
  radius: number,
): string {
  switch (shape) {
    case "circle":
      return `M ${cx - radius} ${cy} a ${radius} ${radius} 0 1 0 ${
        radius * 2
      } 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0 Z`;
    case "square": {
      const s = radius;
      return `M ${cx - s} ${cy - s} H ${cx + s} V ${cy + s} H ${cx - s} Z`;
    }
    case "diamond":
      return `M ${cx} ${cy - radius} L ${cx + radius} ${cy} L ${cx} ${
        cy + radius
      } L ${cx - radius} ${cy} Z`;
    case "triangle": {
      // Equilateral-ish, pointing up, centered on (cx, cy).
      const h = radius * 1.4;
      return `M ${cx} ${cy - h} L ${cx + radius * 1.2} ${cy + h * 0.7} L ${
        cx - radius * 1.2
      } ${cy + h * 0.7} Z`;
    }
  }
}
