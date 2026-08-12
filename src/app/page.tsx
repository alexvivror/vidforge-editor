"use client";

// app/page.tsx — Main dashboard: API registration header, AI workspace sidebar,
// WebGL viewport canvas, multi-track timeline with playhead, MediaRecorder export.

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore, usePlayhead, defaultProject } from "@/stores/useEditorStore";
import { CloudAiService } from "@/services/CloudAiService";
import type { ApiKeys, Clip, Track as TrackType, SearchResult, PresentationSlide } from "@/types";

// ---------------------------------------------------------------------------
// API key registration controls (10 providers)
// ---------------------------------------------------------------------------
const PROVIDER_FIELDS: { key: keyof ApiKeys; label: string; placeholder: string; hint: string }[] = [
  { key: "nvidiaNim", label: "NVIDIA NIM", placeholder: "nvapi-…", hint: "Script, avatar & vision generation" },
  { key: "openCodeZen", label: "OpenCode Zen", placeholder: "sk-zen-…", hint: "MARp layout & orchestration" },
  { key: "elevenLabs", label: "ElevenLabs", placeholder: "eleven-…", hint: "Narration TTS" },
  { key: "firecrawl", label: "Firecrawl", placeholder: "fc-…", hint: "Research URL scraping" },
  { key: "wawaLipSync", label: "WAWA LipSync", placeholder: "https://endpoint", hint: "Avatar animation (endpoint URL)" },
  { key: "unsplash", label: "Unsplash", placeholder: "Client-ID", hint: "Image search" },
  { key: "pexels", label: "Pexels", placeholder: "Pexels key", hint: "Image & video search" },
  { key: "pixabay", label: "Pixabay", placeholder: "Pixabay key", hint: "Image search" },
  { key: "deezer", label: "Deezer", placeholder: "Deezer key", hint: "Music preview streams" },
  { key: "freesound", label: "Freesound", placeholder: "Freesound token", hint: "SFX & ambience" },
];

