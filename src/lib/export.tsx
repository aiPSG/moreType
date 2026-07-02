import { renderToStaticMarkup } from "react-dom/server";
import type { Alphabet, Letter } from "../types";
import { CELL, computeLayout, contentColumnSpan } from "./geometry";
import { GlyphArt } from "../components/GlyphArt";

export interface ComposeOptions {
  /** Rendered glyph height in px (drives overall scale). */
  glyphHeight: number;
  /** Space between glyphs, as a fraction of glyph height. */
  letterSpacing: number;
  /** Width of a space character, as a fraction of glyph height. */
  spaceWidth: number;
  /** Line spacing, as a fraction of glyph height. */
  lineSpacing: number;
  /** Background color (use "transparent" for none). */
  background: string;
  /** Padding around the whole composition in px. */
  padding: number;
}

export const defaultComposeOptions: ComposeOptions = {
  glyphHeight: 120,
  letterSpacing: 0.12,
  spaceWidth: 0.4,
  lineSpacing: 0.3,
  background: "#ffffff",
  padding: 40,
};

interface Placed {
  letter: Letter;
  x: number;
  y: number;
  w: number;
  h: number;
  uid: string;
  /** Per-glyph viewBox, cropped horizontally to the glyph's actual content. */
  vbMinX: number;
  vbW: number;
  vbH: number;
}

interface Composition {
  placed: Placed[];
  width: number;
  height: number;
}

/** Resolve a character to its assigned letter (case-insensitive fallback). */
function lookup(
  ch: string,
  alphabet: Alphabet,
  letters: Record<string, Letter>,
): Letter | null {
  const id =
    alphabet.glyphs[ch] ??
    alphabet.glyphs[ch.toUpperCase()] ??
    alphabet.glyphs[ch.toLowerCase()];
  return id ? letters[id] ?? null : null;
}

export function composeText(
  text: string,
  alphabet: Alphabet,
  letters: Record<string, Letter>,
  opts: ComposeOptions,
): Composition {
  const H = opts.glyphHeight;
  const placed: Placed[] = [];
  const lines = text.split("\n");
  const lineHeight = H * (1 + opts.lineSpacing);

  let maxWidth = 0;
  lines.forEach((line, li) => {
    let x = 0;
    const y = li * lineHeight;
    [...line].forEach((ch, ci) => {
      if (ch === " ") {
        x += H * opts.spaceWidth;
        return;
      }
      const letter = lookup(ch, alphabet, letters);
      if (!letter) {
        // Unknown glyph → reserve a space so layout stays readable.
        x += H * opts.spaceWidth;
        return;
      }
      const layout = computeLayout(letter.settings);
      const span = contentColumnSpan(letter);
      if (!span) {
        // Empty glyph behaves like a space.
        x += H * opts.spaceWidth;
        return;
      }
      // Crop horizontally to the glyph's real content so empty grid columns
      // don't inflate spacing; keep full height for a consistent baseline.
      const vbH = layout.viewH;
      const bearing = CELL * 0.12;
      const leftX = layout.pad + span.minCol * layout.pitchX;
      const rightX = layout.pad + span.maxCol * layout.pitchX + CELL;
      const vbMinX = (leftX - bearing) * layout.sx;
      const vbW = (rightX - leftX + bearing * 2) * layout.sx;
      const w = (H * vbW) / vbH;
      placed.push({
        letter,
        x,
        y,
        w,
        h: H,
        uid: `c${li}_${ci}`,
        vbMinX,
        vbW,
        vbH,
      });
      x += w + H * opts.letterSpacing;
    });
    maxWidth = Math.max(maxWidth, x);
  });

  return {
    placed,
    width: maxWidth + opts.padding * 2,
    height: lines.length * lineHeight + opts.padding * 2,
  };
}

/** Build a single self-contained <svg> element for a whole composition. */
export function CompositionSVG({
  text,
  alphabet,
  letters,
  opts,
}: {
  text: string;
  alphabet: Alphabet;
  letters: Record<string, Letter>;
  opts: ComposeOptions;
}) {
  const comp = composeText(text, alphabet, letters, opts);
  const p = opts.padding;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={comp.width}
      height={comp.height}
      viewBox={`0 0 ${comp.width} ${comp.height}`}
    >
      {opts.background !== "transparent" && (
        <rect
          x={0}
          y={0}
          width={comp.width}
          height={comp.height}
          fill={opts.background}
        />
      )}
      {comp.placed.map((pl) => {
        return (
          <svg
            key={pl.uid}
            x={p + pl.x}
            y={p + pl.y}
            width={pl.w}
            height={pl.h}
            viewBox={`${pl.vbMinX} 0 ${pl.vbW} ${pl.vbH}`}
            overflow="visible"
          >
            {/* Never show the editing grid in exports. */}
            <GlyphArt
              letter={{ ...pl.letter, settings: { ...pl.letter.settings, showGrid: false } }}
              uid={pl.uid}
            />
          </svg>
        );
      })}
    </svg>
  );
}

export function compositionToSVGString(
  text: string,
  alphabet: Alphabet,
  letters: Record<string, Letter>,
  opts: ComposeOptions,
): string {
  const markup = renderToStaticMarkup(
    <CompositionSVG text={text} alphabet={alphabet} letters={letters} opts={opts} />,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n${markup}`;
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadSVG(svgString: string, filename: string) {
  const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Rasterize an SVG string to a PNG and download it. */
export function downloadPNG(
  svgString: string,
  filename: string,
  scale = 2,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const svgBlob = new Blob([svgString], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("PNG encoding failed"));
          return;
        }
        const pngUrl = URL.createObjectURL(blob);
        triggerDownload(pngUrl, filename);
        setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
        resolve();
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to rasterize SVG"));
    };
    img.src = url;
  });
}
