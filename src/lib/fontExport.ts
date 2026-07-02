import * as opentype from "opentype.js";
import type { Alphabet, Letter } from "../types";
import {
  CELL,
  computeLayout,
  connectedComponents,
  contentColumnSpan,
  parseKey,
} from "./geometry";
import { bodyRing, componentUnionMulti, gapMulti } from "./metaball";

// ---------------------------------------------------------------------------
// Font export.
//
// Designed glyphs are vector geometry, so we can emit a real installable font
// (TrueType-flavoured OpenType, .ttf) with opentype.js. Each character → letter
// mapping in the alphabet becomes a cmap entry. Circles are written as smooth
// quadratic Bézier arcs (native to TrueType); everything else (squares,
// triangles, metaball unions, gaps) as polygons.
//
// Note: the "Goo Filter" look is a raster effect with no vector outline, so
// every glyph is exported using its geometry (boolean-union) form regardless of
// the letter's on-screen connect mode.
// ---------------------------------------------------------------------------

const EM = 1000;
const TAU = Math.PI * 2;

type ToFont = (x: number, y: number) => [number, number];

/** A smooth circle as 8 quadratic Bézier segments (TrueType-native curves). */
function addQuadCircle(
  path: opentype.Path,
  cx: number,
  cy: number,
  r: number,
  toFont: ToFont,
) {
  const n = 8;
  const step = TAU / n;
  const d = r / Math.cos(step / 2); // tangent-intersection distance
  const start = toFont(cx + r, cy);
  path.moveTo(start[0], start[1]);
  for (let i = 0; i < n; i++) {
    const a0 = i * step;
    const a1 = a0 + step;
    const am = a0 + step / 2;
    const ctrl = toFont(cx + d * Math.cos(am), cy + d * Math.sin(am));
    const end = toFont(cx + r * Math.cos(a1), cy + r * Math.sin(a1));
    path.quadTo(ctrl[0], ctrl[1], end[0], end[1]);
  }
  path.close();
}

function addPolygon(
  path: opentype.Path,
  ring: readonly (readonly number[])[],
  toFont: ToFont,
) {
  if (ring.length === 0) return;
  const p0 = toFont(ring[0][0], ring[0][1]);
  path.moveTo(p0[0], p0[1]);
  for (let i = 1; i < ring.length; i++) {
    const p = toFont(ring[i][0], ring[i][1]);
    path.lineTo(p[0], p[1]);
  }
  path.close();
}

/** Build an opentype Glyph (and its advance) for one designed letter. */
function buildGlyph(char: string, letter: Letter): opentype.Glyph {
  const s = letter.settings;
  const layout = computeLayout(s);
  const { sx, sy } = layout;
  const fullH = layout.viewH;
  const scale = EM / fullH;
  const span = contentColumnSpan(letter);

  let advance = EM * 0.42;
  let originX = layout.pad * sx;
  if (span) {
    const bearing = CELL * 0.12;
    const leftX = layout.pad + span.minCol * layout.pitchX;
    const rightX = layout.pad + span.maxCol * layout.pitchX + CELL;
    originX = (leftX - bearing) * sx;
    advance = (rightX - leftX + bearing * 2) * sx * scale;
  }

  // Geometry is in square cell space; apply the per-axis cell scale, then map
  // SVG y-down to font y-up. Baseline at 0, top of the canvas at EM.
  const toFont: ToFont = (x, y) => [
    (x * sx - originX) * scale,
    (fullH - y * sy) * scale,
  ];

  const path = new opentype.Path();
  const comps = connectedComponents(letter.active, letter.connections);
  for (const comp of comps) {
    if (comp.length === 1) {
      const { c, r } = parseKey(comp[0]);
      const { x, y } = layout.center(c, r);
      if (s.cellShape === "circle") {
        addQuadCircle(path, x, y, layout.contentRadius, toFont);
      } else {
        addPolygon(path, bodyRing(s.cellShape, x, y, layout.contentRadius), toFont);
      }
      continue;
    }
    const compSet = new Set(comp);
    const conns = letter.connections.filter(
      (cn) =>
        compSet.has(`${cn.a.c},${cn.a.r}`) && compSet.has(`${cn.b.c},${cn.b.r}`),
    );
    const multi = componentUnionMulti(s, layout, comp, conns);
    for (const poly of multi) for (const ring of poly) addPolygon(path, ring, toFont);
  }
  for (const k of letter.gaps ?? []) {
    const { c, r } = parseKey(k);
    const multi = gapMulti(s, layout, c, r);
    for (const poly of multi) for (const ring of poly) addPolygon(path, ring, toFont);
  }

  const code = char.codePointAt(0) ?? 0;
  return new opentype.Glyph({
    name: char === " " ? "space" : `uni${code.toString(16).toUpperCase()}`,
    unicode: code,
    advanceWidth: Math.max(1, Math.round(advance)),
    path,
  });
}

/** Build a font ArrayBuffer from an alphabet's assigned glyphs. */
export function buildFont(
  alphabet: Alphabet,
  letters: Record<string, Letter>,
): ArrayBuffer {
  const notdef = new opentype.Glyph({
    name: ".notdef",
    unicode: 0,
    advanceWidth: Math.round(EM * 0.42),
    path: new opentype.Path(),
  });

  const glyphs: opentype.Glyph[] = [notdef];
  let hasSpace = false;

  for (const [char, letterId] of Object.entries(alphabet.glyphs)) {
    if ([...char].length !== 1) continue; // single code point only
    const letter = letters[letterId];
    if (!letter) continue;
    if (char === " ") hasSpace = true;
    glyphs.push(buildGlyph(char, letter));
  }

  if (!hasSpace) {
    glyphs.push(
      new opentype.Glyph({
        name: "space",
        unicode: 32,
        advanceWidth: Math.round(EM * 0.32),
        path: new opentype.Path(),
      }),
    );
  }

  const font = new opentype.Font({
    familyName: (alphabet.name || "moreType").replace(/[^\w ]+/g, "").trim() ||
      "moreType",
    styleName: "Regular",
    unitsPerEm: EM,
    ascender: EM,
    descender: -Math.round(EM * 0.2),
    glyphs,
  });

  return font.toArrayBuffer();
}

export function downloadFont(
  alphabet: Alphabet,
  letters: Record<string, Letter>,
) {
  const buffer = buildFont(alphabet, letters);
  const blob = new Blob([buffer], { type: "font/ttf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const base =
    (alphabet.name || "moretype").replace(/\s+/g, "_").replace(/[^\w-]/g, "") ||
    "moretype";
  a.href = url;
  a.download = `${base}.ttf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
