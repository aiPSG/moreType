import { useMemo, useState } from "react";
import { useStore } from "../store";
import {
  CompositionSVG,
  type ComposeOptions,
  compositionToSVGString,
  defaultComposeOptions,
  downloadPNG,
  downloadSVG,
} from "../lib/export";

/** Compose words/sentences from designed glyphs and export them as images. */
export function Composer() {
  const state = useStore((s) => s);
  const alphabets = Object.values(state.alphabets);
  const [alphabetId, setAlphabetId] = useState(
    state.activeAlphabetId ?? alphabets[0]?.id ?? "",
  );
  const [text, setText] = useState("hello");
  const [opts, setOpts] = useState<ComposeOptions>(defaultComposeOptions);

  const alphabet = state.alphabets[alphabetId] ?? alphabets[0];

  const missing = useMemo(() => {
    if (!alphabet) return [];
    const set = new Set<string>();
    for (const ch of text) {
      if (ch === " " || ch === "\n") continue;
      const has =
        alphabet.glyphs[ch] ||
        alphabet.glyphs[ch.toUpperCase()] ||
        alphabet.glyphs[ch.toLowerCase()];
      if (!has) set.add(ch);
    }
    return [...set];
  }, [text, alphabet]);

  if (!alphabet) {
    return <p className="muted panel-page">Create an alphabet first.</p>;
  }

  const setOpt = (patch: Partial<ComposeOptions>) =>
    setOpts((o) => ({ ...o, ...patch }));

  const doExport = (kind: "svg" | "png") => {
    const svg = compositionToSVGString(text, alphabet, state.letters, opts);
    const base = (text.replace(/\s+/g, "_").slice(0, 24) || "moretype") + "." + kind;
    if (kind === "svg") downloadSVG(svg, base);
    else downloadPNG(svg, base, 2).catch((e) => alert(String(e)));
  };

  return (
    <div className="composer panel-page">
      <div className="composer-controls">
        <label className="field">
          <span className="field-label">Alphabet</span>
          <select
            value={alphabetId}
            onChange={(e) => setAlphabetId(e.target.value)}
          >
            {alphabets.map((ab) => (
              <option key={ab.id} value={ab.id}>
                {ab.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field grow">
          <span className="field-label">Text</span>
          <textarea
            rows={3}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type a word or sentence…"
          />
        </label>

        <div className="row gap wrap">
          <label className="field small">
            <span className="field-label">Size</span>
            <input
              type="range"
              min={40}
              max={240}
              step={4}
              value={opts.glyphHeight}
              onChange={(e) => setOpt({ glyphHeight: Number(e.target.value) })}
            />
          </label>
          <label className="field small">
            <span className="field-label">Letter spacing</span>
            <input
              type="range"
              min={-0.5}
              max={0.6}
              step={0.02}
              value={opts.letterSpacing}
              onChange={(e) =>
                setOpt({ letterSpacing: Number(e.target.value) })
              }
            />
          </label>
          <label className="field small">
            <span className="field-label">Line spacing</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={opts.lineSpacing}
              onChange={(e) => setOpt({ lineSpacing: Number(e.target.value) })}
            />
          </label>
          <label className="field small checkbox">
            <input
              type="checkbox"
              checked={opts.background === "transparent"}
              onChange={(e) =>
                setOpt({ background: e.target.checked ? "transparent" : "#ffffff" })
              }
            />
            <span>Transparent bg</span>
          </label>
          {opts.background !== "transparent" && (
            <label className="field small">
              <span className="field-label">Background</span>
              <input
                type="color"
                value={opts.background}
                onChange={(e) => setOpt({ background: e.target.value })}
              />
            </label>
          )}
        </div>

        {missing.length > 0 && (
          <p className="warn">
            No glyph for: {missing.map((m) => `"${m}"`).join(", ")} — they’ll
            render as blanks.
          </p>
        )}

        <div className="row gap">
          <button className="primary" onClick={() => doExport("png")}>
            ⬇ Download PNG
          </button>
          <button onClick={() => doExport("svg")}>⬇ Download SVG</button>
        </div>
      </div>

      <div
        className="composer-preview"
        style={{
          background:
            opts.background === "transparent"
              ? "repeating-conic-gradient(#eee 0% 25%, #fff 0% 50%) 50% / 24px 24px"
              : "#fafafb",
        }}
      >
        <CompositionSVG
          text={text}
          alphabet={alphabet}
          letters={state.letters}
          opts={opts}
        />
      </div>
    </div>
  );
}
