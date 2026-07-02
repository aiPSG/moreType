import * as polygonClippingNS from "polygon-clipping";
import type { Cell, LetterSettings } from "../types";
import { CELL, cellKey, parseKey } from "./geometry";
import type { Layout } from "./geometry";

// polygon-clipping ships as CommonJS whose ESM build exposes everything on its
// *default* export. Depending on the bundler, the callable shows up either on
// the namespace directly or under `.default`, so resolve it defensively — using
// the wrong one silently yields `union is not a function` at runtime.
type ClipFn = (
  geom: number[][][] | number[][][][],
  ...geoms: (number[][][] | number[][][][])[]
) => number[][][][];
const nsRaw = polygonClippingNS as unknown as {
  union?: ClipFn;
  difference?: ClipFn;
  default?: { union?: ClipFn; difference?: ClipFn };
};
const pc = (nsRaw.union ? nsRaw : nsRaw.default) as {
  union: ClipFn;
  difference: ClipFn;
};
const union: ClipFn = pc.union;
const difference: ClipFn = pc.difference;

// ---------------------------------------------------------------------------
// Pure-geometry connections.
//
// Instead of an SVG filter (which blurs/shrinks shapes and softens the
// outline), we build the merged silhouette as real geometry: each cell body
// plus a connection "neck" are turned into polygons and combined with a
// boolean union into a single closed path. That path can be filled and/or
// stroked, giving a crisp, uniform-width outline that follows the exact
// contour — bodies keep their true size, so 100% fill still reaches the cell
// edges, and enclosed counters (holes) fall out of the union automatically.
// ---------------------------------------------------------------------------

type Pair = [number, number];
type Ring = Pair[];
type Poly = Ring[];

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;

/** A cell body as a polygon ring, matching the shapePath() geometry. */
export function bodyRing(
  shape: LetterSettings["cellShape"],
  cx: number,
  cy: number,
  r: number,
): Ring {
  switch (shape) {
    case "square":
      return [
        [cx - r, cy - r],
        [cx + r, cy - r],
        [cx + r, cy + r],
        [cx - r, cy + r],
      ];
    case "diamond":
      return [
        [cx, cy - r],
        [cx + r, cy],
        [cx, cy + r],
        [cx - r, cy],
      ];
    case "triangle":
      // Fits within the cell box (±r) so triangles don't overlap at gap 0.
      return [
        [cx, cy - r],
        [cx + r, cy + r],
        [cx - r, cy + r],
      ];
    case "circle":
    default: {
      // Smooth enough that merged/gap circle arcs read as true curves in both
      // SVG download and the generated font.
      const n = 96;
      const ring: Ring = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        ring.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      return ring;
    }
  }
}

/** Straight capsule/bar neck (used for non-circular cell shapes). */
function capsuleRing(c1: Pair, c2: Pair, halfWidth: number): Ring {
  const a = Math.atan2(c2[1] - c1[1], c2[0] - c1[0]);
  const nx = Math.cos(a + HALF_PI);
  const ny = Math.sin(a + HALF_PI);
  return [
    [c1[0] + nx * halfWidth, c1[1] + ny * halfWidth],
    [c2[0] + nx * halfWidth, c2[1] + ny * halfWidth],
    [c2[0] - nx * halfWidth, c2[1] - ny * halfWidth],
    [c1[0] - nx * halfWidth, c1[1] - ny * halfWidth],
  ];
}

function ringToSubpath(ring: readonly (readonly number[])[]): string {
  if (ring.length === 0) return "";
  const [first, ...rest] = ring;
  let d = `M ${first[0].toFixed(2)} ${first[1].toFixed(2)}`;
  for (const p of rest) d += ` L ${p[0].toFixed(2)} ${p[1].toFixed(2)}`;
  return d + " Z";
}

/** Scale a MultiPolygon from square cell space into final coordinates. */
function scaleMulti(
  m: number[][][][],
  sx: number,
  sy: number,
): number[][][][] {
  if (sx === 1 && sy === 1) return m;
  return m.map((poly) =>
    poly.map((ring) => ring.map(([x, y]) => [x * sx, y * sy])),
  );
}

/**
 * Boolean geometry for a connected component, as a MultiPolygon of rings in
 * square cell space. Shared by SVG rendering and font generation.
 *
 * The join follows the negative space of the circle packing: connected cells
 * are bridged with a bar and unioned, then the *empty* neighbouring cells are
 * subtracted, so the neck's concave edges are literally the arcs of the
 * surrounding circles. "Neck width" sets how wide the bridge is before the
 * neighbours carve it; "carve depth" scales the size of the carving cells.
 */
