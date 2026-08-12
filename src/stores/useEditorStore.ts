"use client";

// useEditorStore.ts - Complete Zustand state machine for the video editor
// Strictly decoupled from UI rendering to allow high-frequency playhead ticks.
// Playhead time updates via a lightweight tick store; heavy project mutations
// go through the main editor store with history support.

import { create } from "zustand";
import type { ApiKeys, Clip, Project, TimelineState, Track, AiTask, EditorSettings } from "@/types";

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ---------------------------------------------------------------------------
// Playhead tick store — updated at 60fps WITHOUT triggering React re-renders
// of the full tree. Components subscribe selectively.
// ---------------------------------------------------------------------------
export interface TickState {
  currentTime: number;
  isPlaying: boolean;
  seek: (t: number) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
}

export const usePlayhead = create<TickState>((set) => ({
  currentTime: 0,
  isPlaying: false,
  seek: (t) => set({ currentTime: Math.max(0, t) }),
  play: () => set({ isPlaying: true }),
  pause: () => set({ isPlaying: false }),
  toggle: () => set((s) => ({ isPlaying: !s.isPlaying })),
}));

// ---------------------------------------------------------------------------
// Default factory functions
// ---------------------------------------------------------------------------
export function defaultProject(): Project {
  return {
    id: uid(),
    name: "Untitled Video",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    duration: 60,
    fps: 30,
    width: 1920,
    height: 1080,
    tracks: [
      { id: uid(), name: "Video", type: "video", clips: [], muted: false, locked: false, visible: true, volume: 1, height: 96, color: "#3b82f6" },
      { id: uid(), name: "Overlay", type: "image", clips: [], muted: false, locked: false, visible: true, volume: 1, height: 80, color: "#8b5cf6" },
      { id: uid(), name: "Text", type: "text", clips: [], muted: false, locked: false, visible: true, volume: 1, height: 64, color: "#f59e0b" },
      { id: uid(), name: "Audio", type: "audio", clips: [], muted: false, locked: false, visible: true, volume: 1, height: 72, color: "#10b981" },
      { id: uid(), name: "Captions", type: "text", clips: [], muted: false, locked: false, visible: true, volume: 1, height: 48, color: "#ec4899" },
      { id: uid(), name: "Avatar", type: "avatar", clips: [], muted: false, locked: false, visible: true, volume: 1, height: 80, color: "#14b8a6" },
    ],
    settings: {
      backgroundColor: "#09090b",
      defaultTransitionDuration: 0.5,
      snapToGrid: true,
      gridSize: 0.1,
    },
  };
}

export function createClip(partial: Partial<Clip> & { type: Clip["type"]; url: string }): Clip {
  return {
    id: uid(),
    name: partial.name || "Clip",
    type: partial.type,
    url: partial.url,
    startTime: partial.startTime ?? 0,
    duration: partial.duration ?? 5,
    trimStart: partial.trimStart ?? 0,
    trimEnd: partial.trimEnd ?? (partial.duration ?? 5),
    layer: partial.layer ?? 0,
    volume: partial.volume ?? 1,
    muted: partial.muted ?? false,
    playbackRate: partial.playbackRate ?? 1,
    textConfig: partial.textConfig,
    filters: partial.filters ?? { brightness: 100, contrast: 100, saturation: 100, blur: 0, hueRotate: 0 },
    transform: partial.transform ?? { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
    sourceMetadata: partial.sourceMetadata,
  };
}

// ---------------------------------------------------------------------------
// Editor store — project mutations with bounded undo/redo history
// ---------------------------------------------------------------------------
const MAX_HISTORY = 50;

export interface EditorStoreState {
  project: Project;
  keys: ApiKeys;
  aiTasks: AiTask[];
  settings: EditorSettings;
  selectedClipIds: string[];
  undoStack: Project[];
  redoStack: Project[];
  saveState: "saved" | "saving" | "dirty";

  // ---- track operations ----
  addTrack: (track: Partial<Track>) => string;
  removeTrack: (trackId: string) => void;
  toggleTrackMuted: (trackId: string) => void;
  toggleTrackLocked: (trackId: string) => void;
  toggleTrackVisible: (trackId: string) => void;

  // ---- clip operations ----
  addClipToTrack: (trackId: string, clip: Partial<Clip> & { type: Clip["type"]; url: string }) => string;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, changes: Partial<Clip>) => void;
  moveClip: (clipId: string, newStartTime: number, newTrackId?: string) => void;
  trimClip: (clipId: string, trimStart: number, trimEnd: number) => void;
  duplicateClip: (clipId: string) => string | null;

  // ---- selection ----
  setSelectedClipIds: (ids: string[]) => void;

  // ---- project ----
  setProject: (p: Partial<Project>) => void;
  newProject: (name?: string) => void;
  setApiKey: (provider: keyof ApiKeys, value: string) => void;
  markSaved: () => void;

  // ---- history ----
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // ---- AI tasks ----
  addAiTask: (task: Omit<AiTask, "createdAt" | "updatedAt" | "status" | "progress"> & { id?: string }) => string;
  updateAiTask: (taskId: string, changes: Partial<AiTask>) => void;
  removeAiTask: (taskId: string) => void;

  // ---- persistence hooks (called by the autosave layer) ----
  getSerializableProject: () => Project;
}

