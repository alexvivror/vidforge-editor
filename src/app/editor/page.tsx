"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Topbar from "@/components/Topbar";
import Timeline from "@/components/timeline/Timeline";
import MediaPanel from "@/components/editor/MediaPanel";
import TextPanel from "@/components/editor/TextPanel";
import EffectsPanel from "@/components/editor/EffectsPanel";
import TransitionsPanel from "@/components/editor/TransitionsPanel";
import CaptionsPanel from "@/components/editor/CaptionsPanel";
import PropertiesPanel from "@/components/editor/PropertiesPanel";
import ExportDialog from "@/components/export/ExportDialog";
import { useEditor } from "@/stores/useStore";
import { useHistory } from "@/stores/history";
import { useAutoSave } from "@/lib/indexeddb/autosave";
import { useKeyboardShortcuts } from "@/lib/hotkeys";
import { drawFrame, syncAudio } from "@/lib/canvas/renderer";
import { cacheSource, getSource } from "@/lib/canvas/sources";
import { generateThumbnail } from "@/lib/canvas/thumbnails";
import { VoiceRecorder } from "@/lib/audio/recorder";
import { drawWaveform, generateWaveform } from "@/lib/audio/waveform";
import { editorApi } from "@/lib/ai/editorApi"; // registers window.vidforge for the AI layer
import type { Clip, Project } from "@/types";
const TOOLS = [
  { id: "media", label: "Media", icon: "🎞" },
  { id: "text", label: "Text", icon: "T" },
  { id: "audio", label: "Audio", icon: "♪" },
  { id: "effects", label: "Effects", icon: "✦" },
  { id: "transitions", label: "Transitions", icon: "⇄" },
  { id: "captions", label: "Captions", icon: "💬" },
] as const;