function ApiKeySection() {
  const keys = useEditorStore((s) => s.keys);
  const setApiKey = useEditorStore((s) => s.setApiKey);
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);

  return (
    <section className="api-section" aria-label="API registration">
      <div className="api-header">
        <div className="api-title">
          <span className="dot dot-red" /> <span className="dot dot-yellow" /> <span className="dot dot-green" />
          <strong>API Registration</strong>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="key-count">{PROVIDER_FIELDS.filter((p) => keys[p.key]).length}/10 configured</span>
          <button className="btn btn-sm btn-ghost" onClick={() => setOpen(!open)}>
            {open ? "Hide keys" : "Configure keys"}
          </button>
        </div>
      </div>
      {open && (
        <div className="api-grid">
          {PROVIDER_FIELDS.map((p) => (
            <div className="field" key={p.key}>
              <label>{p.label}</label>
              <input
                className="input"
                type={show ? "text" : "password"}
                value={keys[p.key]}
                placeholder={p.placeholder}
                onChange={(e) => setApiKey(p.key, e.target.value)}
                autoComplete="off"
              />
              <span className="hint">{p.hint}</span>
            </div>
          ))}
          <label className="checkbox-row" style={{ gridColumn: "1 / -1" }}>
            <input type="checkbox" checked={show} onChange={() => setShow(!show)} /> Show keys
          </label>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// AI Workspace sidebar
// ---------------------------------------------------------------------------
function AiWorkspaceSidebar({ service }: { service: React.MutableRefObject<CloudAiService | null> }) {
  const [prompt, setPrompt] = useState("Create a 60-second educational Reel explaining how photosynthesis works.");
  const [url, setUrl] = useState("https://en.wikipedia.org/wiki/Photosynthesis");
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const aiTasks = useEditorStore((s) => s.aiTasks);
  const addAiTask = useEditorStore((s) => s.addAiTask);
  const updateAiTask = useEditorStore((s) => s.updateAiTask);
  const project = useEditorStore((s) => s.project);
  const addClipToTrack = useEditorStore((s) => s.addClipToTrack);
  const [mediaResults, setMediaResults] = useState<SearchResult[]>([]);

  const appendLog = (line: string) => setLog((l) => [...l.slice(-30), `[${new Date().toLocaleTimeString()}] ${line}`]);

  const runPipeline = async () => {
    if (!service.current || running) return;
    setRunning(true);
    setMediaResults([]);
    appendLog("Starting production pipeline…");
    try {
      const result = await service.current.fullProductionPipeline(prompt, {
        targetUrl: url || undefined,
        duration: 60,
        style: "educational",
        withAvatar: true,
        withMusic: true,
        onTask: (task) => {
          addAiTask({ id: task.id, type: task.type, input: task.input, dependsOn: task.dependsOn, name: task.type } as never);
        },
      });
      // sync live task states into the store
      result.tasks.forEach((t) => {
        updateAiTask(t.id, { status: t.status, progress: t.progress, output: t.output, error: t.error });
      });
      appendLog(`Script: ${result.script.length} chars, ${result.slides.length} slides`);
      setMediaResults(result.media);

      // Auto-place generated script as a text clip on the Text track
      const textTrack = project.tracks.find((t) => t.type === "text");
      if (textTrack && result.script) {
        addClipToTrack(textTrack.id, {
          type: "text",
          name: "AI Script",
          url: "",
          startTime: 0,
          duration: Math.max(5, result.script.length / 14),
          textConfig: {
            content: result.script.slice(0, 500),
            fontFamily: "Inter, sans-serif",
            fontSize: 48,
            fontWeight: 700,
            color: "#ffffff",
            backgroundColor: "rgba(0,0,0,0.6)",
            textAlign: "center",
            x: 0,
            y: -20,
            rotation: 0,
            opacity: 1,
            animation: "fadeIn",
          },
        });
        appendLog("Added AI script as text clip");
      }

      // Place avatar as an overlay clip
      const overlayTrack = project.tracks.find((t) => t.type === "image");
      if (overlayTrack && result.avatarUrl) {
        addClipToTrack(overlayTrack.id, {
          type: "avatar",
          name: "AI Avatar",
          url: result.avatarUrl,
          startTime: 0.5,
          duration: 20,
          layer: 10,
          transform: { x: 80, y: 60, scaleX: 0.35, scaleY: 0.35, rotation: 0, anchorX: 0.5, anchorY: 0.5 },
        });
        appendLog("Added AI avatar as overlay clip");
      }

      // Place first media result as video clip
      const videoTrack = project.tracks.find((t) => t.type === "video");
      if (videoTrack && result.media[0]?.url) {
        addClipToTrack(videoTrack.id, {
          type: "image",
          name: result.media[0].title.slice(0, 30),
          url: result.media[0].url,
          startTime: 1,
          duration: 8,
        });
        appendLog(`Added media: ${result.media[0].title.slice(0, 40)}`);
      }

      appendLog(`Production complete: ${result.tasks.filter((t) => t.status === "completed").length}/${result.tasks.length} tasks done`);
    } catch (e) {
      appendLog(`ERROR: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <aside className="ai-sidebar" aria-label="AI workspace">
      <div className="sidebar-title">AI Workspace</div>

      <div className="field">
        <label>Prompt</label>
        <textarea
          className="textarea"
          rows={4}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the video you want to create…"
        />
      </div>

      <div className="field">
        <label>Research URL (optional)</label>
        <input className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
      </div>

      <button className="btn btn-accent" style={{ width: "100%" }} onClick={runPipeline} disabled={running}>
        {running ? "⏳ Producing…" : "🚀 Run AI Production"}
      </button>

      <div className="task-panel">
        <div className="sidebar-title" style={{ fontSize: 12 }}>Tasks</div>
        {aiTasks.length === 0 && <p className="hint">Run the pipeline to generate a production plan.</p>}
        {aiTasks.map((t) => (
          <div className={`task-chip ${t.status}`} key={t.id}>
            <span className="task-dot" />
            <span style={{ flex: 1 }}>{t.type}</span>
            <span style={{ fontSize: 10 }}>{t.status}</span>
          </div>
        ))}
      </div>

      {mediaResults.length > 0 && (
        <div className="media-gallery">
          <div className="sidebar-title" style={{ fontSize: 12 }}>Media Library</div>
          <div className="media-grid">
            {mediaResults.slice(0, 6).map((m) => (
              <div className="media-card" key={m.id} title={`${m.title}\n${m.license}`}>
                {m.thumbnailUrl ? (
                  <img src={m.thumbnailUrl} alt={m.title} loading="lazy" />
                ) : (
                  <div className="media-placeholder">{m.type === "audio" ? "♪" : "🖼"}</div>
                )}
                <div className="media-meta">
                  <span style={{ fontSize: 10 }}>{m.source}</span>
                  <span style={{ fontSize: 9, color: "var(--text-dim)" }}>{m.license.slice(0, 24)}…</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="task-log">
        <div className="sidebar-title" style={{ fontSize: 12 }}>Log</div>
        {log.map((l, i) => (
          <div className={`log-line ${l.startsWith("ERROR") ? "error" : ""}`} key={i}>{l}</div>
        ))}
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// WebGL Viewport Canvas (OffscreenCanvas in worker)
// ---------------------------------------------------------------------------
function ViewportCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const [glReady, setGlReady] = useState(false);
  const [glError, setGlError] = useState("");
  const currentTime = usePlayhead((s) => s.currentTime);
  const isPlaying = usePlayhead((s) => s.isPlaying);
  const toggle = usePlayhead((s) => s.toggle);
  const seek = usePlayhead((s) => s.seek);
  const project = useEditorStore((s) => s.project);
  const duration = Math.max(10, ...project.tracks.flatMap((t) => t.clips.map((c) => c.startTime + c.duration)));

  // Init worker + OffscreenCanvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const offscreen = canvas.transferControlToOffscreen();
    const worker = new Worker(new URL("@/workers/renderWorker.worker", import.meta.url));
    workerRef.current = worker;
    worker.onmessage = (e) => {
      const msg = e.data as { type: string; payload?: { message?: string } };
      if (msg.type === "READY") setGlReady(true);
      if (msg.type === "ERROR") setGlError(msg.payload?.message || "Worker error");
    };
    worker.postMessage({ type: "INIT", payload: { canvas: offscreen, width: canvas.width, height: canvas.height } }, [offscreen]);
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // Push project state to worker on change
  useEffect(() => {
    if (!workerRef.current || !glReady) return;
    const clips = project.tracks
      .filter((t) => t.visible)
      .flatMap((t) => t.clips)
      .filter((c) => c.type !== "audio" && c.type !== "text")
      .map((c) => ({
        id: c.id,
        url: c.url,
        startTime: c.startTime,
        duration: c.duration,
        trimStart: c.trimStart,
        trimEnd: c.trimEnd,
        layer: c.layer,
        type: c.type,
        transform: c.transform,
        opacity: 1,
        filters: c.filters,
      }));
    workerRef.current.postMessage({
      type: "UPDATE_STATE",
      payload: { clips, width: project.width, height: project.height, fps: project.fps, backgroundColor: project.settings?.backgroundColor || "#09090b", currentTime },
    });
  }, [project, glReady, currentTime]);

  // Playback ticks
  useEffect(() => {
    if (!isPlaying || !workerRef.current) return;
    workerRef.current.postMessage({ type: "SET_PLAYBACK", payload: { playing: true } });
    const interval = setInterval(() => {
      usePlayhead.getState().seek(usePlayhead.getState().currentTime + 1 / 30);
    }, 1000 / 30);
    return () => {
      clearInterval(interval);
      workerRef.current?.postMessage({ type: "SET_PLAYBACK", payload: { playing: false } });
    };
  }, [isPlaying]);

  // Render frame on time change
  useEffect(() => {
    if (!workerRef.current || !glReady || isPlaying) return;
    workerRef.current.postMessage({ type: "RENDER_FRAME", payload: { time: currentTime } });
  }, [currentTime, glReady, isPlaying]);

  // Seek bar
  const onSeekBar = (e: React.ChangeEvent<HTMLInputElement>) => seek(+e.target.value);

  return (
    <div className="viewport">
      <div className="viewport-toolbar">
        <span className="viewport-title">Preview</span>
        <span className="view-badge">{glReady ? "WebGL2 · Worker" : glError ? "Fallback" : "Starting…"}</span>
      </div>
      <div className="canvas-holder">
        <canvas ref={canvasRef} width={1920} height={1080} className={`gl-canvas ${isPlaying ? "playing" : ""}`} />
        {!glReady && !glError && <div className="canvas-overlay">⚙️ Initializing GPU renderer…</div>}
        {glError && (
          <div className="canvas-overlay error">
            <div>⚠️ {glError}</div>
            <button className="btn btn-sm btn-primary" onClick={() => window.location.reload()}>Retry</button>
          </div>
        )}
        <div className="timecode">
          {new Date(currentTime * 1000).toISOString().substring(11, 23)} / {new Date(duration * 1000).toISOString().substring(11, 23)}
        </div>
      </div>
      <div className="playback-controls">
        <button className="btn btn-sm btn-primary" onClick={toggle} aria-label={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? "⏸" : "▶"}
        </button>
        <button className="btn btn-sm btn-ghost" onClick={() => seek(Math.max(0, currentTime - 1 / project.fps))} aria-label="Previous frame">⏮</button>
        <button className="btn btn-sm btn-ghost" onClick={() => seek(Math.min(duration, currentTime + 1 / project.fps))} aria-label="Next frame">⏭</button>
        <input
          type="range"
          className="seek-range"
          min={0}
          max={duration}
          step={0.01}
          value={Math.min(currentTime, duration)}
          onChange={onSeekBar}
          aria-label="Seek"
        />
        <span className="fps-badge">{project.fps} FPS</span>
        <span className="res-badge">{project.width}×{project.height}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multi-track timeline with red playhead
// ---------------------------------------------------------------------------
function EditorTimeline() {
  const project = useEditorStore((s) => s.project);
  const currentTime = usePlayhead((s) => s.currentTime);
  const seek = usePlayhead((s) => s.seek);
  const isPlaying = usePlayhead((s) => s.isPlaying);
  const toggle = usePlayhead((s) => s.toggle);
  const selectedClipIds = useEditorStore((s) => s.selectedClipIds);
  const setSelectedClipIds = useEditorStore((s) => s.setSelectedClipIds);
  const updateClip = useEditorStore((s) => s.updateClip);
  const removeClip = useEditorStore((s) => s.removeClip);
  const duplicateClip = useEditorStore((s) => s.duplicateClip);
  const trimClip = useEditorStore((s) => s.trimClip);
  const moveClip = useEditorStore((s) => s.moveClip);
  const toggleTrackMuted = useEditorStore((s) => s.toggleTrackMuted);
  const toggleTrackLocked = useEditorStore((s) => s.toggleTrackLocked);
  const toggleTrackVisible = useEditorStore((s) => s.toggleTrackVisible);
  const [zoom, setZoom] = useState(40);
  const duration = Math.max(10, ...project.tracks.flatMap((t) => t.clips.map((c) => c.startTime + c.duration)));
  const [dragState, setDragState] = useState<{ clipId: string; trackId: string; grabOffset: number; mode: "move" | "trim-l" | "trim-r"; origTrimStart?: number; origTrimEnd?: number } | null>(null);

  const onClipPointerDown = (e: React.PointerEvent, clip: Clip, track: TrackType) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedClipIds([clip.id]);
    setDragState({ clipId: clip.id, trackId: track.id, grabOffset: e.clientX / zoom - clip.startTime, mode: "move", origTrimStart: clip.trimStart, origTrimEnd: clip.trimEnd });
  };

  const onTrimPointerDown = (e: React.PointerEvent, clip: Clip, track: TrackType, mode: "trim-l" | "trim-r") => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedClipIds([clip.id]);
    setDragState({ clipId: clip.id, trackId: track.id, grabOffset: 0, mode, origTrimStart: clip.trimStart, origTrimEnd: clip.trimEnd });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState) return;
    const sec = e.clientX / zoom;
    const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === dragState.clipId);
    if (!clip) return;
    if (dragState.mode === "move") {
      moveClip(clip.id, Math.max(0, sec - dragState.grabOffset));
    } else if (dragState.mode === "trim-l") {
      const newTrim = Math.max(0, Math.min(sec - clip.startTime, clip.trimEnd - 0.1));
      trimClip(clip.id, newTrim, clip.trimEnd);
    } else if (dragState.mode === "trim-r") {
      const newTrim = Math.max(clip.trimStart, clip.trimStart + (sec - clip.startTime));
      trimClip(clip.id, clip.trimStart, newTrim);
    }
  };

  const onPointerUp = () => setDragState(null);

  const onTimelineClick = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    seek(Math.max(0, (e.clientX - rect.left) / zoom));
  };

  const durationPx = duration * zoom;

  return (
    <div className="timeline-section">
      <div className="timeline-header">
        <span className="timeline-title">Timeline</span>
        <button className="btn btn-sm btn-ghost" onClick={() => toggle()}>{isPlaying ? "Pause" : "Play"}</button>
        <button className="btn btn-sm btn-ghost" onClick={() => setZoom((z) => Math.max(10, z / 1.5))}>−</button>
        <span className="zoom-label">{zoom}px/s</span>
        <button className="btn btn-sm btn-ghost" onClick={() => setZoom((z) => Math.min(150, z * 1.5))}>+</button>
      </div>

      <div className="timeline-scroll">
        <div className="ruler" style={{ width: durationPx }}>
          {Array.from({ length: Math.ceil(duration) + 1 }).map((_, i) => (
            <div className="ruler-mark" key={i} style={{ left: i * zoom }}>
              <span className="ruler-line" />
              <span className="ruler-label">{i == 0 ? "0.0" : `${i}s`}</span>
            </div>
          ))}
        </div>

        <div className="timeline-body" onClick={onTimelineClick} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
          <div className="track-columns">
            {project.tracks.map((track) => (
              <div className="track-header-row" key={track.id}>
                <div className="track-cell">
                  <span className="track-color" style={{ background: track.color }} />
                  <span className="track-name" title={track.name}>{track.name}</span>
                  <div className="track-toggles">
                    <button className={`toggle ${track.muted ? "off" : ""}`} title="Mute" onClick={() => toggleTrackMuted(track.id)}>♪</button>
                    <button className={`toggle ${track.locked ? "off" : ""}`} title="Lock" onClick={() => toggleTrackLocked(track.id)}>🔒</button>
                    <button className={`toggle ${track.visible ? "" : "off"}`} title="Visible" onClick={() => toggleTrackVisible(track.id)}>👁</button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="track-lanes" style={{ position: "relative" }}>
            {project.tracks.map((track) => (
              <div className="track-lane" key={track.id} style={{ height: track.height || 72 }}>
                {track.clips.map((clip) => (
                  <div
                    className={`clip-block ${selectedClipIds.includes(clip.id) ? "selected" : ""} ${dragState?.clipId === clip.id ? "dragging" : ""}`}
                    key={clip.id}
                    style={{
                      left: clip.startTime * zoom,
                      width: Math.max(4, clip.duration * zoom),
                      top: 4,
                      height: Math.max(24, (track.height || 72) - 8),
                      background: `${track.color || "#64748b"}33`,
                      borderColor: track.color || "#64748b",
                    }}
                    onPointerDown={(e) => onClipPointerDown(e, clip, track)}
                    title={`${clip.name} · ${clip.startTime.toFixed(1)}s → ${(clip.startTime + clip.duration).toFixed(1)}s`}
                  >
                    <div className="clip-inner">
                      <span className="clip-name">{clip.type === "audio" ? "♪ " : clip.type === "text" ? "T " : "🎬 "}{clip.name}</span>
                      <span className="clip-time">{clip.startTime.toFixed(1)}s</span>
                      <div className="clip-actions">
                        <button onClick={(e) => { e.stopPropagation(); duplicateClip(clip.id); }} title="Duplicate">⧉</button>
                        <button onClick={(e) => { e.stopPropagation(); removeClip(clip.id); }} title="Delete">🗑</button>
                      </div>
                    </div>
                    <div className="trim-handle trim-left" onPointerDown={(e) => onTrimPointerDown(e, clip, track, "trim-l")} title="Trim start" />
                    <div className="trim-handle trim-right" onPointerDown={(e) => onTrimPointerDown(e, clip, track, "trim-r")} title="Trim end" />
                  </div>
                ))}
                {track.clips.length === 0 && <div className="lane-empty">Drop clips here</div>}
              </div>
            ))}
            <div className="playhead" style={{ left: currentTime * zoom }} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page assembly
// ---------------------------------------------------------------------------
export default function HomePage() {
  const project = useEditorStore((s) => s.project);
  const setProject = useEditorStore((s) => s.setProject);
  const newProject = useEditorStore((s) => s.newProject);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const saveState = useEditorStore((s) => s.saveState);
  const markSaved = useEditorStore((s) => s.markSaved);
  const serviceRef = useRef<CloudAiService | null>(null);
  const [exportState, setExportState] = useState<{ pct: number; url?: string } | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const exportChunksRef = useRef<Blob[]>([]);
  const keys = useEditorStore((s) => s.keys);

  // Keep the AI service in sync with keys
  useEffect(() => {
    if (!serviceRef.current) serviceRef.current = new CloudAiService(keys);
    else serviceRef.current.updateKeys(keys);
  }, [keys]);

  // Autosave to IndexedDB
  useEffect(() => {
    const save = async () => {
      const proj = useEditorStore.getState().getSerializableProject();
      try {
        const db = await openDB();
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction("projects", "readwrite");
          tx.objectStore("projects").put(proj);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        markSaved();
      } catch { /* storage unavailable */ }
    };
    const interval = setInterval(() => {
      if (useEditorStore.getState().saveState === "dirty") void save();
    }, 1500);
    return () => clearInterval(interval);
  }, [markSaved]);

  // MediaRecorder export
  const startExport = async () => {
    const canvas = document.querySelector<HTMLCanvasElement>(".gl-canvas");
    if (!canvas) return;
    const stream = canvas.captureStream(project.fps);
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
    mediaRecorderRef.current = recorder;
    exportChunksRef.current = [];
    recorder.ondataavailable = (e) => { if (e.data.size) exportChunksRef.current.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(exportChunksRef.current, { type: mime });
      const url = URL.createObjectURL(blob);
      setExportState({ pct: 100, url });
    };
    recorder.onerror = () => setExportState({ pct: -1 });
    usePlayhead.getState().seek(0);
    usePlayhead.getState().play();
    recorder.start(250);
    // record for project duration, then stop
    const dur = Math.max(10, ...project.tracks.flatMap((t) => t.clips.map((c) => c.startTime + c.duration)));
    setTimeout(() => {
      usePlayhead.getState().pause();
      recorder.stop();
    }, dur * 1000);
    setExportState({ pct: 10 });
    const interval = setInterval(() => {
      setExportState((s) => {
        if (!s || s.pct >= 90) { clearInterval(interval); return s; }
        return { ...s, pct: s.pct + 5 };
      });
    }, dur * 1000 / 18);
  };

  const downloadExport = () => {
    if (exportState?.url) {
      const a = document.createElement("a");
      a.href = exportState.url;
      a.download = `${project.name || "video"}.webm`;
      a.click();
    }
  };

  return (
    <div className="dashboard">
      <header className="topbar">
        <div className="brand">
          <span className="brand-logo">◆</span>
          <span className="brand-name">VidForge Editor</span>
          <span className="brand-badge">WebCodecs · WebGL · AI</span>
        </div>
        <nav className="topnav">
          <button className="btn btn-sm btn-ghost" onClick={() => undo()} disabled={!useEditorStore.getState().canUndo()}>↩ Undo</button>
          <button className="btn btn-sm btn-ghost" onClick={() => redo()} disabled={!useEditorStore.getState().canRedo()}>↪ Redo</button>
          <span className={`save-state ${saveState}`}>
            {saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved" : "Saved"}
          </span>
          <button className="btn btn-sm btn-ghost" onClick={() => newProject()}>New</button>
          <button className="btn btn-sm btn-accent" onClick={startExport} disabled={!!exportState && exportState.pct > 0 && exportState.pct < 100}>
            {exportState && exportState.pct > 0 && exportState.pct < 100 ? `Exporting ${Math.round(exportState.pct)}%` : "⬇ Export"}
          </button>
        </nav>
      </header>

      <div className="workspace-grid">
        <AiWorkspaceSidebar service={serviceRef} />
        <main className="main-column">
          <ApiKeySection />
          <ViewportCanvas />
          <EditorTimeline />
        </main>
      </div>

      {exportState?.pct === 100 && (
        <div className="export-modal">
          <div className="modal-card">
            <h3>Export Complete</h3>
            <p className="hint">Your video was rendered in the browser via MediaRecorder.</p>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn btn-accent" onClick={downloadExport}>💾 Save Video</button>
              <button className="btn btn-ghost" onClick={() => setExportState(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// IndexedDB helper for projects
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("vidforge-projects", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("assets")) db.createObjectStore("assets", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}