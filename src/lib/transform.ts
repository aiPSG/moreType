import type { Connection, Letter } from "../types";
import { connKey } from "./geometry";

// ---------------------------------------------------------------------------
// Selection-based transforms: move a subset of cells/gaps by one grid step, and
// mirror them across a placed axis. Everything is grid-exact.
//
// Grid parity: a cell sits at integer column c; a gap (c,r) spans cells c..c+1,
// so its "position" is the half-integer c+0.5. To keep cells↔cells and
// gaps↔gaps under reflection we work in *doubled* coordinates and store the
// mirror axis as `a2` (twice its column/row): a2 even = through a cell line,
// a2 odd = on the line between two cells. Reflection of a cell column is
// c' = a2 - c; of a gap column, c' = a2 - c - 1 (same for rows, horizontally).
// ---------------------------------------------------------------------------

/** A set of selected cell and gap keys ("c,r"). */
export interface Selection {
  cells: string[];
  gaps: string[];
}

/** A mirror line. `a2` is the doubled column (v) or row (h) position. */
export interface MirrorAxis {
  orient: "v" | "h";
  a2: number;
}

export const emptySelection = (): Selection => ({ cells: [], gaps: [] });
export const isEmptySelection = (s: Selection) =>
  s.cells.length === 0 && s.gaps.length === 0;

const key = (c: number, r: number) => `${c},${r}`;
const parse = (k: string): [number, number] => {
  const [c, r] = k.split(",").map(Number);
  return [c, r];
};

/** Default axis: the glyph's centre, for the given orientation. */
export function defaultAxis(cols: number, rows: number, orient: "v" | "h"): MirrorAxis {
  return { orient, a2: orient === "v" ? cols - 1 : rows - 1 };
}

/**
 * Re-home a result so every coordinate is ≥ 0 and the grid grows to fit
 * (auto-grow). Returns the rebuilt letter, the equally-shifted selection, and
 * the applied offset so callers can move any UI axis with the content.
 */
function normalize(
  base: Letter,
  cellsSet: Set<string>,
  gapsSet: Set<string>,
  conns: Connection[],
  sel: Selection,
): { letter: Letter; selection: Selection; offset: [number, number] } {
  let minC = Infinity;
  let minR = Infinity;
  let maxC = -Infinity;
  let maxR = -Infinity;
  const consider = (c: number, r: number, spanC = 0, spanR = 0) => {
    minC = Math.min(minC, c);
    minR = Math.min(minR, r);
    maxC = Math.max(maxC, c + spanC);
    maxR = Math.max(maxR, r + spanR);
  };
  for (const k of cellsSet) {
    const [c, r] = parse(k);
    consider(c, r);
  }
  for (const k of gapsSet) {
    const [c, r] = parse(k);
    consider(c, r, 1, 1); // a gap spans cells c..c+1 / r..r+1
  }

  const offC = Number.isFinite(minC) ? Math.max(0, -minC) : 0;
  const offR = Number.isFinite(minR) ? Math.max(0, -minR) : 0;

  const shiftKey = (k: string): string => {
    const [c, r] = parse(k);
    return key(c + offC, r + offR);
  };
  const outCells = [...cellsSet].map(shiftKey);
  const outGaps = [...gapsSet].map(shiftKey);
  const outConns = conns.map((cn) => ({
    ...cn,
    a: { c: cn.a.c + offC, r: cn.a.r + offR },
    b: { c: cn.b.c + offC, r: cn.b.r + offR },
  }));

  let cols = base.settings.cols;
  let rows = base.settings.rows;
  if (Number.isFinite(maxC)) {
    cols = Math.max(cols, maxC + offC + 1);
    rows = Math.max(rows, maxR + offR + 1);
  }

  // Drop connections whose endpoints are no longer both active.
  const activeSet = new Set(outCells);
  const validConns = outConns.filter(
    (cn) =>
      activeSet.has(key(cn.a.c, cn.a.r)) && activeSet.has(key(cn.b.c, cn.b.r)),
  );

  const outSel: Selection = {
    cells: sel.cells.map(shiftKey),
    gaps: sel.gaps.map(shiftKey),
  };

  const letter: Letter = {
    ...base,
    active: outCells,
    gaps: outGaps,
    connections: validConns,
    settings: { ...base.settings, cols, rows },
  };
  return { letter, selection: outSel, offset: [offC, offR] };
}

