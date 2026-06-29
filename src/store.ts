import { useSyncExternalStore } from "react";
import type { AppState, Alphabet, Connection, Letter, LetterSettings } from "./types";
import { connKey, defaultSettings } from "./lib/geometry";

const STORAGE_KEY = "moretype.state.v1";

const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Create a fresh, in-memory letter (NOT yet persisted to the library). */
export function newLetter(settings?: LetterSettings): Letter {
  const now = Date.now();
  return {
    id: uid(),
    name: "Untitled",
    active: [],
    connections: [],
    settings: settings ?? defaultSettings(),
    createdAt: now,
    updatedAt: now,
  };
}

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    /* ignore corrupt storage */
  }
  // Seed with one empty alphabet.
  const ab: Alphabet = {
    id: uid(),
    name: "My Alphabet",
    glyphs: {},
    createdAt: Date.now(),
  };
  return { letters: {}, alphabets: { [ab.id]: ab }, activeAlphabetId: ab.id };
}

let state: AppState = loadState();
const listeners = new Set<() => void>();

function emit() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
  for (const l of listeners) l();
}

function set(updater: (s: AppState) => AppState) {
  state = updater(state);
  emit();
}

export const store = {
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  get: () => state,

  // ---- Letters -----------------------------------------------------------
  createLetter(settings?: LetterSettings): Letter {
    const now = Date.now();
    const letter: Letter = {
      id: uid(),
      name: "Untitled",
      active: [],
      connections: [],
      settings: settings ?? defaultSettings(),
      createdAt: now,
      updatedAt: now,
    };
    set((s) => ({ ...s, letters: { ...s.letters, [letter.id]: letter } }));
    return letter;
  },

  saveLetter(letter: Letter) {
    set((s) => ({
      ...s,
      letters: {
        ...s.letters,
        [letter.id]: { ...letter, updatedAt: Date.now() },
      },
    }));
  },

  deleteLetter(id: string) {
    set((s) => {
      const letters = { ...s.letters };
      delete letters[id];
      // Detach from any alphabet glyph slots.
      const alphabets: Record<string, Alphabet> = {};
      for (const [aid, ab] of Object.entries(s.alphabets)) {
        const glyphs = Object.fromEntries(
          Object.entries(ab.glyphs).filter(([, lid]) => lid !== id),
        );
        alphabets[aid] = { ...ab, glyphs };
      }
      return { ...s, letters, alphabets };
    });
  },

  // ---- Alphabets ---------------------------------------------------------
  createAlphabet(name: string): Alphabet {
    const ab: Alphabet = {
      id: uid(),
      name: name || "Untitled Alphabet",
      glyphs: {},
      createdAt: Date.now(),
    };
    set((s) => ({
      ...s,
      alphabets: { ...s.alphabets, [ab.id]: ab },
      activeAlphabetId: ab.id,
    }));
    return ab;
  },

  renameAlphabet(id: string, name: string) {
    set((s) => ({
      ...s,
      alphabets: { ...s.alphabets, [id]: { ...s.alphabets[id], name } },
    }));
  },

  deleteAlphabet(id: string) {
    set((s) => {
      const alphabets = { ...s.alphabets };
      delete alphabets[id];
      const remaining = Object.keys(alphabets);
      return {
        ...s,
        alphabets,
        activeAlphabetId:
          s.activeAlphabetId === id ? remaining[0] ?? null : s.activeAlphabetId,
      };
    });
  },

  setActiveAlphabet(id: string) {
    set((s) => ({ ...s, activeAlphabetId: id }));
  },

  /** Assign a letter to a character slot within an alphabet. */
  assignGlyph(alphabetId: string, char: string, letterId: string) {
    if (!char) return;
    set((s) => {
      const ab = s.alphabets[alphabetId];
      if (!ab) return s;
      return {
        ...s,
        alphabets: {
          ...s.alphabets,
          [alphabetId]: { ...ab, glyphs: { ...ab.glyphs, [char]: letterId } },
        },
      };
    });
  },

  unassignGlyph(alphabetId: string, char: string) {
    set((s) => {
      const ab = s.alphabets[alphabetId];
      if (!ab) return s;
      const glyphs = { ...ab.glyphs };
      delete glyphs[char];
      return {
        ...s,
        alphabets: { ...s.alphabets, [alphabetId]: { ...ab, glyphs } },
      };
    });
  },
};

// ---- Pure helpers for working letters (immutably) -----------------------
export function toggleCell(letter: Letter, key: string): Letter {
  const has = letter.active.includes(key);
  const active = has
    ? letter.active.filter((k) => k !== key)
    : [...letter.active, key];
  // Drop any connections that reference a removed cell.
  const connections = has
    ? letter.connections.filter((cn) => {
        const ka = `${cn.a.c},${cn.a.r}`;
        const kb = `${cn.b.c},${cn.b.r}`;
        return ka !== key && kb !== key;
      })
    : letter.connections;
  return { ...letter, active, connections };
}

export function toggleConnection(letter: Letter, conn: Connection): Letter {
  const target = connKey(conn.a, conn.b);
  const exists = letter.connections.some(
    (cn) => connKey(cn.a, cn.b) === target,
  );
  const connections = exists
    ? letter.connections.filter((cn) => connKey(cn.a, cn.b) !== target)
    : [...letter.connections, conn];
  return { ...letter, connections };
}

// ---- React hooks --------------------------------------------------------
export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.get()),
    () => selector(store.get()),
  );
}
