// types.ts - Complete type safety architecture for the video editor

export type ClipType = 'video' | 'audio' | 'image' | 'text' | 'avatar';

export interface TextConfig {
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  backgroundColor?: string;
  textAlign: 'left' | 'center' | 'right';
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  animation?: 'none' | 'fadeIn' | 'slideUp' | 'typewriter';
}

export interface Clip {
  id: string;
  name: string;
  type: ClipType;
  kind?: ClipType; // Stage-1 compatibility alias for 'type'
  url: string; // Object URL, blob URL, or API reference
  src?: string; // Stage-1 compatibility alias for url
  startTime: number; // Timeline position in seconds
  position?: number; // Stage-1 compatibility alias for startTime
  duration: number; // Visible duration in seconds
  trimStart: number; // Source trim offset in seconds
  trimEnd: number; // Source trim end in seconds
  start?: number; // Stage-1 compatibility alias for trimStart
  end?: number; // Stage-1 compatibility alias for trimEnd
  layer: number; // Z-index abstraction
  volume: number; // 0-1
  muted: boolean;
  playbackRate: number; // 0.25 - 4.0
  speed?: number; // Stage-1 compatibility alias for playbackRate
  textConfig?: TextConfig;
  text?: string; // Stage-1 compatibility for text clips
  caption?: string;
  font?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  textAlign?: string;
  background?: string;
  animation?: string;
  opacity?: number;
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  flipped?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  effects?: string[];
  fx?: Record<string, number>;
  transition?: string;
  crop?: { x: number; y: number; w: number; h: number };
  filters?: FilterSettings;
  transform?: {
    x: number;
    y: number;
    scaleX: number;
    scaleY: number;
    rotation: number;
    anchorX: number;
    anchorY: number;
  };
  sourceMetadata?: {
    originalDuration: number;
    originalWidth: number;
    originalHeight: number;
    fps: number;
    codec: string;
  };
}

export interface Track {
  id: string;
  name: string;
  type?: ClipType; // optional for Stage-1 compatibility; kind acts as alias
  kind?: ClipType; // Stage-1 compatibility alias for 'type'
  clips: Clip[];
  muted?: boolean;
  locked?: boolean;
  visible?: boolean;
  volume?: number; // Track-level volume
  height?: number; // UI height in pixels
  color?: string; // Track color for UI
}

export interface Project {
  id: string;
  name: string;
  createdAt?: number;
  updatedAt?: number;
  duration: number; // Total timeline duration in seconds
  fps: number;
  width: number;
  height: number;
  format?: '16:9' | '9:16' | '1:1' | '4:5'; // Stage-1 compatibility
  tracks: Track[];
  narration?: { text: string; voice?: string; audioUrl?: string }; // Stage-1 compatibility
  avatar?: string | AvatarPlan; // Stage-1 compatibility: avatar image URL or plan
  captionsEnabled?: boolean; // Stage-1 compatibility
  sfx?: unknown; // Stage-1 compatibility: SFX settings
  music?: unknown; // Stage-1 compatibility: music settings
  plan?: unknown; // Stage-1 compatibility: last AI plan
  settings?: {
    backgroundColor: string;
    defaultTransitionDuration: number;
    snapToGrid: boolean;
    gridSize: number;
  };
}

export interface ApiKeys {
  nvidiaNim: string;
  openCodeZen: string;
  elevenLabs: string;
  firecrawl: string;
  wawaLipSync: string;
  unsplash: string;
  pexels: string;
  pixabay: string;
  musicBrainz: string;
  deezer: string;
  freesound: string;
}

// Backwards-compatible alias for the Stage-1 editor routes
export type ProviderKeys = Partial<ApiKeys> & {
  opencodezen?: string;
  opencodezenModel?: string;
  opencodezenBase?: string;
  elevenlabs?: string;
  elevenlabsVoice?: string;
  elevenlabsModel?: string;
  nvidiaNim?: string;
  nvidiaNimModel?: string;
  nvidiaNimBase?: string;
  nvidiaAvatarModel?: string;
  nvidiaTextModel?: string;
  wav2lip?: string;
  wav2lipPath?: string;
  unsplash?: string;
  pexels?: string;
  pixabay?: string;
  firecrawl?: string;
  musicbrainz?: string;
  deezer?: string;
  freesound?: string;
};

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'waiting';

