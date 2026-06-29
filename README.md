# moreType

A **grid-based type construction kit**. Design letters by activating cells on a
configurable grid, fuse them into smooth *metaball* shapes, collect them into
alphabets, and compose words & sentences you can export as images.

![concept](https://img.shields.io/badge/stack-React%20%2B%20Vite%20%2B%20SVG-4f46e5)

## Quick start

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the production build
```

No backend — everything (your letters & alphabets) is stored in the browser's
`localStorage`.

## How it works

The app has three stages, matching the workflow in the tabs:

### 1 · Design

An interactive SVG grid editor.

- **Click or drag** cells to activate/deactivate them.
- **Click the dots** that appear between neighbouring active cells to connect
  them. Connected cells fuse into a single **metaball** with smooth concave
  necks (and even enclosed counters/holes when cells loop around).

Everything about the grid is adjustable in the left panel:

| Setting | What it does |
| --- | --- |
| Columns / Rows | Overall grid size |
| Horizontal / Vertical gap | Spacing between cells |
| Cell shape | `circle` · `square` · `diamond` · `triangle` |
| Content size | Size of the shape relative to its cell |
| Neck width | Thickness of metaball connections |
| Goo strength | How gooey/blobby the merges are (`0` = crisp) |
| Fill / Fill color | Toggle and color the solid body |
| Outline / width / color | An outline that follows the (gooey) contour, with the fill optionally hidden |
| Show grid / Grid color | Turn the construction grid on or off |

### 2 · Alphabets

- Create as many **alphabets** as you like.
- After designing a glyph, pick a target alphabet and type the **character**
  it represents (a letter, number, or punctuation, including space).
- Browse, re-edit, or remove assigned glyphs per alphabet.

Designed glyphs are also kept in a **Library** (right panel of the Design tab)
so you can reload and tweak them at any time.

### 3 · Compose

- Choose an alphabet and type a word or sentence (multi-line supported).
- Tune glyph size, letter spacing, line spacing, and background.
- **Download** the result as **PNG** or **SVG**.

## Architecture

```
src/
  types.ts               Data model (Letter, Alphabet, settings)
  store.ts               localStorage-backed state + immutable helpers
  lib/
    geometry.ts          Grid maths, connected-components, cell shape paths
    export.tsx           Word layout, SVG composition, PNG/SVG download
  components/
    GlyphArt.tsx         The goo/metaball SVG filter + glyph renderer (shared
                         by editor, previews, and exporter)
    GridEditor.tsx       Interactive cell + connection editing
    SettingsPanel.tsx    All grid/appearance controls
    AlphabetPanel.tsx    Alphabet & glyph management
    Composer.tsx         Word/sentence composition + export UI
  App.tsx                Tab shell wiring it together
```

### The metaball effect

Each connected group of cells is rendered inside its own SVG `<filter>` that:

1. `feGaussianBlur` + `feColorMatrix` re-thresholds alpha so nearby shapes and
   their connection "necks" fuse with smooth fillets (the classic *gooey*
   filter).
2. `feMorphology` (erode) + `feComposite` derive an outline ring that hugs the
   merged contour — which is how the **outline** mode and **hide-fill** option
   follow the metaball shape exactly.

Grouping per connected component means only *intentionally* connected cells
merge; separate clusters stay separate even when they sit close together.

## Animation (next up)

Rendering is pure SVG driven by a small set of numeric parameters
(`goo`, `contentScale`, `gapX/Y`, neck width, colors, per-cell state), so the
pieces are ready to animate — e.g. tween `goo`/`contentScale`, stagger cell
appearance, or morph between two saved letters. Hooks for this aren't built
yet, but the data model and renderer were designed with it in mind.