export function componentUnionMulti(
  s: LetterSettings,
  layout: Layout,
  compKeys: string[],
  conns: { a: Cell; b: Cell }[],
  allActive: string[] = compKeys,
): number[][][][] {
  const r = layout.contentRadius;

  const geoms: Poly[] = [];
  for (const k of compKeys) {
    const { c, r: row } = parseKey(k);
    const { x, y } = layout.center(c, row);
    geoms.push([bodyRing(s.cellShape, x, y, r)]);
  }

  // Bridge width before the neighbours carve it (full body width at 1.0).
  const capHalf = Math.max(1, (s.connectionWidth ?? 1) * r);
  const inComp = new Set(compKeys);
  for (const cn of conns) {
    const ka = cellKey(cn.a.c, cn.a.r);
    const kb = cellKey(cn.b.c, cn.b.r);
    if (!inComp.has(ka) || !inComp.has(kb)) continue;
    const pa = layout.center(cn.a.c, cn.a.r);
    const pb = layout.center(cn.b.c, cn.b.r);
    geoms.push([capsuleRing([pa.x, pa.y], [pb.x, pb.y], capHalf)]);
  }

  if (geoms.length === 0) return [];

  let merged: number[][][][];
  try {
    merged = union(geoms[0], ...geoms.slice(1));
  } catch (e) {
    console.warn("[metaball] union failed:", e);
    return geoms as unknown as number[][][][];
  }

  // Carve out the surrounding empty cells so the join follows their outline.
  const activeSet = new Set(allActive);
  const carveR = r * (0.7 + (s.goo ?? 0.5) * 0.6); // "carve depth" slider
  const carvers: Poly[] = [];
  const seen = new Set<string>();
  for (const k of compKeys) {
    const { c, r: row } = parseKey(k);
    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (dc === 0 && dr === 0) continue;
        const nc = c + dc;
        const nr = row + dr;
        if (nc < 0 || nr < 0 || nc >= s.cols || nr >= s.rows) continue;
        const nk = cellKey(nc, nr);
        if (activeSet.has(nk) || seen.has(nk)) continue;
        seen.add(nk);
        const { x, y } = layout.center(nc, nr);
        carvers.push([bodyRing(s.cellShape, x, y, carveR)]);
      }
    }
  }

  if (carvers.length === 0) return merged;
  try {
    return difference(merged, ...carvers);
  } catch (e) {
    console.warn("[metaball] carve failed:", e);
    return merged;
  }
}

/** SVG path `d` for a connected component (see componentUnionMulti). */
export function componentUnionPath(
  s: LetterSettings,
  layout: Layout,
  compKeys: string[],
  conns: { a: Cell; b: Cell }[],
  allActive: string[] = compKeys,
): string {
  const merged = scaleMulti(
    componentUnionMulti(s, layout, compKeys, conns, allActive),
    layout.sx,
    layout.sy,
  );
  let d = "";
  for (const poly of merged) for (const ring of poly) d += ringToSubpath(ring) + " ";
  return d.trim();
}

/**
 * The negative-space "gap" shape around interior vertex (gc,gr): the square
 * spanning the four surrounding cell centers, minus those four cell shapes.
 * For circles this yields the concave four-cornered shape between them; it
 * automatically follows whatever cell shape is selected. Returns "" if the
 * shapes leave no gap (e.g. squares at 100%).
 */
export function gapMulti(
  s: LetterSettings,
  layout: Layout,
  gc: number,
  gr: number,
): number[][][][] {
  // Derive the canonical interstitial shape from full-size cell footprints,
  // then scale it by contentScale about the gap center — so gaps shrink with
  // the Content-size slider exactly like the cells do.
  const full = CELL / 2;
  const corners = [
    layout.center(gc, gr),
    layout.center(gc + 1, gr),
    layout.center(gc + 1, gr + 1),
    layout.center(gc, gr + 1),
  ];
  const square: number[][] = corners.map((c) => [c.x, c.y]);
  const holes = corners.map((c) => [bodyRing(s.cellShape, c.x, c.y, full)]);
  let res: number[][][][];
  try {
    res = difference([square], ...holes);
  } catch (e) {
    console.warn("[metaball] gap difference failed:", e);
    return [];
  }
  const cx = (corners[0].x + corners[2].x) / 2;
  const cy = (corners[0].y + corners[2].y) / 2;
  const sc = s.contentScale;
  return res.map((poly) =>
    poly.map((ring) =>
      ring.map(([x, y]) => [cx + (x - cx) * sc, cy + (y - cy) * sc]),
    ),
  );
}

/** SVG path `d` for a negative-space gap (see gapMulti). */
export function gapPath(
  s: LetterSettings,
  layout: Layout,
  gc: number,
  gr: number,
): string {
  const res = scaleMulti(gapMulti(s, layout, gc, gr), layout.sx, layout.sy);
  let d = "";
  for (const poly of res) for (const ring of poly) d += ringToSubpath(ring) + " ";
  return d.trim();
}
