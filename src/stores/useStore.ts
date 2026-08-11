"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiTask, Clip, Project, ProviderKeys } from "@/types";

const uid = () => Math.random().toString(36).slice(2, 10);

export const defaultKeys: ProviderKeys = {
  opencodezen: "",
  opencodezenModel: "deepseek-v4-flash-free",
  opencodezenBase: "https://opencodezen.ai/api/v1",
  elevenlabs: "",
  elevenlabsVoice: "21m00Tcm4TlvDq8ikWAM",
  elevenlabsModel: "eleven_multilingual_v2",
  nvidiaNim: "",
  nvidiaNimBase: "https://ai.api.nvidia.com/v1",
  nvidiaTextModel: "meta/llama-3.3-70b-instruct",
  nvidiaAvatarModel: "nvidia/sdxl",
  unsplash: "",
  pexels: "",
  pixabay: "",
  firecrawl: "",
  musicbrainz: "",
  deezer: "",
  freesound: "",
  wav2lipPath: "",
};

const defaultProject = (): Project => ({
  id: uid(),
  name: "Untitled Video",
  width: 1920,
  height: 1080,
  fps: 30,
  duration: 0,
  format: "16:9",
  tracks: [
    { id: uid(), name: "Video", kind: "video", clips: [] },
    { id: uid(), name: "Audio", kind: "audio", clips: [] },
  ],
  narration: { text: "" },
  sfx: { enabled: true, whoosh: true, pop: true },
  music: { enabled: false, volume: 0.3 },
  avatar: { enabled: false, provider: "css" },
  updatedAt: Date.now(),
});

interface EditorState {
  project: Project;
  keys: ProviderKeys;
  currentTime: number;
  playing: boolean;
  selectedClipId: string | null;
  activePanel: "media" | "ai" | "settings" | null;
  aiTasks: AiTask[];
  aiRunning: boolean;
  setKeys: (k: Partial<ProviderKeys>) => void;
  setProject: (p: Partial<Project>) => void;
  addClip: (trackIdx: number, clip: Partial<Clip>) => void;
  updateClip: (clipId: string, patch: Partial<Clip>) => void;
  removeClip: (clipId: string) => void;
  setCurrentTime: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setSelectedClip: (id: string | null) => void;
  setPanel: (p: "media" | "ai" | "settings" | null) => void;
  setNarration: (text: string) => void;
  setAiTasks: (tasks: AiTask[] | ((prev: AiTask[]) => AiTask[])) => void;
  setAiRunning: (r: boolean) => void;
  newProject: () => void;
}

export const useEditor = create<EditorState>()(
  persist(
    (set) => ({
      project: defaultProject(),
      keys: defaultKeys,
      currentTime: 0,
      playing: false,
      selectedClipId: null,
      activePanel: null,
      aiTasks: [],
      aiRunning: false,

      setKeys: (k) => set((s) => ({ keys: { ...s.keys, ...k } })),
      setProject: (p) => set((s) => ({ project: { ...s.project, ...p, updatedAt: Date.now() } })),
      addClip: (trackIdx, clip) =>
        set((s) => {
          const tracks = s.project.tracks.map((t, i) =>
            i === trackIdx
              ? { ...t, clips: [...t.clips, { id: uid(), kind: "video", name: "Clip", duration: 5, volume: 1, effects: [], ...clip } as Clip] }
              : t
          );
          return { project: { ...s.project, tracks, updatedAt: Date.now() } };
        }),
      updateClip: (clipId, patch) =>
        set((s) => ({
          project: {
            ...s.project,
            tracks: s.project.tracks.map((t) => ({
              ...t,
              clips: t.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)),
            })),
            updatedAt: Date.now(),
          },
        })),
      removeClip: (clipId) =>
        set((s) => ({
          project: {
            ...s.project,
            tracks: s.project.tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) })),
            updatedAt: Date.now(),
          },
        })),
      setCurrentTime: (t) => set({ currentTime: t }),
      setPlaying: (p) => set({ playing: p }),
      setSelectedClip: (id) => set({ selectedClipId: id }),
      setPanel: (p) => set({ activePanel: p }),
      setNarration: (text) => set((s) => ({ project: { ...s.project, narration: { ...s.project.narration, text }, updatedAt: Date.now() } })),
      setAiTasks: (tasks) => set((s) => ({ aiTasks: typeof tasks === "function" ? (tasks as (p: AiTask[]) => AiTask[])(s.aiTasks) : tasks })),
      setAiRunning: (r) => set({ aiRunning: r }),
      newProject: () => set({ project: defaultProject(), currentTime: 0, selectedClipId: null, aiTasks: [] }),
    }),
    { name: "vidforge-editor-v1" }
  )
);