export const useEditorStore = create<EditorStoreState>((set, get) => {
  // internal helper: commit a mutation with history
  const commit = (mutator: (project: Project) => Project) => {
    set((state) => {
      const prev = state.project;
      const next = mutator(structuredClone(prev));
      return {
        project: next,
        undoStack: [...state.undoStack, prev].slice(-MAX_HISTORY),
        redoStack: [],
        saveState: "dirty",
      };
    });
  };

  const findClip = (project: Project, clipId: string): { track: Track; clip: Clip; trackIndex: number; clipIndex: number } | null => {
    for (let ti = 0; ti < project.tracks.length; ti++) {
      const track = project.tracks[ti];
      for (let ci = 0; ci < track.clips.length; ci++) {
        if (track.clips[ci].id === clipId) {
          return { track, clip: track.clips[ci], trackIndex: ti, clipIndex: ci };
        }
      }
    }
    return null;
  };

  return {
    project: defaultProject(),
    keys: {
      nvidiaNim: "",
      openCodeZen: "",
      elevenLabs: "",
      firecrawl: "",
      wawaLipSync: "",
      unsplash: "",
      pexels: "",
      pixabay: "",
      musicBrainz: "",
      deezer: "",
      freesound: "",
    },
    aiTasks: [],
    settings: {
      theme: "dark",
      autoSave: true,
      autoSaveInterval: 1500,
      hardwareAcceleration: true,
      proxyResolution: "none",
      showWaveforms: true,
      showTimecodes: true,
      magneticTimeline: true,
      rippleEdit: false,
    },
    selectedClipIds: [],
    undoStack: [],
    redoStack: [],
    saveState: "saved",

    // ---- tracks ----
    addTrack: (track) => {
      const id = uid();
      commit((p) => ({
        ...p,
        tracks: [
          ...p.tracks,
          {
            id,
            name: track.name || "New Track",
            type: track.type || "video",
            clips: [],
            muted: false,
            locked: false,
            visible: true,
            volume: 1,
            height: track.height || 72,
            color: track.color || "#64748b",
          },
        ],
      }));
      return id;
    },

    removeTrack: (trackId) => {
      commit((p) => ({ ...p, tracks: p.tracks.filter((t) => t.id !== trackId) }));
    },

    toggleTrackMuted: (trackId) => {
      commit((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)) }));
    },

    toggleTrackLocked: (trackId) => {
      commit((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, locked: !t.locked } : t)) }));
    },

    toggleTrackVisible: (trackId) => {
      commit((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, visible: !t.visible } : t)) }));
    },

    // ---- clips ----
    addClipToTrack: (trackId, clipPartial) => {
      const clip = createClip(clipPartial);
      commit((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t)),
        duration: Math.max(p.duration, clip.startTime + clip.duration),
      }));
      return clip.id;
    },

    removeClip: (clipId) => {
      commit((p) => ({
        ...p,
        tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) })),
      }));
      set((s) => ({ selectedClipIds: s.selectedClipIds.filter((id) => id !== clipId) }));
    },

    updateClip: (clipId, changes) => {
      commit((p) => ({
        ...p,
        tracks: p.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...changes } : c)),
        })),
      }));
    },

    moveClip: (clipId, newStartTime, newTrackId) => {
      commit((p) => {
        const found = findClip(p, clipId);
        if (!found) return p;
        let tracks = p.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) => (c.id === clipId ? { ...c, startTime: Math.max(0, newStartTime) } : c)),
        }));
        if (newTrackId && newTrackId !== found.track.id) {
          const clip = found.clip;
          tracks = tracks.map((t) => (t.id === found.track.id ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) } : t));
          tracks = tracks.map((t) => (t.id === newTrackId ? { ...t, clips: [...t.clips, clip] } : t));
        }
        return { ...p, tracks };
      });
    },

    trimClip: (clipId, trimStart, trimEnd) => {
      commit((p) => {
        const found = findClip(p, clipId);
        if (!found) return p;
        const dur = Math.max(0.1, trimEnd - trimStart);
        return {
          ...p,
          tracks: p.tracks.map((t) => ({
            ...t,
            clips: t.clips.map((c) => (c.id === clipId ? { ...c, trimStart, trimEnd, duration: dur } : c)),
          })),
        };
      });
    },

    duplicateClip: (clipId) => {
      const found = findClip(get().project, clipId);
      if (!found) return null;
      const copy: Clip = {
        ...found.clip,
        id: uid(),
        startTime: found.clip.startTime + found.clip.duration + 0.1,
        name: `${found.clip.name} (copy)`,
      };
      commit((p) => ({
        ...p,
        tracks: p.tracks.map((t) => (t.id === found.track.id ? { ...t, clips: [...t.clips, copy] } : t)),
      }));
      return copy.id;
    },

    // ---- selection ----
    setSelectedClipIds: (ids) => set({ selectedClipIds: ids }),

    // ---- project ----
    setProject: (partial) =>
      set((s) => ({
        project: { ...s.project, ...partial, updatedAt: Date.now() },
        saveState: "dirty",
      })),

    newProject: (name) => {
      const p = defaultProject();
      if (name) p.name = name;
      set({ project: p, undoStack: [], redoStack: [], selectedClipIds: [], saveState: "dirty" });
    },

    setApiKey: (provider, value) =>
      set((s) => ({
        keys: { ...s.keys, [provider]: value },
        settings: s.settings,
      })),

    markSaved: () => set({ saveState: "saved" }),

    // ---- history ----
    undo: () => {
      const { undoStack, project } = get();
      if (!undoStack.length) return;
      const prev = undoStack[undoStack.length - 1];
      set({
        project: prev,
        undoStack: undoStack.slice(0, -1),
        redoStack: [...get().redoStack, project],
        saveState: "dirty",
      });
    },

    redo: () => {
      const { redoStack, project } = get();
      if (!redoStack.length) return;
      const next = redoStack[redoStack.length - 1];
      set({
        project: next,
        redoStack: redoStack.slice(0, -1),
        undoStack: [...get().undoStack, project],
        saveState: "dirty",
      });
    },

    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,

    // ---- AI tasks ----
    addAiTask: (task) => {
      const now = Date.now();
      const full: AiTask = { ...task, id: task.id || uid(), status: "pending", progress: 0, createdAt: now, updatedAt: now };
      set((s) => ({ aiTasks: [...s.aiTasks, full] }));
      return full.id;
    },

    updateAiTask: (taskId, changes) =>
      set((s) => ({
        aiTasks: s.aiTasks.map((t) => (t.id === taskId ? { ...t, ...changes, updatedAt: Date.now() } : t)),
      })),

    removeAiTask: (taskId) => set((s) => ({ aiTasks: s.aiTasks.filter((t) => t.id !== taskId) })),

    getSerializableProject: () => structuredClone(get().project),
  };
});
