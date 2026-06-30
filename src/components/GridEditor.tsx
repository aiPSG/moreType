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
import { toggleCell, toggleConnection, toggleGap } from "../store";
import { GlyphArt } from "./GlyphArt";

export type EditMode = "cells" | "gaps";

/**
 * Interactive editor. In "cells" mode you click/drag to (de)activate cells and
 * click the handles between adjacent cells to toggle metaball connections. In
 * "gaps" mode you click/drag the in-between positions to fill the negative-space
 * shapes between cells.
 */
export function GridEditor({
  letter,
  onChange,
  mode,
  showHandles = true,
}: {
  letter: Letter;
  onChange: (next: Letter) => void;
  mode: EditMode;
  /** Show the connection handles / gap markers overlay (still editable when off). */
  showHandles?: boolean;
}) {
  const s = letter.settings;
  const layout = computeLayout(s);
  const w = layout.width + layout.pad * 2;
  const h = layout.height + layout.pad * 2;

  // Drag-painting state.
  const paint = useRef<{ active: boolean; mode: "add" | "remove" } | null>(null);

  const activeSet = new Set(letter.active);
  const gapSet = new Set(letter.gaps ?? []);
  const connSet = new Set(letter.connections.map((c) => connKey(c.a, c.b)));

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

  // Connection handles: every adjacent pair of active cells (cells mode only).
  const handles: { a: Cell; b: Cell; x: number; y: number; on: boolean }[] = [];
  if (mode === "cells") {
    const actives = letter.active.map(parseKey);
    for (let i = 0; i < actives.length; i++) {
      for (let j = i + 1; j < actives.length; j++) {
        const a = actives[i];
        const b = actives[j];
        if (!areAdjacent(a, b)) continue;
        const pa = layout.center(a.c, a.r);
        const pb = layout.center(b.c, b.r);
        handles.push({
          a,
          b,
          x: (pa.x + pb.x) / 2,
          y: (pa.y + pb.y) / 2,
          on: connSet.has(connKey(a, b)),
        });
      }
    }
  }

  return (
    <svg
      className="editor-svg"
      viewBox={`0 0 ${w} ${h}`}
      xmlns="http://www.w3.org/2000/svg"
      onPointerUp={() => (paint.current = null)}
      onPointerLeave={() => (paint.current = null)}
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
                    x={x - half}
                    y={y - half}
                    width={CELL}
                    height={CELL}
                    fill="transparent"
                    className="cell-hit"
                    onPointerDown={(e) => {
                      (e.target as Element).releasePointerCapture?.(e.pointerId);
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
                className={`conn-handle ${hd.on ? "on" : "off"}`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onChange(toggleConnection(letter, { a: hd.a, b: hd.b }));
                }}
              >
                <circle cx={hd.x} cy={hd.y} r={18} className="conn-hit" />
                <circle
                  cx={hd.x}
                  cy={hd.y}
                  r={hd.on ? 11 : 9}
                  className="conn-dot"
                />
                {!hd.on && (
                  <line
                    x1={hd.x - 6}
                    y1={hd.y}
                    x2={hd.x + 6}
                    y2={hd.y}
                    className="conn-plus"
                  />
                )}
                {!hd.on && (
                  <line
                    x1={hd.x}
                    y1={hd.y - 6}
                    x2={hd.x}
                    y2={hd.y + 6}
                    className="conn-plus"
                  />
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
              const { x, y } = gapCenter(layout, c, r);
              const key = cellKey(c, r);
              const isActive = gapSet.has(key);
              const hw = layout.pitchX * 0.5;
              const hh = layout.pitchY * 0.5;
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
    </svg>
  );
}
