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
  const M = 22;
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
}: {
  letter: Letter;
  uid: string;
  /** Editor passes true so the grid is always visible while designing. */
  forceShowGrid?: boolean;
}) {
  const s = letter.settings;
  const layout = computeLayout(s);
  const filterId = `goo-${uid}`;
  const comps = connectedComponents(letter.active, letter.connections);
  const showGrid = forceShowGrid ?? s.showGrid;

  return (
    <Fragment>
      <defs>
        <GooFilter id={filterId} letter={letter} />
      </defs>

      {showGrid && (
        <g stroke={s.gridColor} strokeWidth={1.5} opacity={0.9}>
          {Array.from({ length: s.cols }).map((_, c) =>
            Array.from({ length: s.rows }).map((__, r) => {
              const { x, y } = layout.center(c, r);
              const h = CELL / 2;
              return (
                <rect
                  key={`g-${c}-${r}`}
                  x={x - h}
                  y={y - h}
                  width={CELL}
                  height={CELL}
                  fill="none"
                />
              );
            }),
          )}
        </g>
      )}

      {/* One goo group per connected component → only intentional merges. */}
      {comps.map((comp, i) => {
        const compSet = new Set(comp);
        const connsInComp = letter.connections.filter(
          (cn) =>
            compSet.has(cellKey(cn.a.c, cn.a.r)) &&
            compSet.has(cellKey(cn.b.c, cn.b.r)),
        );
        const neckW =
          s.connectionWidth * layout.contentRadius * 2 * 0.9 || 1;
        return (
          <g key={`comp-${i}`} filter={`url(#${filterId})`}>
            {/* Connection necks (drawn first, fused by the goo filter). */}
            {connsInComp.map((cn, j) => {
              const pa = layout.center(cn.a.c, cn.a.r);
              const pb = layout.center(cn.b.c, cn.b.r);
              return (
                <line
                  key={`neck-${i}-${j}`}
                  x1={pa.x}
                  y1={pa.y}
                  x2={pb.x}
                  y2={pb.y}
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
                  d={shapePath(s.cellShape, x, y, layout.contentRadius)}
                  fill="#000"
                />
              );
            })}
          </g>
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
  const w = layout.width + layout.pad * 2;
  const h = layout.height + layout.pad * 2;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${w} ${h}`}
      height={height}
      width={(height * w) / h}
      xmlns="http://www.w3.org/2000/svg"
    >
      <GlyphArt letter={letter} uid={uid} />
    </svg>
  );
}
