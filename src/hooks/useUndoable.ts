import { useCallback, useRef, useState } from "react";

interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export interface UndoControls {
  undo: () => void;
  redo: () => void;
  /** Replace the value AND clear history (e.g. loading a different letter). */
  replace: (v: unknown) => void;
  canUndo: boolean;
  canRedo: boolean;
}

const LIMIT = 200;

/**
 * State with undo/redo history. `set` records a new step; `replace` swaps the
 * value and resets history. Coalesces bursts of rapid changes (slider drags,
 * paint strokes) that land within `coalesceMs` into a single undo step.
 */
export function useUndoable<T>(
  initial: T | (() => T),
  coalesceMs = 400,
): [T, (next: T) => void, UndoControls] {
  const [hist, setHist] = useState<History<T>>(() => ({
    past: [],
    present:
      typeof initial === "function" ? (initial as () => T)() : initial,
    future: [],
  }));
  const lastEdit = useRef(0);

  const set = useCallback(
    (next: T) => {
      const now = Date.now();
      const coalesce = now - lastEdit.current < coalesceMs;
      lastEdit.current = now;
      setHist((h) => {
        if (Object.is(next, h.present)) return h;
        // Coalesce: replace present without pushing a new past entry.
        if (coalesce && h.past.length > 0) {
          return { past: h.past, present: next, future: [] };
        }
        const past = [...h.past, h.present];
        if (past.length > LIMIT) past.shift();
        return { past, present: next, future: [] };
      });
    },
    [coalesceMs],
  );

  const undo = useCallback(() => {
    lastEdit.current = 0;
    setHist((h) => {
      if (h.past.length === 0) return h;
      const present = h.past[h.past.length - 1];
      return {
        past: h.past.slice(0, -1),
        present,
        future: [h.present, ...h.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    lastEdit.current = 0;
    setHist((h) => {
      if (h.future.length === 0) return h;
      return {
        past: [...h.past, h.present],
        present: h.future[0],
        future: h.future.slice(1),
      };
    });
  }, []);

  const replace = useCallback((v: unknown) => {
    lastEdit.current = 0;
    setHist({ past: [], present: v as T, future: [] });
  }, []);

  return [
    hist.present,
    set,
    {
      undo,
      redo,
      replace,
      canUndo: hist.past.length > 0,
      canRedo: hist.future.length > 0,
    },
  ];
}
