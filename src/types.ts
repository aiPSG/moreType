// Core data model for moreType.
//
// A *letter* is a design made on a grid: a set of activated cells plus optional
// connections between adjacent cells (which produce the metaball / "goo" necks).
// Every letter carries its own rendering settings so that glyphs in an alphabet
// can look different from one another if desired.

export type CellShape = "circle" | "square" | "diamond" | "triangle";

/** A grid coordinate. Stored as "col,row" strings inside Sets/keys. */
export interface Cell {
  c: number; // column, 0-indexed from left
  r: number; // row, 0-indexed from top
}

/** An undirected connection between two adjacent (incl. diagonal) cells. */
export interface Connection {
  a: Cell;
  b: Cell;
}

export interface LetterSettings {
  cols: number;
  rows: number;

  cellShape: CellShape;

  /** Horizontal gap between cells, as a fraction of the cell box size. */
  gapX: number;
  /** Vertical gap between cells, as a fraction of the cell box size. */
  gapY: number;

  /** Size of the cell *content* relative to the cell box (0–1). */
  contentScale: number;

  /** Thickness of a connection neck relative to content size (0–1). */
  connectionWidth: number;

  /**
   * How connected cells are merged:
   *  - "geometry": real boolean-union geometry (crisp, uniform outline, exact
   *    body sizes; metaball fillets for circles, capsule necks otherwise).
   *  - "goo": the SVG blur/threshold filter (softer, more organic, but blurs
   *    the bodies and outline).
   */
  connectMode: "geometry" | "goo";

  /** Strength of the metaball merge (0 = crisp, 1 = very gooey). */
  goo: number;

  /** Render the filled body. */
  fill: boolean;
  fillColor: string;

  /** Render an outline that follows the (possibly gooey) contour. */
  outline: boolean;
  outlineColor: string;
  /** Outline thickness relative to the cell box size (0–1). */
  outlineWidth: number;

  /** Show the construction grid (editor + optionally on export). */
  showGrid: boolean;
  gridColor: string;
}

export interface Letter {
  id: string;
  /** Free-form name shown in the UI (e.g. "A draft 2"). */
  name: string;
  /** Active cells, as "c,r" keys. */
  active: string[];
  /**
   * Active negative-space "gap" cells, as "c,r" keys. A gap (c,r) sits at the
   * interior vertex shared by cells (c,r),(c+1,r),(c,r+1),(c+1,r+1) and fills
   * the interstitial shape between them. May be absent on letters saved before
   * this feature.
   */
  gaps?: string[];
  /** Connections between active cells. */
  connections: Connection[];
  settings: LetterSettings;
  createdAt: number;
  updatedAt: number;
}

/** A glyph slot in an alphabet: a character mapped to a saved letter id. */
export interface Alphabet {
  id: string;
  name: string;
  /** Map from character (e.g. "A", "7", "!") to a Letter id. */
  glyphs: Record<string, string>;
  createdAt: number;
}

export interface AppState {
  letters: Record<string, Letter>;
  alphabets: Record<string, Alphabet>;
  /** The alphabet currently being worked in. */
  activeAlphabetId: string | null;
}
