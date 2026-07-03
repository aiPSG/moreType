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

const dir = (a: number): Pair => [Math.cos(a), Math.sin(a)];
const add = (p: Pair, v: Pair, len: number): Pair => [
  p[0] + v[0] * len,
  p[1] + v[1] * len,
];
const dist = (a: Pair, b: Pair) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

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

function sampleCubic(
  p0: Pair,
  c0: Pair,
  c1: Pair,
  p1: Pair,
  n = 18,
): Pair[] {
  const out: Pair[] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    out.push([
      a * p0[0] + b * c0[0] + c * c1[0] + d * p1[0],
      a * p0[1] + b * c0[1] + c * c1[1] + d * p1[1],
    ]);
  }
  return out;
}

/**
 * Metaball neck between two circles. The attach points on each circle are set
 * by `v` (spread): from the tangent-cone angle (u) toward the widest possible
 * attachment (maxSpread) as v → 1. `handleSize` scales the Bézier handles that
 * bow each side of the neck outward. Tuned so connected circles melt together
 * along smooth convex fillets and any *enclosed* negative space between three
 * circles stays round — not pinched to a point.
 */
function metaballNeckRing(
  c1: Pair,
  r1: number,
  c2: Pair,
  r2: number,
  v: number,
  handleSize: number,
): Ring | null {
  const d = dist(c1, c2);
  if (d === 0 || r1 === 0 || r2 === 0) return null;

  const u1 = Math.acos(
    clamp((r1 * r1 + d * d - r2 * r2) / (2 * r1 * d), -1, 1),
  );
  const u2 = Math.acos(
    clamp((r2 * r2 + d * d - r1 * r1) / (2 * r2 * d), -1, 1),
  );

  const a = Math.atan2(c2[1] - c1[1], c2[0] - c1[0]);
  const maxSpread = Math.acos(clamp((r1 - r2) / d, -1, 1));

  const angle1 = a + u1 + (maxSpread - u1) * v;
  const angle2 = a - u1 - (maxSpread - u1) * v;
  const angle3 = a + Math.PI - u2 - (Math.PI - u2 - maxSpread) * v;
  const angle4 = a - Math.PI + u2 + (Math.PI - u2 - maxSpread) * v;

  const p1 = add(c1, dir(angle1), r1);
  const p2 = add(c1, dir(angle2), r1);
  const p3 = add(c2, dir(angle3), r2);
  const p4 = add(c2, dir(angle4), r2);

  const totalRadius = r1 + r2;
  const d2 =
    Math.min(v * handleSize, dist(p1, p3) / totalRadius) *
    Math.min(1, (d * 2) / totalRadius);
  const h1 = r1 * d2;
  const h2 = r2 * d2;

  const cp1 = add(p1, dir(angle1 - HALF_PI), h1);
  const cp3 = add(p3, dir(angle3 + HALF_PI), h2);
  const cp4 = add(p4, dir(angle4 - HALF_PI), h2);
  const cp2 = add(p2, dir(angle2 + HALF_PI), h1);

  // p1 →(curve)→ p3 → (dip through c2) → p4 →(curve)→ p2 → (dip through c1) → p1
  //
  // The dips to each center are crucial: without them the neck only *touches*
  // each circle at the rim points (zero shared area), and boolean-union on
  // merely-touching shapes is unreliable — polygon-clipping can throw, leaving
  // the bodies unmerged (white wedges). Routing the neck through each center
  // guarantees solid overlap so the union always merges cleanly; the dips sit
  // inside the full circles, so the visible outline is unchanged.
  const ring: Ring = [p1];
  ring.push(...sampleCubic(p1, cp1, cp3, p3));
  ring.push(p3, c2, p4);
  ring.push(...sampleCubic(p4, cp4, cp2, p2));
  ring.push(p2, c1);
  return ring;
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
 * Boolean-union geometry for a connected component, as a MultiPolygon of rings
 * in square cell space. Shared by SVG rendering and font generation.
 *
 * Circle bodies are joined with a smooth metaball neck (see metaballNeckRing):
 * a Bézier fillet tangent to both circles that nestles into the gap between
 * them, so a connection reads as two circles melting together along concave
 * fillets — not a straight bar. Non-circular shapes fall back to a straight
 * capsule. (allActive is accepted for call-site compatibility but unused: the
 * fillet is defined by the two connected bodies, not the surrounding cells.)
 */
export function componentUnionMulti(
  s: LetterSettings,
  layout: Layout,
  compKeys: string[],
  conns: { a: Cell; b: Cell }[],
  _allActive: string[] = compKeys,
): number[][][][] {
  const r = layout.contentRadius;
  const isCircle = s.cellShape === "circle";

  const geoms: Poly[] = [];

  for (const k of compKeys) {
    const { c, r: row } = parseKey(k);
    const { x, y } = layout.center(c, row);
    geoms.push([bodyRing(s.cellShape, x, y, r)]);
  }

  // connectionWidth → spread (v) for metaballs, or half-width for capsules;
  // goo → Bézier handle size. Defaults (spread 0.55, fillet 0.6) melt circles
  // together with round enclosed negative spaces.
  const v = clamp(0.12 + s.connectionWidth * 0.72, 0.05, 0.95);
  const handleSize = 0.8 + s.goo * 1.6;
  const capHalf = Math.max(2, s.connectionWidth * r);

  const inComp = new Set(compKeys);
  for (const cn of conns) {
    const ka = cellKey(cn.a.c, cn.a.r);
    const kb = cellKey(cn.b.c, cn.b.r);
    if (!inComp.has(ka) || !inComp.has(kb)) continue;
    const pa = layout.center(cn.a.c, cn.a.r);
    const pb = layout.center(cn.b.c, cn.b.r);
    const c1: Pair = [pa.x, pa.y];
    const c2: Pair = [pb.x, pb.y];
    const ring = isCircle
      ? metaballNeckRing(c1, r, c2, r, v, handleSize)
      : capsuleRing(c1, c2, capHalf);
    if (ring) geoms.push([ring]);
  }

  if (geoms.length === 0) return [];

  try {
    return union(geoms[0], ...geoms.slice(1));
  } catch (e) {
    console.warn("[metaball] union failed:", e);
    // Degenerate input — return the unmerged bodies.
    return geoms as unknown as number[][][][];
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
