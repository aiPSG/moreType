import { useState } from "react";
import { store, useStore } from "../store";
import { Glyph } from "./GlyphArt";

/** Manage alphabets and inspect their assigned glyphs. */
export function AlphabetPanel({ onEdit }: { onEdit: (letterId: string) => void }) {
  const state = useStore((s) => s);
  const [newName, setNewName] = useState("");

  const alphabets = Object.values(state.alphabets).sort(
    (a, b) => a.createdAt - b.createdAt,
  );

  return (
    <div className="panel-page">
      <div className="row gap wrap">
        <input
          placeholder="New alphabet name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) {
              store.createAlphabet(newName.trim());
              setNewName("");
            }
          }}
        />
        <button
          className="primary"
          onClick={() => {
            if (newName.trim()) {
              store.createAlphabet(newName.trim());
              setNewName("");
            }
          }}
        >
          + Create alphabet
        </button>
      </div>

      {alphabets.length === 0 && <p className="muted">No alphabets yet.</p>}

      {alphabets.map((ab) => {
        const entries = Object.entries(ab.glyphs).sort(([a], [b]) =>
          a.localeCompare(b),
        );
        return (
          <section key={ab.id} className="alphabet-card">
            <header className="row gap between">
              <input
                className="alphabet-name"
                value={ab.name}
                onChange={(e) => store.renameAlphabet(ab.id, e.target.value)}
              />
              <div className="row gap">
                <span className="muted">{entries.length} glyphs</span>
                <button
                  className="danger ghost"
                  onClick={() => {
                    if (confirm(`Delete alphabet "${ab.name}"?`))
                      store.deleteAlphabet(ab.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </header>

            {entries.length === 0 ? (
              <p className="muted">
                No glyphs assigned. Design a letter and assign it here.
              </p>
            ) : (
              <div className="glyph-grid">
                {entries.map(([ch, lid]) => {
                  const letter = state.letters[lid];
                  return (
                    <div key={ch} className="glyph-cell">
                      <div className="glyph-cell-art">
                        {letter ? (
                          <Glyph letter={letter} uid={`ab-${ab.id}-${ch}`} height={64} />
                        ) : (
                          <span className="muted">missing</span>
                        )}
                      </div>
                      <div className="glyph-cell-char">{ch === " " ? "␣" : ch}</div>
                      <div className="row gap center">
                        {letter && (
                          <button className="ghost" onClick={() => onEdit(lid)}>
                            Edit
                          </button>
                        )}
                        <button
                          className="ghost danger"
                          onClick={() => store.unassignGlyph(ab.id, ch)}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
