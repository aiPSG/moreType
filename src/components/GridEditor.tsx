import { useRef } from "react";
import type { Cell, Letter } from "../types";
import {
  CELL,
  areAdjacent,
  cellKey,
  computeLayout,
  connKey,
  parseKey,
} from "../lib/geometry";
import { toggleCell, toggleConnection } from "../store";
import { GlyphArt } from "./GlyphArt";

/**
 * Interactive editor: click/drag to (de)activate cells and click the handles
 * between adjacent active cells to toggle metaball connections.
 */
export function GridEditor({
  letter,
  onChange,
}: {
  letter: Letter;
  onChange: (next: Letter) => void;
}) {
  const s = letter.settings;
  const layout = computeLayout(s);
  const w = layout.width + layout.pad * 2;
  const h = layout.height + layout.pad * 2;

  // Drag-painting state.
  const paint = useRef<{ active: boolean; mode: "add" | "remove" } | null>(null);

  const activeSet = new Set(letter.active);
  const connSet = new Set(letter.connections.map((c) => connKey(c.a, c.b)));

  const applyCell = (c: number, r: number, mode: "add" | "remove") => {
    const key = cellKey(c, r);
    const isActive = activeSet.has(key);
    if (mode === "add" && isActive) return;
    if (mode === "remove" && !isActive) return;
    onChange(toggleCell(letter, key));
  };

  // Candidate connection handles: every adjacent pair of active cells.
  const handles: { a: Cell; b: Cell; x: number; y: number; on: boolean }[] = [];
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

  return (
    <svg
      className="editor-svg"
      viewBox={`0 0 ${w} ${h}`}
      xmlns="http://www.w3.org/2000/svg"
      onPointerUp={() => (paint.current = null)}
      onPointerLeave={() => (paint.current = null)}
    >
      {/* Artwork (with grid forced on while editing). */}
      <GlyphArt letter={letter} uid={`editor-${letter.id}`} forceShowGrid />

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
                  const mode = isActive ? "remove" : "add";
                  paint.current = { active: true, mode };
                  applyCell(c, r, mode);
                }}
                onPointerEnter={() => {
                  if (paint.current?.active) applyCell(c, r, paint.current.mode);
                }}
              />
            );
          }),
        )}
      </g>

      {/* Connection handles. */}
      <g>
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
            <circle cx={hd.x} cy={hd.y} r={hd.on ? 11 : 9} className="conn-dot" />
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
    </svg>
  );
}
