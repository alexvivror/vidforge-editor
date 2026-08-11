// ---------- Core types for VidForge Editor ----------

export type ProviderKeys = {
  opencodezen: string;
  opencodezenModel: string;
  opencodezenBase: string;
  elevenlabs: string;
  elevenlabsVoice: string;
  elevenlabsModel: string;
  nvidiaNim: string;
  nvidiaNimBase: string;
  nvidiaTextModel: string;
  nvidiaAvatarModel: string;
  unsplash: string;
  pexels: string;
  pixabay: string;
  firecrawl: string;
  musicbrainz: string;
  deezer: string;
  freesound: string;
  wav2lipPath: string;
};

export type ClipKind = "video" | "image" | "slide" | "audio" | "text";

export interface FilterSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  grayscale: boolean;
  sharpen: number;
  vignette: number;
}

export interface Clip {
  id: string;
  kind: ClipKind;
  name: string;
  src?: string;        // media URL / object URL
  start: number;       // source in-time (seconds)
  end: number;         // source out-time
  position: number;    // timeline position (seconds)
  duration: number;    // effective duration
  x: number;           // canvas transform (0-100 % of canvas)
  y: number;
  scale: number;       // 0.1 - 3
  rotation: number;    // degrees
  opacity: number;     // 0-1
  speed: number;       // playback speed
  volume: number;      // 0-1
  muted: boolean;
  fadeIn: number;      // seconds
  fadeOut: number;
  flipped: boolean;
  effects: string[];   // effect ids
  fx?: Record<string, number>;  // slider effects (brightness, contrast, ...)
  transition?: string;  // none | Fade | Crossfade | Slide | Zoom | Wipe
  crop?: { x: number; y: number; w: number; h: number };
  filters: FilterSettings;
  caption?: string;
  text?: string;       // for text clips
  font?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  textAlign?: string;
  background?: string;
  animation?: string;  // none | fade | slide-in | zoom
}

export interface Track {
  id: string;
  name: string;
  kind: "video" | "audio" | "text";
  clips: Clip[];
}

export interface AssetMeta {
  id: string;          // object URL
  name: string;
  type: "video" | "image" | "audio";
  duration: number;
  thumb?: string;
  addedAt: number;
}

export interface Project {
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  format: "16:9" | "9:16" | "1:1" | "4:5";
  tracks: Track[];
  narration: { text: string; voice?: string; audioUrl?: string };
  sfx: { enabled: boolean; whoosh: boolean; pop: boolean };
  music: { enabled: boolean; url?: string; volume: number };
  avatar: { enabled: boolean; provider: string; prompt?: string; imageUrl?: string };
  captionsEnabled?: boolean;
  aiPlan?: AiPlan;
  updatedAt: number;
}

export type TaskStatus = "waiting" | "running" | "completed" | "failed";

export type AiTaskType =
  | "script" | "image" | "video" | "voice" | "avatar"
  | "lipsync" | "presentation" | "music" | "sfx" | "source" | "plan";

export interface AiTask {
  id: string;
  type: AiTaskType;
  name: string;
  status: TaskStatus;
  progress: number;
  detail?: string;
  result?: unknown;
}

export interface AiPlan {
  objective: string;
  duration: number;
  format: "16:9" | "9:16" | "1:1" | "4:5";
  script: string;
  scenes: string[];
  narration: { provider: string };
  visuals: { query: string; count: number }[];
  music: { query: string };
  captions: { enabled: boolean };
  avatar?: { enabled: boolean };
  presentation?: { enabled: boolean };
}

export interface VideoPlan {
  objective: string;
  duration: number;
  format: "16:9" | "9:16" | "1:1" | "4:5";
  language?: string;
  script: ScriptPlan;
  scenes: ScenePlan[];
  narration: AudioPlan;
  visuals: VisualPlan[];
  music: MusicPlan;
  captions: CaptionPlan;
  avatar?: AvatarPlan;
  presentation?: PresentationPlan;
}

export interface ScriptPlan { text: string; style: string; provider: string; }
export interface ScenePlan {
  id: string;
  duration: number;
  narration: string;
  visual: { type: "image" | "video" | "slide"; query: string; url?: string };
  caption?: string;
  onScreenText?: string;
}
export interface AudioPlan { provider: string; voice?: string; url?: string; }
export interface VisualPlan { type: "image" | "video" | "slide"; query: string; url?: string; count?: number; }
export interface MusicPlan { provider: string; url?: string; license?: string; query?: string; }
export interface CaptionPlan { enabled: boolean; style: string; }
export interface AvatarPlan { enabled?: boolean; provider: string; prompt: string; lipSync: boolean; }
export interface PresentationPlan { enabled?: boolean; slides: number; theme: string; }

export type ScriptStyle = "educational" | "fast_youtube" | "documentary" | "research" | "explainer" | "news";

export interface ScriptRequest {
  topic: string;
  style: ScriptStyle;
  outline?: string[];
}

export interface ImageResult {
  url: string;
  alt: string;
  source: string;
}

export interface AudioResult {
  provider: string;
  audioUrl?: string;
  note: string;
}

export interface MusicResult {
  title: string;
  artist: string;
  preview?: string;
  source: string;
  license?: string;
}
