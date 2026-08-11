"use client";

// ---------- Command-history store (undo/redo) ----------
// Project snapshots are cheap (metadata-only, no media buffers in state),
// so a bounded snapshot stack is the simplest correct undo/redo.
// Media blobs live in IndexedDB; the project object references them by id.

import { create } from "zustand";
import { useEditor } from "./useStore";

const MAX_HISTORY = 100;

interface HistoryState {
  past: unknown[];       // previous project states
  future: unknown[];     // redo stack
  canUndo: boolean;
  canRedo: boolean;
  push: (project: unknown) => void;
  undo: (current: unknown) => unknown | null;
  redo: (current: unknown) => unknown | null;
  clear: () => void;
}

export const useHistory = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,

  push: (project) => {
    const { past } = get();
    const next = [...past, structuredClone(project)].slice(-MAX_HISTORY);
    set({ past: next, future: [], canUndo: next.length > 0, canRedo: false });
  },

  undo: (current) => {
    const { past, future } = get();
    if (!past.length) return null;
    const prev = past[past.length - 1];
    set({
      past: past.slice(0, -1),
      future: [structuredClone(current), ...future].slice(0, MAX_HISTORY),
      canUndo: past.length - 1 > 0,
      canRedo: true,
    });
    return prev;
  },

  redo: (current) => {
    const { past, future } = get();
    if (!future.length) return null;
    const next = future[0];
    set({
      past: [...past, structuredClone(current)].slice(-MAX_HISTORY),
      future: future.slice(1),
      canUndo: true,
      canRedo: future.length - 1 > 0,
    });
    return next;
  },

  clear: () => set({ past: [], future: [], canUndo: false, canRedo: false }),
}));

/** Wrap an editor mutation: push current state before applying the change. */
export function withHistory(apply: () => void) {
  const { project } = useEditor.getState();
  useHistory.getState().push(project);
  apply();
}
