// aiCommands.ts — Editor Command Interface
// -----------------------------------------------------------------------------
// This is the CONTRACT between the editor and any future AI layer.
// AI integrations (script gen, TTS, image search, auto-edit, avatar) must drive
// the editor EXCLUSIVELY through these commands — they never mutate store state
// directly. The editor stays fully functional with no AI code loaded; when the
// AI module is added later, it imports this interface and issues commands.
//
// Design rules:
//  - Every editor mutation is an EditorCommand (discriminated union).
//  - `executeEditorCommand` is the single entry point (undo/redo aware).
//  - AI plans are validated against a schema before any command is issued.
//  - The AI layer can listen to editor events via `EditorEvent`s.
// -----------------------------------------------------------------------------

import type { Clip, Project, Track } from "@/types";

// ---------------------------------------------------------------------------
// Commands — the only way to change the project
// ---------------------------------------------------------------------------
export type EditorCommand =
  | { type: "project.create"; name: string; width: number; height: number; fps: number; format: "16:9" | "9:16" | "1:1" | "4:5" }
  | { type: "project.rename"; name: string }
  | { type: "project.setResolution"; width: number; height: number }
  | { type: "track.add"; name?: string; kind: Track["kind"] }
  | { type: "track.remove"; trackId: string }
  | { type: "track.rename"; trackId: string; name: string }
  | { type: "track.setMuted"; trackId: string; muted: boolean }
  | { type: "track.setLocked"; trackId: string; locked: boolean }
  | { type: "track.setVisible"; trackId: string; visible: boolean }
  | { type: "clip.add"; trackId: string; clip: Partial<Clip> & { kind: Clip["kind"]; src?: string } }
  | { type: "clip.remove"; clipId: string }
  | { type: "clip.update"; clipId: string; changes: Partial<Clip> }
  | { type: "clip.move"; clipId: string; position: number; trackId?: string }
  | { type: "clip.trim"; clipId: string; start: number; duration: number }
  | { type: "clip.split"; clipId: string; at: number }
  | { type: "clip.duplicate"; clipId: string }
  | { type: "clip.setTransform"; clipId: string; transform: Partial<NonNullable<Clip["transform"]>> }
  | { type: "clip.setVolume"; clipId: string; volume: number }
  | { type: "clip.setSpeed"; clipId: string; speed: number }
  | { type: "clip.setText"; clipId: string; text: string }
  | { type: "clip.setEffect"; clipId: string; effect: string }
  | { type: "timeline.seek"; time: number }
  | { type: "timeline.play" }
  | { type: "timeline.pause" }
  | { type: "timeline.setDuration"; duration: number }
  | { type: "export.start"; config?: { width?: number; height?: number; fps?: number } }
  | { type: "project.save" }
  | { type: "project.load"; project: Project };

// ---------------------------------------------------------------------------
// Editor events — the AI layer can observe these
// ---------------------------------------------------------------------------
export type EditorEvent =
  | { type: "project.changed"; project: Project }
  | { type: "clip.added"; clipId: string; trackId: string }
  | { type: "clip.removed"; clipId: string }
  | { type: "clip.updated"; clipId: string }
  | { type: "playhead.moved"; time: number }
  | { type: "playback.started" }
  | { type: "playback.stopped" }
  | { type: "export.completed"; url: string; mime: string }
  | { type: "asset.imported"; assetId: string; kind: "video" | "image" | "audio" }
  | { type: "ai.assetsReady"; clipIds: string[] }; // fired when AI-generated clips land on the timeline

// ---------------------------------------------------------------------------
// AI Provider interfaces — implemented by the AI layer later, never by the
// editor. The editor only depends on these TYPES.
// ---------------------------------------------------------------------------
export interface AiProvider {
  name: string;
  testConnection: () => Promise<{ ok: boolean; error?: string }>;
}

export interface ScriptProvider extends AiProvider {
  generateScript(input: { topic: string; duration?: number; style?: string; language?: string }): Promise<{
    script: string;
    scenes: { narration: string; visualDescription: string; duration: number }[];
  }>;
}

export interface VoiceProvider extends AiProvider {
  synthesize(text: string, voice?: string): Promise<{ url: string; duration: number }>;
}

export interface ImageProvider extends AiProvider {
  searchImages(input: { query: string; orientation?: string; limit?: number }): Promise<
    { url: string; author?: string; source: string; license?: string }[]
  >;
}

export interface MusicProvider extends AiProvider {
  searchAudio(input: { query: string; duration?: string; mood?: string }): Promise<
    { url: string; title: string; artist?: string; source: string; license?: string }[]
  >;
}

export interface AvatarProvider extends AiProvider {
  generateAvatar(prompt: string): Promise<{ url: string }>;
  lipSync?(avatarUrl: string, audioUrl: string): Promise<{ url: string }>;
}

// ---------------------------------------------------------------------------
// AI Planner — the "AI Director" contract. An AI implementation converts a
// natural-language request into a validated VideoPlan.
// ---------------------------------------------------------------------------
export interface VideoScene {
  id: string;
  duration: number;
  narration: string;
  visualQuery?: string;
  caption?: string;
}

export interface VideoPlan {
  title: string;
  format: "16:9" | "9:16" | "1:1" | "4:5";
  duration: number;
  scenes: VideoScene[];
  withVoice: boolean;
  withMusic: boolean;
  withAvatar: boolean;
  captionsEnabled: boolean;
}

export interface AiDirector {
  planVideo(prompt: string): Promise<VideoPlan>;
  providers: {
    script?: ScriptProvider;
    voice?: VoiceProvider;
    images?: ImageProvider;
    music?: MusicProvider;
    avatar?: AvatarProvider;
  };
}

// ---------------------------------------------------------------------------
// Command executor — the single mutation gateway
// ---------------------------------------------------------------------------
export type CommandExecutor = (command: EditorCommand) => void;

export interface EditorCommandApi {
  execute: CommandExecutor;
  onEvent: (handler: (event: EditorEvent) => void) => () => void;
  getProject: () => Project;
  isBusy: () => boolean;
}

/** Validate an AI plan before any command is issued. Returns errors. */
export function validateVideoPlan(plan: unknown): string[] {
  const errors: string[] = [];
  if (!plan || typeof plan !== "object") return ["plan is not an object"];
  const p = plan as Record<string, unknown>;
  if (!p.title || typeof p.title !== "string") errors.push("title is required");
  if (!["16:9", "9:16", "1:1", "4:5"].includes(p.format as string)) errors.push("format must be 16:9, 9:16, 1:1 or 4:5");
  if (typeof p.duration !== "number" || p.duration <= 0 || p.duration > 600) errors.push("duration must be 1-600s");
  if (!Array.isArray(p.scenes) || p.scenes.length === 0) errors.push("scenes must be a non-empty array");
  return errors;
}
