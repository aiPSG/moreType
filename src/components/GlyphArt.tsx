import { Fragment } from "react";
import type { Letter } from "../types";
import {
  CELL,
  cellKey,
  computeLayout,
  connectedComponents,
  parseKey,
  shapePath,
} from "../lib/geometry";
import { componentUnionPath, gapPath } from "../lib/metaball";

/**
 * Builds the SVG <filter> that produces the metaball ("goo") look and,
 * optionally, an outline that follows the merged contour.
 *
 * Technique:
 *  - feGaussianBlur + feColorMatrix re-thresholds alpha so that nearby shapes
 *    (cells + connection necks) fuse with smooth concave fillets.
 *  - feMorphology(erode) shrinks that silhouette; compositing the silhouette
 *    "out" of the eroded copy yields a ring that hugs the gooey contour,
 *    giving us a real metaball outline (and lets us hide the fill).
 */
function GooFilter({ id, letter }: { id: string; letter: Letter }) {
  const s = letter.settings;
  const layout = computeLayout(s);
  const blur = s.goo * layout.contentRadius * 0.55;
  // Higher contrast → crisper, more uniform merged contour (and outline ring).
  const M = 28;
  const erode = Math.max(0.5, s.outlineWidth * CELL);

  const fillColor = s.fillColor;
  const strokeColor = s.outlineColor;
  const wantFill = s.fill;
  const wantOutline = s.outline;

  return (
    <filter
      id={id}
      x="-30%"
      y="-30%"
      width="160%"
      height="160%"
      colorInterpolationFilters="sRGB"
    >
      <feGaussianBlur in="SourceGraphic" stdDeviation={blur} result="blur" />
      <feColorMatrix
        in="blur"
        type="matrix"
        values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${M} ${-M / 2}`}
        result="goo"
      />

      {wantOutline && (
        <Fragment>
          <feMorphology
            in="goo"
            operator="erode"
            radius={erode}
            result="eroded"
          />
          <feComposite in="goo" in2="eroded" operator="out" result="ring" />
        </Fragment>
      )}

      {/* Fill body (clipped to the gooey silhouette, or its eroded interior
          when an outline is also present so the colors don't overlap). */}
      {wantFill && (
        <Fragment>
          <feFlood floodColor={fillColor} result="fillFlood" />
          <feComposite
            in="fillFlood"
            in2={wantOutline ? "eroded" : "goo"}
            operator="in"
            result="fillPart"
          />
        </Fragment>
      )}

      {/* Outline ring. */}
      {wantOutline && (
        <Fragment>
          <feFlood floodColor={strokeColor} result="strokeFlood" />
          <feComposite
            in="strokeFlood"
            in2="ring"
            operator="in"
            result="strokePart"
          />
        </Fragment>
      )}

      <feMerge>
        {wantFill && <feMergeNode in="fillPart" />}
        {wantOutline && <feMergeNode in="strokePart" />}
      </feMerge>
    </filter>
  );
}

/**
 * Renders the artwork for one letter as SVG defs + groups (no <svg> wrapper),
 * so it can be embedded in the editor, the composer, and the exporter alike.
 */
export function GlyphArt({
  letter,
  uid,
  forceShowGrid,
  background,
}: {
  letter: Letter;
  uid: string;
  /** Editor passes true so the grid is always visible while designing. */
  forceShowGrid?: boolean;
  /** Paint the per-letter background fill (single-glyph contexts only). */
  background?: boolean;
}) {
  const s = letter.settings;
  const layout = computeLayout(s);
  const filterId = `goo-${uid}`;
  const comps = connectedComponents(letter.active, letter.connections);
  const showGrid = forceShowGrid ?? s.showGrid;
  // Saved letters from before this option default to the filter look.
  const connectMode = s.connectMode ?? "goo";
  const bg = s.bgColor ?? "transparent";

  return (
    <Fragment>
      {background && bg !== "transparent" && (
        <rect x={0} y={0} width={layout.viewW} height={layout.viewH} fill={bg} />
      )}
      {connectMode === "goo" && (
        <defs>
          <GooFilter id={filterId} letter={letter} />
        </defs>
      )}

      {showGrid && (
        <g stroke={s.gridColor} strokeWidth={1.5} opacity={0.9} fill="none">
          {Array.from({ length: s.cols }).map((_, c) =>
            Array.from({ length: s.rows }).map((__, r) => {
              const { x, y } = layout.center(c, r);
              // Grid cells take the selected shape (circle/diamond/triangle/
              // square), drawn at the full cell size as a guide.
              return (
                <path
                  key={`g-${c}-${r}`}
                  d={shapePath(s.cellShape, x, y, CELL / 2, layout.sx, layout.sy)}
                />
              );
            }),
          )}
        </g>
      )}

      {comps.map((comp, i) => {
        // A lone cell needs no metaball merge: render it as a crisp vector
        // shape so it fills the cell exactly at 100% and gets a clean,
        // uniform-width outline (the goo filter would blur/shrink both).
        if (comp.length === 1) {
          const { c, r } = parseKey(comp[0]);
          const { x, y } = layout.center(c, r);
          return (
            <path
              key={`comp-${i}`}
              d={shapePath(
                s.cellShape,
                x,
                y,
                layout.contentRadius,
                layout.sx,
                layout.sy,
              )}
              fill={s.fill ? s.fillColor : "none"}
              stroke={s.outline ? s.outlineColor : "none"}
              strokeWidth={s.outline ? s.outlineWidth * CELL : 0}
              strokeLinejoin="round"
            />
          );
        }

        // Connected cells.
        const compSet = new Set(comp);
        const connsInComp = letter.connections.filter(
          (cn) =>
            compSet.has(cellKey(cn.a.c, cn.a.r)) &&
            compSet.has(cellKey(cn.b.c, cn.b.r)),
        );

        // Geometry mode: one boolean-union path → crisp, uniform outline.
        if (connectMode === "geometry") {
          const d = componentUnionPath(s, layout, comp, connsInComp);
          return (
            <path
              key={`comp-${i}`}
              d={d}
              fill={s.fill ? s.fillColor : "none"}
              stroke={s.outline ? s.outlineColor : "none"}
              strokeWidth={s.outline ? s.outlineWidth * CELL : 0}
              strokeLinejoin="round"
            />
          );
        }

        // Goo mode: fuse bodies + necks via the SVG filter.
        const neckW =
          (s.connectionWidth *
            layout.contentRadius *
            2 *
            0.9 *
            (layout.sx + layout.sy)) /
            2 || 1;
        return (
          <g key={`comp-${i}`} filter={`url(#${filterId})`}>
            {/* Connection necks (drawn first, fused by the goo filter). */}
            {connsInComp.map((cn, j) => {
              const pa = layout.center(cn.a.c, cn.a.r);
              const pb = layout.center(cn.b.c, cn.b.r);
              return (
                <line
                  key={`neck-${i}-${j}`}
                  x1={pa.x * layout.sx}
                  y1={pa.y * layout.sy}
                  x2={pb.x * layout.sx}
                  y2={pb.y * layout.sy}
                  stroke="#000"
                  strokeWidth={neckW}
                  strokeLinecap="round"
                />
              );
            })}
            {/* Cell bodies. */}
            {comp.map((k) => {
              const { c, r } = parseKey(k);
              const { x, y } = layout.center(c, r);
              return (
                <path
                  key={`body-${k}`}
                  d={shapePath(
                    s.cellShape,
                    x,
                    y,
                    layout.contentRadius,
                    layout.sx,
                    layout.sy,
                  )}
                  fill="#000"
                />
              );
            })}
          </g>
        );
      })}

      {/* Negative-space gaps (static fills, independent of cells). */}
      {(letter.gaps ?? []).map((k) => {
        const { c, r } = parseKey(k);
        const d = gapPath(s, layout, c, r);
        if (!d) return null;
        return (
          <path
            key={`gap-${k}`}
            d={d}
            fill={s.fill ? s.fillColor : "none"}
            stroke={s.outline ? s.outlineColor : "none"}
            strokeWidth={s.outline ? s.outlineWidth * CELL : 0}
            strokeLinejoin="round"
          />
        );
      })}
    </Fragment>
  );
}

/** Standalone glyph as a complete <svg>. Used by composer & previews. */
export function Glyph({
  letter,
  uid,
  height = 80,
  className,
}: {
  letter: Letter;
  uid: string;
  height?: number;
  className?: string;
}) {
  const layout = computeLayout(letter.settings);
  const w = layout.viewW;
  const h = layout.viewH;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${w} ${h}`}
      height={height}
      width={(height * w) / h}
      xmlns="http://www.w3.org/2000/svg"
    >
      <GlyphArt letter={letter} uid={uid} background />
    </svg>
  );
}