export interface AiTask {
  id: string;
  type: 'script' | 'tts' | 'avatar' | 'scrape' | 'search-media' | 'search-audio' | 'lip-sync' | 'composite' | 'source' | 'plan' | 'music' | 'sfx' | 'presentation' | 'image' | 'caption' | 'voice';
  status: TaskStatus;
  name?: string;
  progress: number; // 0-100
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  detail?: string;
  result?: unknown;
  createdAt?: number;
  updatedAt?: number;
  dependsOn?: string[]; // Task IDs this task depends on
}

export interface SearchResult {
  id: string;
  source: 'unsplash' | 'pexels' | 'pixabay' | 'deezer' | 'freesound' | 'musicbrainz';
  type: 'image' | 'video' | 'audio';
  url: string;
  thumbnailUrl: string;
  title: string;
  author?: string;
  license: string;
  duration?: number; // For audio/video
  width?: number;
  height?: number;
  tags?: string[];
}

export interface VideoExportConfig {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  codec: 'vp9' | 'h264' | 'av1';
  container: 'webm' | 'mp4';
  quality: 'low' | 'medium' | 'high' | 'lossless';
}

export interface TimelineState {
  currentTime: number;
  isPlaying: boolean;
  duration: number;
  zoom: number; // Pixels per second
  scrollX: number;
  selectedClipIds: string[];
  playbackRate: number;
  loopEnabled: boolean;
  inPoint: number;
  outPoint: number;
}

export interface EditorSettings {
  theme: 'dark' | 'light';
  autoSave: boolean;
  autoSaveInterval: number; // milliseconds
  hardwareAcceleration: boolean;
  proxyResolution: 'none' | '720p' | '480p' | '360p';
  showWaveforms: boolean;
  showTimecodes: boolean;
  magneticTimeline: boolean;
  rippleEdit: boolean;
}

export interface AudioNodeConfig {
  id: string;
  type: 'gain' | 'biquad' | 'dynamics' | 'delay' | 'reverb' | 'analyser';
  params: Record<string, number>;
  connections: string[]; // Node IDs this connects to
}

export interface VideoFrameData {
  timestamp: number;
  width: number;
  height: number;
  format: 'rgba' | 'yuv420p' | 'rgb24';
  data: ArrayBuffer;
}

export interface WorkerMessage {
  type: 'INIT' | 'UPDATE_STATE' | 'DECODE_FRAME' | 'RENDER_FRAME' | 'EXPORT_START' | 'EXPORT_PROGRESS' | 'EXPORT_COMPLETE' | 'ERROR';
  payload: unknown;
  requestId?: string;
}

export interface RenderWorkerState {
  canvas: OffscreenCanvas | null;
  gl: WebGL2RenderingContext | null;
  videoDecoder: VideoDecoder | null;
  frameCache: Map<string, VideoFrame>;
  currentProject: Project | null;
  timelineState: TimelineState;
  isRendering: boolean;
}

export interface CloudAiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  usage?: {
    tokens?: number;
    credits?: number;
    cost?: number;
  };
}

export interface PresentationSlide {
  id: string;
  title: string;
  content: string;
  layout: 'title' | 'content' | 'two-column' | 'image-text' | 'quote' | 'code';
  backgroundImage?: string;
  backgroundColor?: string;
  notes?: string;
  duration: number;
  animations?: SlideAnimation[];
}

export interface SlideAnimation {
  elementId: string;
  type: 'fade' | 'slide' | 'zoom' | 'typewriter';
  delay: number;
  duration: number;
  easing: string;
}

export interface LipSyncData {
  phonemes: PhonemeFrame[];
  duration: number;
  audioUrl: string;
}

export interface PhonemeFrame {
  time: number;
  phoneme: string;
  mouthShape: Record<string, number>; // Blendshape weights
  intensity: number;
}

