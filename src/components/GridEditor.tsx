import { useRef } from "react";
import type { Cell, Letter } from "../types";
import {
  CELL,
  areAdjacent,
  cellKey,
  computeLayout,
  connKey,
  gapCenter,
  parseKey,
} from "../lib/geometry";
import type { MirrorAxis, Selection } from "../lib/transform";
import { cycleConnection, toggleCell, toggleGap } from "../store";
import { GlyphArt } from "./GlyphArt";

export type EditMode = "cells" | "gaps";

/**
 * Interactive editor. In "cells" mode you click/drag to (de)activate cells and
 * click the handles between adjacent cells to cycle their connection
 * (off → fillet → straight). In "gaps" mode you click/drag the in-between
 * positions to fill the negative-space shapes. Shift-click selects cells/gaps
 * for the move/mirror tools, and the mirror axis (when shown) is draggable.
 */
export function GridEditor({
  letter,
  onChange,
  mode,
  showHandles = true,
  zoom = 1,
  selection,
  onToggleSelect,
  axis,
  onAxisChange,
}: {
  letter: Letter;
  onChange: (next: Letter) => void;
  mode: EditMode;
  /** Show the connection handles / gap markers overlay (still editable when off). */
  showHandles?: boolean;
  /** Display zoom factor (1 = fit). */
  zoom?: number;
  selection: Selection;
  onToggleSelect: (kind: "cell" | "gap", key: string) => void;
  /** Mirror axis to draw & drag, or null when hidden. */
  axis: MirrorAxis | null;
  onAxisChange: (a2: number) => void;
}) {
  const s = letter.settings;
  const layout = computeLayout(s);
  const { sx, sy } = layout;
  const w = layout.viewW;
  const h = layout.viewH;

  const svgRef = useRef<SVGSVGElement>(null);
  // Drag-painting state.
  const paint = useRef<{ active: boolean; mode: "add" | "remove" } | null>(null);
  const axisDrag = useRef(false);

  const activeSet = new Set(letter.active);
  const gapSet = new Set(letter.gaps ?? []);
  const selCells = new Set(selection.cells);
  const selGaps = new Set(selection.gaps);
  const connStyle = new Map(
    letter.connections.map((c) => [connKey(c.a, c.b), c.style ?? "fillet"]),
  );

  const applyCell = (c: number, r: number, m: "add" | "remove") => {
    const key = cellKey(c, r);
    const isActive = activeSet.has(key);
    if (m === "add" && isActive) return;
    if (m === "remove" && !isActive) return;
    onChange(toggleCell(letter, key));
  };

  const applyGap = (c: number, r: number, m: "add" | "remove") => {
    const key = cellKey(c, r);
    const isActive = gapSet.has(key);
    if (m === "add" && isActive) return;
    if (m === "remove" && !isActive) return;
    onChange(toggleGap(letter, key));
  };

  // Convert a pointer event to viewBox (square*scale) coordinates.
  const toLocal = (e: React.PointerEvent): { x: number; y: number } | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const updateAxisFrom = (e: React.PointerEvent) => {
    if (!axis) return;
    const p = toLocal(e);
    if (!p) return;
    if (axis.orient === "v") {
      const a = (p.x / sx - layout.pad - CELL / 2) / layout.pitchX;
      onAxisChange(Math.max(0, Math.min(2 * s.cols, Math.round(a * 2))));
    } else {
      const a = (p.y / sy - layout.pad - CELL / 2) / layout.pitchY;
      onAxisChange(Math.max(0, Math.min(2 * s.rows, Math.round(a * 2))));
    }
  };

  // Connection handles: every adjacent pair of active cells (cells mode only).
  const handles: {
    a: Cell;
    b: Cell;
    x: number;
    y: number;
    state: "off" | "fillet" | "straight";
  }[] = [];
  if (mode === "cells") {
    const actives = letter.active.map(parseKey);
    for (let i = 0; i < actives.length; i++) {
      for (let j = i + 1; j < actives.length; j++) {
        const a = actives[i];
        const b = actives[j];
        if (!areAdjacent(a, b)) continue;
        const pa = layout.center(a.c, a.r);
        const pb = layout.center(b.c, b.r);
        const st = connStyle.get(connKey(a, b));
        handles.push({
          a,
          b,
          x: ((pa.x + pb.x) / 2) * sx,
          y: ((pa.y + pb.y) / 2) * sy,
          state: (st ?? "off") as "off" | "fillet" | "straight",
        });
      }
    }
  }

  // Mirror axis line position in view coordinates.
  const axisPos = axis
    ? axis.orient === "v"
      ? (layout.pad + (axis.a2 / 2) * layout.pitchX + CELL / 2) * sx
      : (layout.pad + (axis.a2 / 2) * layout.pitchY + CELL / 2) * sy
    : 0;

  return (
    <svg
      ref={svgRef}
      className="editor-svg"
      viewBox={`0 0 ${w} ${h}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{
        width: `${zoom * 100}%`,
        height: `${zoom * 100}%`,
        maxWidth: "none",
        maxHeight: "none",
      }}
      onPointerMove={(e) => {
        if (axisDrag.current) updateAxisFrom(e);
      }}
      onPointerUp={() => {
        paint.current = null;
        axisDrag.current = false;
      }}
      onPointerLeave={() => {
        paint.current = null;
        axisDrag.current = false;
      }}
    >
      {/* Artwork. The grid follows the "Show grid" setting. */}
      <GlyphArt
        letter={letter}
        uid={`editor-${letter.id}`}
        forceShowGrid={s.showGrid}
        background
      />

      {mode === "cells" && (
        <>
          {/* Click targets for every cell. */}
          <g>
            {Array.from({ length: s.cols }).map((_, c) =>
              Array.from({ length: s.rows }).map((__, r) => {
                const { x, y } = layout.center(c, r);
                const half = CELL / 2;
                const key = cellKey(c, r);
                const isActive = activeSet.has(key);
                return (
                  <rect
                    key={`hit-${c}-${r}`}
                    x={(x - half) * sx}
                    y={(y - half) * sy}
                    width={CELL * sx}
                    height={CELL * sy}
                    fill="transparent"
                    className="cell-hit"
                    onPointerDown={(e) => {
                      (e.target as Element).releasePointerCapture?.(e.pointerId);
                      if (e.shiftKey) {
                        e.preventDefault();
                        onToggleSelect("cell", key);
                        return;
                      }
                      const m = isActive ? "remove" : "add";
                      paint.current = { active: true, mode: m };
                      applyCell(c, r, m);
                    }}
                    onPointerEnter={() => {
                      if (paint.current?.active)
                        applyCell(c, r, paint.current.mode);
                    }}
                  />
                );
              }),
            )}
          </g>

          {/* Connection handles. */}
          <g style={{ display: showHandles ? undefined : "none" }}>
            {handles.map((hd, i) => (
              <g
                key={`handle-${i}`}
                className={`conn-handle ${hd.state}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onChange(cycleConnection(letter, { a: hd.a, b: hd.b }));
                }}
              >
                <circle cx={hd.x} cy={hd.y} r={18} className="conn-hit" />
                {hd.state === "straight" ? (
                  <rect
                    x={hd.x - 9}
                    y={hd.y - 4}
                    width={18}
                    height={8}
                    rx={1.5}
                    className="conn-bar"
                  />
                ) : (
                  <circle
                    cx={hd.x}
                    cy={hd.y}
                    r={hd.state === "fillet" ? 11 : 9}
                    className="conn-dot"
                  />
                )}
                {hd.state === "off" && (
                  <>
                    <line
                      x1={hd.x - 6}
                      y1={hd.y}
                      x2={hd.x + 6}
                      y2={hd.y}
                      className="conn-plus"
                    />
                    <line
                      x1={hd.x}
                      y1={hd.y - 6}
                      x2={hd.x}
                      y2={hd.y + 6}
                      className="conn-plus"
                    />
                  </>
                )}
              </g>
            ))}
          </g>
        </>
      )}

      {/* Gap targets at interior vertices (gaps mode). */}
      {mode === "gaps" && (
        <g>
          {Array.from({ length: Math.max(0, s.cols - 1) }).map((_, c) =>
            Array.from({ length: Math.max(0, s.rows - 1) }).map((__, r) => {
              const g0 = gapCenter(layout, c, r);
              const x = g0.x * sx;
              const y = g0.y * sy;
              const key = cellKey(c, r);
              const isActive = gapSet.has(key);
              const hw = layout.pitchX * 0.5 * sx;
              const hh = layout.pitchY * 0.5 * sy;
              return (
                <g key={`gaphit-${c}-${r}`} className="gap-handle">
                  <rect
                    x={x - hw}
                    y={y - hh}
                    width={hw * 2}
                    height={hh * 2}
                    fill="transparent"
                    className="gap-hit"
                    onPointerDown={(e) => {
                      (e.target as Element).releasePointerCapture?.(e.pointerId);
                      if (e.shiftKey) {
                        e.preventDefault();
                        onToggleSelect("gap", key);
                        return;
                      }
                      const m = isActive ? "remove" : "add";
                      paint.current = { active: true, mode: m };
                      applyGap(c, r, m);
                    }}
                    onPointerEnter={() => {
                      if (paint.current?.active)
                        applyGap(c, r, paint.current.mode);
                    }}
                  />
                  {showHandles && (
                    <circle
                      cx={x}
                      cy={y}
                      r={8}
                      className={`gap-dot ${isActive ? "on" : "off"}`}
                    />
                  )}
                </g>
              );
            }),
          )}
        </g>
      )}

      {/* Selection highlights (both cells and gaps, regardless of mode). */}
      <g className="selection-layer" pointerEvents="none">
        {[...selCells].map((k) => {
          const { c, r } = parseKey(k);
          const { x, y } = layout.center(c, r);
          const half = CELL / 2;
          return (
            <rect
              key={`selc-${k}`}
              x={(x - half) * sx}
              y={(y - half) * sy}
              width={CELL * sx}
              height={CELL * sy}
              className="sel-cell"
            />
          );
        })}
        {[...selGaps].map((k) => {
          const { c, r } = parseKey(k);
          const g0 = gapCenter(layout, c, r);
          return (
            <circle
              key={`selg-${k}`}
              cx={g0.x * sx}
              cy={g0.y * sy}
              r={12}
              className="sel-gap"
            />
          );
        })}
      </g>

      {/* Draggable mirror axis. */}
      {axis && (
        <g
          className={`mirror-axis ${axis.orient}`}
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.target as Element).releasePointerCapture?.(e.pointerId);
            axisDrag.current = true;
            updateAxisFrom(e);
          }}
        >
          {axis.orient === "v" ? (
            <>
              <line x1={axisPos} y1={0} x2={axisPos} y2={h} className="axis-hit" />
              <line x1={axisPos} y1={0} x2={axisPos} y2={h} className="axis-line" />
              <circle cx={axisPos} cy={18} r={9} className="axis-grip" />
            </>
          ) : (
            <>
              <line x1={0} y1={axisPos} x2={w} y2={axisPos} className="axis-hit" />
              <line x1={0} y1={axisPos} x2={w} y2={axisPos} className="axis-line" />
              <circle cx={18} cy={axisPos} r={9} className="axis-grip" />
            </>
          )}
        </g>
      )}
    </svg>
  );
}