export default function EditorPage() {
  const { project, setProject, currentTime, setCurrentTime, playing, setPlaying, addClip, updateClip, removeClip, selectedClipId, setSelectedClip, setPanel, activePanel, assets, addAsset } = useEditor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [fit, setFit] = useState<"fit" | "fill">("fit");
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rec, setRec] = useState<{ recording: boolean; seconds: number }>({ recording: false, seconds: 0 });
  const [saveState, setSaveState] = useState<"saved" | "saving" | "saved-locally">("saved");
  const [waveforms, setWaveforms] = useState<Record<string, number[]>>({});
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const timeRef = useRef(currentTime);
  const recorderRef = useRef<VoiceRecorder | null>(null);

  useAutoSave();
  useKeyboardShortcuts();
  // Ensure the AI command API is registered (window.vidforge) — the AI layer
  // integrates later by importing this same module, but registering here makes
  // it available to any runtime AI code (console, injected module, worker).
  useEffect(() => { void editorApi; }, []);
  const { canUndo, canRedo } = useHistory();
  const { undo, redo, push } = useHistory.getState();

  const doUndo = () => { const prev = undo(project); if (prev) setProject(prev as Partial<Project>); };
  const doRedo = () => { const next = redo(project); if (next) setProject(next as Partial<Project>); };
  const mut = (fn: () => void) => { push(project); fn(); };

  const videoClips = project.tracks.filter((t) => t.kind === "video").flatMap((t) => t.clips);
  const textClips = project.tracks.filter((t) => t.kind === "text").flatMap((t) => t.clips);
  const audioClips = project.tracks.filter((t) => t.kind === "audio").flatMap((t) => t.clips);
  const totalDuration = Math.max(10, ...project.tracks.flatMap((t) => t.clips.map((c) => c.position + c.duration)));

  // ---------- render loop (rAF, no React re-render per frame) ----------
  const draw = useCallback((ts: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    if (playing && lastTsRef.current) {
      const dt = (ts - lastTsRef.current) / 1000;
      timeRef.current = Math.min(totalDuration, timeRef.current + dt);
    }
    lastTsRef.current = ts;
    drawFrame(ctx, canvas.width, canvas.height, timeRef.current, videoClips, textClips, { muted, volume });
    syncAudio(timeRef.current, audioClips, { muted, volume });
    if (playing) setCurrentTime(timeRef.current);
    rafRef.current = requestAnimationFrame(draw);
  }, [playing, totalDuration, videoClips, textClips, audioClips, setCurrentTime, muted, volume]);

  useEffect(() => {
    timeRef.current = currentTime;
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw, currentTime]);

  useEffect(() => {
    if (!playing) {
      const els = new Set<HTMLVideoElement>();
      videoClips.forEach((c) => { const s = getSource(c.src || c.id); if (s?.el instanceof HTMLVideoElement) els.add(s.el); });
      els.forEach((el) => el.pause());
    }
  }, [playing, videoClips]);

  // ---------- import ----------
  const importFile = (file: File, kind: "video" | "image" | "audio") => {
    const url = URL.createObjectURL(file);
    const pos = currentTime;
    if (kind === "video") {
      const el = document.createElement("video");
      el.src = url; el.muted = true; el.preload = "metadata";
      el.onloadedmetadata = () => {
        cacheSource(url, el);
        addAsset({ id: url, name: file.name, type: "video", duration: el.duration || 0, addedAt: Date.now() });
        void generateThumbnail(el, url).then((t) => t && addAsset({ id: url, name: file.name, type: "video", duration: el.duration || 0, thumb: t, addedAt: Date.now() }));
      };
      addClip(0, { src: url, kind: "video", name: file.name, duration: 5, position: pos, start: 0, end: 5 });
    } else if (kind === "image") {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        cacheSource(url, img);
        addAsset({ id: url, name: file.name, type: "image", duration: 0, addedAt: Date.now() });
        void generateThumbnail(img, url).then((t) => t && addAsset({ id: url, name: file.name, type: "image", duration: 0, thumb: t, addedAt: Date.now() }));
      };
      addClip(0, { src: url, kind: "image", name: file.name, duration: 5, position: pos, start: 0, end: 5 });
    } else {
      const el = document.createElement("audio");
      el.src = url; el.preload = "metadata";
      el.onloadedmetadata = () => {
        cacheSource(url, el);
        addAsset({ id: url, name: file.name, type: "audio", duration: el.duration || 0, addedAt: Date.now() });
      };
      const dur = 10;
      addClip(2, { src: url, kind: "audio", name: file.name, duration: dur, position: pos, start: 0, end: dur });
      // async waveform
      void generateWaveform(url, 180).then((wf) => setWaveforms((w) => ({ ...w, [url]: wf.peaks }))).catch(() => {});
    }
  };

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) => {
      const kind = f.type.startsWith("video") ? "video" : f.type.startsWith("image") ? "image" : f.type.startsWith("audio") ? "audio" : null;
      if (kind) importFile(f, kind);
    });
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files); };

  // ---------- clip ops ----------
  const splitAtPlayhead = () => {
    mut(() => {
      const all = project.tracks.flatMap((t) => t.clips);
      const target = all.find((c) => c.id === selectedClipId) || all.find((c) => currentTime >= c.position && currentTime < c.position + c.duration);
      if (!target) return;
      const local = currentTime - target.position;
      if (local < 0.1 || local > target.duration - 0.1) return;
      const trackIdx = project.tracks.findIndex((t) => t.clips.some((c) => c.id === target.id));
      if (trackIdx < 0) return;
      addClip(trackIdx, { ...target, id: undefined, position: currentTime, duration: target.duration - local, start: (target.start || 0) + local });
      updateClip(target.id, { duration: local });
    });
  };

  const duplicateClip = (id: string) => {
    mut(() => {
      const trackIdx = project.tracks.findIndex((t) => t.clips.some((c) => c.id === id));
      if (trackIdx < 0) return;
      const c = project.tracks[trackIdx].clips.find((x) => x.id === id);
      if (!c) return;
      addClip(trackIdx, { ...c, id: undefined, position: (c.position || 0) + (c.duration || 1) });
    });
  };

  // ---------- voice recording ----------
  const toggleRecord = async () => {
    if (rec.recording) { recorderRef.current?.stop(); return; }
    try {
      const recorder = new VoiceRecorder();
      recorderRef.current = recorder;
      recorder.onTick = (s) => setRec({ recording: true, seconds: s });
      recorder.onData = (blob, dur) => {
        setRec({ recording: false, seconds: 0 });
        const url = URL.createObjectURL(blob);
        const el = document.createElement("audio");
        el.src = url;
        cacheSource(url, el);
        addClip(2, { src: url, kind: "audio", name: "Voice recording", duration: dur, position: currentTime, start: 0, end: dur });
        void generateWaveform(url, 120).then((wf) => setWaveforms((w) => ({ ...w, [url]: wf.peaks }))).catch(() => {});
      };
      await recorder.start();
      setRec({ recording: true, seconds: 0 });
    } catch (e) {
      alert("Microphone access denied: " + String(e));
    }
  };

  // ---------- helpers ----------
  const sel = project.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId);
  const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${String(Math.floor((s % 1) * 100)).padStart(2, "0")}`;

  // waveform canvas refs
  const waveformRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  useEffect(() => {
    // draw waveforms for visible audio clips
    audioClips.forEach((c) => {
      const peaks = waveforms[c.src || ""];
      const cv = waveformRefs.current[c.id];
      if (peaks && cv) {
        const p = totalDuration ? (currentTime - c.position) / totalDuration : 0;
        drawWaveform(cv, peaks, "#f5c518", Math.max(0, Math.min(1, p)));
      }
    });
  }, [audioClips, waveforms, currentTime, totalDuration]);

  return (
    <div className="page">
      <Topbar />
      <div className="editor-shell" onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>

        {/* ===== TOP BAR ===== */}
        <div className="editor-topbar">
          <Link href="/" className="btn btn-ghost btn-sm" aria-label="Back to projects">←</Link>
          <span className="proj-name">{project.name || "Untitled"}</span>
          <span className={`save-state ${saveState}`}>
            {saveState === "saving" ? "Saving…" : saveState === "saved-locally" ? "Saved locally" : "Saved"}
          </span>
          <div style={{ flex: 1 }} />
          <button className="btn btn-ghost btn-sm" onClick={doUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">↩</button>
          <button className="btn btn-ghost btn-sm" onClick={doRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">↪</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setPlaying(!playing)}>{playing ? "Pause" : "Preview"}</button>
          <button className="btn btn-primary btn-sm" onClick={() => setExportOpen(true)}>Export</button>
        </div>

        <div className="editor-body">
          {/* ===== LEFT TOOLBAR + PANEL ===== */}
          <div className="editor-left">
            <div className="tool-rail">
              {TOOLS.map((t) => (
                <button key={t.id} className={`rail-btn ${activePanel === t.id ? "active" : ""}`} onClick={() => setPanel(activePanel === t.id ? null : (t.id as any))} title={t.label} aria-label={t.label}>
                  <span className="rail-icon">{t.icon}</span>
                  <span className="rail-label">{t.label}</span>
                </button>
              ))}
            </div>
            <div className="tool-content">
              {activePanel === "media" && <MediaPanel />}
              {activePanel === "text" && <TextPanel />}
              {activePanel === "effects" && <EffectsPanel />}
              {activePanel === "transitions" && <TransitionsPanel />}
              {activePanel === "captions" && <CaptionsPanel />}
              {activePanel === "audio" && (
                <div className="tool-panel">
                  <div className="card-title">Audio</div>
                  <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginBottom: 8 }} onClick={() => audioInputRef.current?.click()}>+ Import Audio</button>
                  <button className={`btn ${rec.recording ? "btn-danger" : "btn-primary"} btn-sm`} style={{ width: "100%", marginBottom: 12 }} onClick={toggleRecord}>
                    {rec.recording ? `● ${rec.seconds.toFixed(0)}s — Stop` : "🎙 Record Voice"}
                  </button>
                  <div className="card-title" style={{ fontSize: 11.5 }}>Track</div>
                  {audioClips.length === 0 && <p className="hint">No audio clips yet. Import or record.</p>}
                  {audioClips.map((c) => (
                    <div key={c.id} className={`audio-cell ${selectedClipId === c.id ? "selected" : ""}`} onClick={() => setSelectedClip(c.id)}>
                      <canvas ref={(r) => { waveformRefs.current[c.id] = r; }} height={36} style={{ width: "100%", height: 36 }} />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-dim)", marginTop: 2 }}>
                        <span>{c.name.slice(0, 18)}</span><span>{c.duration.toFixed(1)}s</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!activePanel && <div className="tool-hint">Choose a tool to get started.</div>}
            </div>
          </div>

          {/* ===== CENTER: PREVIEW + TIMELINE ===== */}
          <div className="editor-center">
            <div className="preview-wrap" style={{ background: dragging ? "rgba(245,197,24,.1)" : "#000" }}>
              <canvas ref={canvasRef} width={project.width} height={project.height} className="preview-canvas"
                style={{ maxWidth: "100%", maxHeight: "100%", aspectRatio: `${project.width}/${project.height}`, objectFit: fit as "fill" }} />
              {/* empty state overlay */}
              {videoClips.length === 0 && (
                <div className="preview-empty" onClick={() => fileInputRef.current?.click()}>
                  <div className="big">🎬</div>
                  <p>Drop a video here</p>
                  <button className="btn btn-primary btn-sm">Import Media</button>
                </div>
              )}
              <div className="preview-time">{fmtT(currentTime)} / {fmtT(totalDuration)}</div>
            </div>

            <div className="transport">
              <button className="btn-play" onClick={() => { setPlaying(!playing); if (currentTime >= totalDuration) setCurrentTime(0); }}>
                {playing ? <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg> : <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>}
              </button>
              <button className="btn btn-ghost btn-sm" title="Previous frame" onClick={() => setCurrentTime(Math.max(0, currentTime - 1 / project.fps))}>⏪</button>
              <button className="btn btn-ghost btn-sm" title="Next frame" onClick={() => setCurrentTime(Math.min(totalDuration, currentTime + 1 / project.fps))}>⏩</button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-ghost btn-sm" title={muted ? "Unmute" : "Mute"} onClick={() => setMuted(!muted)}>{muted ? "🔇" : "🔊"}</button>
              <input className="vol-slider" type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(+e.target.value)} title="Volume" />
              <button className="btn btn-ghost btn-sm" title="Fit / Fill" onClick={() => setFit(fit === "fit" ? "fill" : "fit")}>{fit === "fit" ? "⛶" : "⿻"}</button>
              <button className="btn btn-ghost btn-sm" title="Fullscreen" onClick={() => document.querySelector(".preview-wrap")?.requestFullscreen?.()}>⛶</button>
              <button className="btn btn-ghost btn-sm" title="Split at playhead (S)" onClick={splitAtPlayhead}>✂</button>
            </div>

            <div className="timeline-wrap">
              <Timeline
                project={project}
                totalDuration={totalDuration}
                currentTime={currentTime}
                selectedClipId={selectedClipId}
                onSelect={setSelectedClip}
                onUpdateClip={(id, patch) => mut(() => updateClip(id, patch))}
                onSplit={splitAtPlayhead}
                onDuplicate={duplicateClip}
                onDelete={(id) => mut(() => { removeClip(id); setSelectedClip(null); })}
                onSeek={setCurrentTime}
              />
            </div>
          </div>

          {/* ===== RIGHT: PROPERTIES ===== */}
          <div className="editor-right">
            <PropertiesPanel />
          </div>
        </div>

        {/* mobile tool drawer */}
        <div className="mobile-tools">
          {TOOLS.map((t) => (
            <button key={t.id} className={`mobile-tool ${activePanel === t.id ? "active" : ""}`} onClick={() => { if (t.id === "text") { setPanel("text"); } else { setPanel(activePanel === t.id ? null : (t.id as any)); } }}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
          <button className="mobile-tool" onClick={() => setExportOpen(true)}>⬇ Export</button>
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="video/*,image/*,audio/*" multiple hidden onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
      <input ref={audioInputRef} type="file" accept="audio/*" hidden onChange={(e) => { if (e.target.files?.[0]) importFile(e.target.files[0], "audio"); e.target.value = ""; }} />

      {exportOpen && (
        <ExportDialog canvas={canvasRef.current} duration={totalDuration} fps={project.fps} onClose={() => setExportOpen(false)} />
      )}

      <style>{`
        .editor-shell { display: flex; flex-direction: column; height: calc(100vh - var(--topbar-h)); }
        .editor-topbar { display: flex; align-items: center; gap: 8px; padding: 6px 12px; border-bottom: 1px solid var(--border); background: var(--bg-soft); }
        .proj-name { font-weight: 700; font-size: 13.5px; }
        .save-state { font-size: 10.5px; color: var(--text-dim); }
        .save-state.saving { color: var(--accent); }
        .editor-body { display: grid; grid-template-columns: 168px 1fr 250px; flex: 1; min-height: 0; }
        .editor-left { display: flex; border-right: 1px solid var(--border); min-width: 0; }
        .tool-rail { width: 52px; border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 6px 0; background: var(--bg-soft); }
        .rail-btn { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 2px; background: none; border: none; cursor: pointer; color: var(--text-dim); font-size: 9.5px; font-weight: 600; border-left: 2px solid transparent; }
        .rail-btn:hover { color: var(--text); }
        .rail-btn.active { color: var(--accent); border-left-color: var(--accent); background: var(--surface); }
        .rail-icon { font-size: 16px; line-height: 1; }
        .tool-content { flex: 1; overflow-y: auto; padding: 12px; min-width: 0; }
        .tool-hint { color: var(--text-dim); font-size: 12px; }
        .editor-center { display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
        .preview-wrap { flex: 1; display: grid; place-items: center; position: relative; min-height: 0; background: #000; }
        .preview-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; color: var(--text-dim); }
        .preview-empty .big { font-size: 40px; }
        .preview-time { position: absolute; bottom: 8px; right: 10px; background: rgba(0,0,0,.65); color: #fff; font-size: 11px; padding: 3px 8px; border-radius: 6px; font-variant-numeric: tabular-nums; }
        .transport { display: flex; align-items: center; gap: 4px; padding: 6px 10px; border-top: 1px solid var(--border); background: var(--bg-soft); }
        .vol-slider { width: 70px; accent-color: var(--accent); }
        .timeline-wrap { border-top: 1px solid var(--border); padding: 8px 10px; background: var(--bg-soft); min-width: 0; overflow: hidden; }
        .timeline-wrap .timeline-scroll { overflow-x: auto; }
        .editor-right { border-left: 1px solid var(--border); overflow-y: auto; min-width: 0; }
        .audio-cell { padding: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; cursor: pointer; }
        .audio-cell.selected { border-color: var(--accent); }

        /* mobile: separate layout */
        @media (max-width: 767px) {
          .editor-shell { height: calc(100vh - var(--topbar-h) - 56px); }
          .editor-body { grid-template-columns: 1fr; grid-template-rows: 1fr auto; }
          .editor-left { display: none; }
          .editor-right { display: none; }
          .tool-content { display: none; }
          .timeline-wrap { overflow-x: auto; }
        }
        @media (min-width: 768px) and (max-width: 1023px) {
          .editor-body { grid-template-columns: 52px 1fr; }
          .editor-right { display: none; }
          .tool-content { display: none; }
        }
      `}</style>
    </div>
  );
}