export type EditorAction =
  | { type: 'ADD_TRACK'; payload: { track: Track } }
  | { type: 'REMOVE_TRACK'; payload: { trackId: string } }
  | { type: 'ADD_CLIP'; payload: { trackId: string; clip: Clip } }
  | { type: 'REMOVE_CLIP'; payload: { trackId: string; clipId: string } }
  | { type: 'UPDATE_CLIP'; payload: { trackId: string; clipId: string; changes: Partial<Clip> } }
  | { type: 'MOVE_CLIP'; payload: { trackId: string; clipId: string; newStartTime: number; newTrackId?: string } }
  | { type: 'TRIM_CLIP'; payload: { trackId: string; clipId: string; trimStart: number; trimEnd: number } }
  | { type: 'SET_CURRENT_TIME'; payload: { time: number } }
  | { type: 'SET_PLAYING'; payload: { isPlaying: boolean } }
  | { type: 'SET_ZOOM'; payload: { zoom: number } }
  | { type: 'SET_SCROLL_X'; payload: { scrollX: number } }
  | { type: 'SELECT_CLIPS'; payload: { clipIds: string[] } }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SET_PROJECT'; payload: { project: Project } }
  | { type: 'ADD_AI_TASK'; payload: { task: AiTask } }
  | { type: 'UPDATE_AI_TASK'; payload: { taskId: string; changes: Partial<AiTask> } }
  | { type: 'REMOVE_AI_TASK'; payload: { taskId: string } };

// ===========================================================================
// Stage-1 editor compatibility types (used by /editor, /create, /studio,
// /settings routes from the earlier build phase)
// ===========================================================================

export type ClipKind = 'video' | 'image' | 'audio' | 'text' | 'avatar';

export interface TextClipConfig {
  content: string;
  font: string;
  size: number;
  weight: number;
  color: string;
  background?: string;
  align?: 'left' | 'center' | 'right';
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  animation?: 'none' | 'fade' | 'slide-in' | 'zoom';
}

export interface FilterSettings {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
  hueRotate?: number; // Stage-1 compatibility
  grayscale?: boolean;
  sepia?: boolean;
  invert?: boolean;
  vignette?: boolean;
}

export interface VideoPlan {
  objective: string;
  duration: number;
  format: '16:9' | '9:16' | '1:1' | '4:5';
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
  visual: { type: 'image' | 'video' | 'slide'; query: string; url?: string };
  caption?: string;
  onScreenText?: string;
}
export interface AudioPlan { provider: string; voice?: string; url?: string; }
export interface VisualPlan { type: 'image' | 'video' | 'slide'; query: string; url?: string; count?: number; }
export interface MusicPlan { provider: string; url?: string; license?: string; query?: string; }
export interface CaptionPlan { enabled: boolean; style: string; }
export interface AvatarPlan { enabled?: boolean; provider?: string; prompt?: string; lipSync?: boolean; }
export interface PresentationPlan { enabled?: boolean; slides: number; theme: string; }

export type ScriptStyle = 'educational' | 'fast_youtube' | 'documentary' | 'research' | 'explainer' | 'news';
export type AiTaskType = AiTask['type'];

// Stage-1 provider result types
export interface AssetMeta { id: string; name: string; type: 'video' | 'image' | 'audio'; duration: number; thumb?: string; addedAt: number; }
export interface ImageResult { url: string; preview?: string; alt?: string; author?: string; source: string; license?: string; width?: number; height?: number; [key: string]: unknown; }
export interface AudioResult { url: string; title: string; artist?: string; source: string; license?: string; duration?: number; }
export interface MusicResult { title: string; artist: string; preview?: string; source: string; license?: string; duration?: number; }
export interface ScriptResult { script: string; provider: string; }
export interface ScriptRequest { topic: string; style: string; outline?: string[]; }
export interface ImageSearchInput { query: string; orientation?: string; page?: number; limit?: number; }
export interface AudioSearchInput { query: string; duration?: string; type?: string; mood?: string; }
export interface PresentationResult { marp: string; html?: string; }
export interface AvatarResult { url: string; provider: string; }
export interface AudioOutputResult { url: string; mimeType: string; duration: number; }

export interface AiPlan {
  objective: string;
  duration: number;
  format: '16:9' | '9:16' | '1:1' | '4:5';
  script: string;
  scenes: string[];
  narration: { provider: string };
  visuals: { query: string; count: number }[];
  music: { query: string };
  captions: { enabled: boolean };
  avatar?: { enabled: boolean };
  presentation?: { enabled: boolean };
}