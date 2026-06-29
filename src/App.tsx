import { useState } from "react";
import type { Letter } from "./types";
import { newLetter, store, useStore } from "./store";
import { GridEditor } from "./components/GridEditor";
import { SettingsPanel } from "./components/SettingsPanel";
import { AlphabetPanel } from "./components/AlphabetPanel";
import { Composer } from "./components/Composer";
import { Glyph } from "./components/GlyphArt";

type Tab = "design" | "alphabets" | "compose";

export default function App() {
  const state = useStore((s) => s);
  const [tab, setTab] = useState<Tab>("design");
  const [working, setWorking] = useState<Letter>(() => newLetter());
  const [assignChar, setAssignChar] = useState("");
  const [assignAlphabet, setAssignAlphabet] = useState(
    state.activeAlphabetId ?? "",
  );

  const alphabets = Object.values(state.alphabets);
  const library = Object.values(state.letters).sort(
    (a, b) => b.updatedAt - a.updatedAt,
  );

  const editLetter = (id: string) => {
    const l = state.letters[id];
    if (!l) return;
    setWorking(structuredClone(l));
    setTab("design");
  };

  const saveToLibrary = () => {
    store.saveLetter(working);
  };

  const assign = () => {
    const target = assignAlphabet || alphabets[0]?.id;
    if (!target) {
      alert("Create an alphabet first (Alphabets tab).");
      return;
    }
    if (!assignChar) {
      alert("Type the character this glyph represents.");
      return;
    }
    store.saveLetter(working);
    store.assignGlyph(target, assignChar, working.id);
    setAssignChar("");
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          more<span>Type</span>
          <em>grid type construction kit</em>
        </div>
        <nav className="tabs">
          {(["design", "alphabets", "compose"] as Tab[]).map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t === "design"
                ? "1 · Design"
                : t === "alphabets"
                  ? "2 · Alphabets"
                  : "3 · Compose"}
            </button>
          ))}
        </nav>
      </header>

      {tab === "design" && (
        <div className="design-layout">
          <aside className="left">
            <SettingsPanel letter={working} onChange={setWorking} />
          </aside>

          <main className="center">
            <div className="editor-wrap">
              <GridEditor letter={working} onChange={setWorking} />
            </div>
            <p className="hint">
              Click or drag cells to build a glyph. Click the dots between
              neighbouring cells to fuse them into a metaball.
            </p>
          </main>

          <aside className="right">
            <section className="save-box">
              <h3>Save letter</h3>
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  value={working.name}
                  onChange={(e) =>
                    setWorking({ ...working, name: e.target.value })
                  }
                />
              </label>

              <div className="row gap">
                <button onClick={saveToLibrary}>Save to library</button>
                <button onClick={() => setWorking(newLetter(working.settings))}>
                  New letter
                </button>
              </div>

              <hr />

              <h4>Assign to alphabet</h4>
              <label className="field">
                <span className="field-label">Alphabet</span>
                <select
                  value={assignAlphabet}
                  onChange={(e) => setAssignAlphabet(e.target.value)}
                >
                  <option value="">— select —</option>
                  {alphabets.map((ab) => (
                    <option key={ab.id} value={ab.id}>
                      {ab.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Represents character</span>
                <div className="row gap">
                  <input
                    className="char-input"
                    maxLength={2}
                    value={assignChar}
                    placeholder="A, 7, !"
                    onChange={(e) => setAssignChar(e.target.value)}
                  />
                  <button onClick={() => setAssignChar(" ")}>space</button>
                </div>
              </label>
              <button className="primary block" onClick={assign}>
                Assign glyph
              </button>
            </section>

            <section className="library">
              <h3>Library ({library.length})</h3>
              <div className="library-grid">
                {library.map((l) => (
                  <div
                    key={l.id}
                    className={`lib-item ${l.id === working.id ? "current" : ""}`}
                  >
                    <button
                      className="lib-art"
                      title={l.name}
                      onClick={() => editLetter(l.id)}
                    >
                      <Glyph letter={l} uid={`lib-${l.id}`} height={48} />
                    </button>
                    <span className="lib-name">{l.name}</span>
                    <button
                      className="ghost danger tiny"
                      onClick={() => store.deleteLetter(l.id)}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {library.length === 0 && (
                  <p className="muted">Saved glyphs appear here.</p>
                )}
              </div>
            </section>
          </aside>
        </div>
      )}

      {tab === "alphabets" && <AlphabetPanel onEdit={editLetter} />}
      {tab === "compose" && <Composer />}
    </div>
  );
}