/** Move the selection (or the whole glyph if empty) by (dc, dr). */
export function moveLetter(
  letter: Letter,
  sel: Selection,
  dc: number,
  dr: number,
): { letter: Letter; selection: Selection; offset: [number, number] } {
  const whole = isEmptySelection(sel);
  const activeSet = new Set(letter.active);
  const gapSet = new Set(letter.gaps ?? []);
  const movCells = new Set(
    (whole ? letter.active : sel.cells).filter((k) => activeSet.has(k)),
  );
  const movGaps = new Set(
    (whole ? letter.gaps ?? [] : sel.gaps).filter((k) => gapSet.has(k)),
  );

  const cells = new Set<string>();
  for (const k of letter.active) if (!movCells.has(k)) cells.add(k);
  for (const k of movCells) {
    const [c, r] = parse(k);
    cells.add(key(c + dc, r + dr)); // overwrite/union at destination
  }

  const gaps = new Set<string>();
  for (const k of letter.gaps ?? []) if (!movGaps.has(k)) gaps.add(k);
  for (const k of movGaps) {
    const [c, r] = parse(k);
    gaps.add(key(c + dc, r + dr));
  }

  const conns: Connection[] = [];
  for (const cn of letter.connections) {
    const am = movCells.has(key(cn.a.c, cn.a.r));
    const bm = movCells.has(key(cn.b.c, cn.b.r));
    if (am && bm)
      conns.push({
        ...cn,
        a: { c: cn.a.c + dc, r: cn.a.r + dr },
        b: { c: cn.b.c + dc, r: cn.b.r + dr },
      });
    else if (!am && !bm) conns.push(cn);
    // exactly one endpoint moves → the pair is no longer adjacent → drop it
  }

  const newSel: Selection = whole
    ? emptySelection()
    : {
        cells: sel.cells.map((k) => {
          const [c, r] = parse(k);
          return key(c + dc, r + dr);
        }),
        gaps: sel.gaps.map((k) => {
          const [c, r] = parse(k);
          return key(c + dc, r + dr);
        }),
      };

  return normalize(letter, cells, gaps, conns, newSel);
}

/**
 * Mirror the selection (or whole glyph if empty) across `axis`. `copy` keeps
 * the original and adds the reflection; otherwise the selection is flipped in
 * place (its source removed, the reflection added).
 */
export function mirrorLetter(
  letter: Letter,
  sel: Selection,
  axis: MirrorAxis,
  copy: boolean,
): { letter: Letter; selection: Selection; offset: [number, number] } {
  const whole = isEmptySelection(sel);
  const activeSet = new Set(letter.active);
  const gapSet = new Set(letter.gaps ?? []);
  const srcCells = (whole ? letter.active : sel.cells).filter((k) =>
    activeSet.has(k),
  );
  const srcGaps = (whole ? letter.gaps ?? [] : sel.gaps).filter((k) =>
    gapSet.has(k),
  );
  const srcCellSet = new Set(srcCells);

  const refCell = (c: number, r: number): [number, number] =>
    axis.orient === "v" ? [axis.a2 - c, r] : [c, axis.a2 - r];
  const refGap = (c: number, r: number): [number, number] =>
    axis.orient === "v" ? [axis.a2 - c - 1, r] : [c, axis.a2 - r - 1];

  const cells = new Set<string>(
    copy ? letter.active : letter.active.filter((k) => !srcCellSet.has(k)),
  );
  for (const k of srcCells) {
    const [c, r] = parse(k);
    cells.add(key(...refCell(c, r)));
  }

  const srcGapSet = new Set(srcGaps);
  const gaps = new Set<string>(
    copy
      ? letter.gaps ?? []
      : (letter.gaps ?? []).filter((k) => !srcGapSet.has(k)),
  );
  for (const k of srcGaps) {
    const [c, r] = parse(k);
    gaps.add(key(...refGap(c, r)));
  }

  const srcConns = letter.connections.filter(
    (cn) =>
      srcCellSet.has(key(cn.a.c, cn.a.r)) && srcCellSet.has(key(cn.b.c, cn.b.r)),
  );
  const refConns: Connection[] = srcConns.map((cn) => {
    const [ac, ar] = refCell(cn.a.c, cn.a.r);
    const [bc, br] = refCell(cn.b.c, cn.b.r);
    return { ...cn, a: { c: ac, r: ar }, b: { c: bc, r: br } };
  });
  const srcKeys = new Set(srcConns.map((cn) => connKey(cn.a, cn.b)));
  let conns = copy
    ? [...letter.connections, ...refConns]
    : [
        ...letter.connections.filter((cn) => !srcKeys.has(connKey(cn.a, cn.b))),
        ...refConns,
      ];
  const seen = new Set<string>();
  conns = conns.filter((cn) => {
    const kk = connKey(cn.a, cn.b);
    if (seen.has(kk)) return false;
    seen.add(kk);
    return true;
  });

  const newSel: Selection = whole
    ? emptySelection()
    : copy
      ? sel
      : {
          cells: srcCells.map((k) => {
            const [c, r] = parse(k);
            return key(...refCell(c, r));
          }),
          gaps: srcGaps.map((k) => {
            const [c, r] = parse(k);
            return key(...refGap(c, r));
          }),
        };

  return normalize(letter, cells, gaps, conns, newSel);
}
