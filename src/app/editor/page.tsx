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
  { id: "media", label: "Media", icon: "▦" },
  { id: "text", label: "Text", icon: "T" },
  { id: "audio", label: "Audio", icon: "♪" },
  { id: "effects", label: "FX", icon: "✦" },
  { id: "transitions", label: "Transition", icon: "⇄" },
  { id: "captions", label: "Captions", icon: "ℹ" },
] as const;

export default function EditorPage() {
  const { project, setProject, currentTime, setCurrentTime, playing, setPlaying, addClip, updateClip, removeClip, selectedClipId, setSelectedClip, setPanel, activePanel, assets, addAsset } = useEditor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [rec, setRec] = useState<{ recording: boolean; seconds: number }>({ recording: false, seconds: 0 });
  const [waveforms, setWaveforms] = useState<Record<string, number[]>>({});
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const timeRef = useRef(currentTime);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);

  useAutoSave();
  useKeyboardShortcuts();
  // AI command API registration (window.vidforge) for the future AI layer
  useEffect(() => { void editorApi; }, []);
  const { canUndo, canRedo } = useHistory();
  const { undo, redo, push } = useHistory.getState();

  const doUndo = () => { const prev = undo(project); if (prev) setProject(prev as Partial<Project>); };
  const doRedo = () => { const next = redo(project); if (next) setProject(next as Partial<Project>); };
  const mut = (fn: () => void) => { push(project); fn(); setSavedFlash(false); };

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

  const waveformRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  useEffect(() => {
    audioClips.forEach((c) => {
      const peaks = waveforms[c.src || ""];
      const cv = waveformRefs.current[c.id];
      if (peaks && cv) {
        const p = totalDuration ? (currentTime - c.position) / totalDuration : 0;
        drawWaveform(cv, peaks, "#f5c518", Math.max(0, Math.min(1, p)));
      }
    });
  }, [audioClips, waveforms, currentTime, totalDuration]);

  const saveProject = () => {
    void import("@/lib/indexeddb/db").then((m) => m.idbSaveProject(project)).then(() => {
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
    });
  };

  return (
    <div className="page">
      <Topbar />
      <div className="editor-shell" onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>

        {/* ===== TOP BAR ===== */}
        <div className="editor-topbar">
          <Link href="/" className="btn btn-ghost btn-sm topbar-back" aria-label="Back to projects">←</Link>
          <input
            className="proj-name-input"
            value={project.name || "Untitled"}
            onChange={(e) => useEditor.getState().setProject({ name: e.target.value })}
            aria-label="Project name"
          />
          <span className={`save-state ${savedFlash ? "flash" : ""}`} title="Saved locally">
            {savedFlash ? "✓ Saved" : "•••"}
          </span>
          <div className="topbar-divider" />
          <div className="topbar-group">
            <button className="icon-btn" onClick={doUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">↩</button>
            <button className="icon-btn" onClick={doRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">↪</button>
          </div>
          <div className="topbar-divider" />
          <button className="icon-btn" onClick={saveProject} title="Save (Ctrl+S)">💾</button>
          <div style={{ flex: 1 }} />
          <span className="kbd-hint" title="Keyboard shortcuts">Space play · S split · Del delete</span>
          <button className="btn btn-primary btn-sm export-btn" onClick={() => setExportOpen(true)}>
            <span>Export</span><span className="export-arrow">↗</span>
          </button>
        </div>

        <div className="editor-body">
          {/* ===== LEFT: TOOLBAR + PANEL ===== */}
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
              {!activePanel && <div className="tool-hint">Select a tool to add media, text, audio or effects.</div>}
            </div>
          </div>

          {/* ===== CENTER: PREVIEW + TRANSPORT + TIMELINE ===== */}
          <div className="editor-center">
            <div className="preview-wrap" style={{ background: dragging ? "rgba(245,197,24,.08)" : "#0a0a0c" }}>
              <canvas ref={canvasRef} width={project.width} height={project.height} className="preview-canvas"
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
              {videoClips.length === 0 && (
                <div className="preview-empty" onClick={() => fileInputRef.current?.click()}>
                  <div className="big">🎬</div>
                  <p>Drop a video here</p>
                  <button className="btn btn-primary btn-sm">Import Media</button>
                </div>
              )}
              {/* transport overlay buttons */}
              <div className="preview-center-controls">
                <button className="big-play" onClick={() => { setPlaying(!playing); if (currentTime >= totalDuration) setCurrentTime(0); }} title="Play / Pause (Space)">
                  {playing
                    ? <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
                    : <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>}
                </button>
              </div>
            </div>

            {/* transport bar */}
            <div className="transport">
              <button className="btn-ghost icon-btn" onClick={() => setCurrentTime(Math.max(0, currentTime - 1 / project.fps))} title="Previous frame">⏮</button>
              <button className="btn-play sm" onClick={() => { setPlaying(!playing); if (currentTime >= totalDuration) setCurrentTime(0); }} title="Play / Pause (Space)">
                {playing ? "❚❚" : "▶"}
              </button>
              <button className="btn-ghost icon-btn" onClick={() => setCurrentTime(Math.min(totalDuration, currentTime + 1 / project.fps))} title="Next frame">⏭</button>
              <span className="timecode-display">{fmtT(currentTime)}<span className="tc-total"> / {fmtT(totalDuration)}</span></span>
              <div className="spacer" style={{ flex: 1 }} />
              <button className="icon-btn" onClick={splitAtPlayhead} title="Split at playhead (S)">✂</button>
              <button className={`icon-btn ${muted ? "off" : ""}`} onClick={() => setMuted(!muted)} title="Mute">{muted ? "🔇" : "🔊"}</button>
              <input className="vol-slider" type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(+e.target.value)} title="Volume" aria-label="Volume" />
              <button className="icon-btn" onClick={() => document.querySelector(".preview-wrap")?.requestFullscreen?.()} title="Fullscreen">⛶</button>
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
            <button key={t.id} className={`mobile-tool ${activePanel === t.id ? "active" : ""}`} onClick={() => { setPanel(activePanel === t.id ? null : (t.id as any)); }}>
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
        .editor-shell { display: flex; flex-direction: column; height: calc(100vh - var(--topbar-h)); background: var(--bg); }
        .editor-topbar { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid var(--border); background: var(--bg); }
        .topbar-back { text-decoration: none; }
        .proj-name-input { background: transparent; border: 1px solid transparent; border-radius: 6px; padding: 4px 8px; font-size: 13.5px; font-weight: 600; color: var(--text); min-width: 120px; max-width: 260px; }
        .proj-name-input:hover { border-color: var(--border); }
        .proj-name-input:focus { outline: none; border-color: var(--accent); background: var(--surface); }
        .save-state { font-size: 10.5px; color: var(--text-dim); min-width: 14px; transition: color .2s; }
        .save-state.flash { color: var(--success); }
        .topbar-divider { width: 1px; height: 20px; background: var(--border); }
        .topbar-group { display: flex; gap: 2px; }
        .icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 7px; border: 1px solid transparent; background: transparent; color: var(--text-muted); cursor: pointer; font-size: 13px; transition: background .12s, color .12s; }
        .icon-btn:hover { background: var(--surface); color: var(--text); }
        .icon-btn:disabled { opacity: .3; cursor: default; }
        .icon-btn.off { opacity: .5; }
        .kbd-hint { font-size: 10.5px; color: var(--text-dim); }
        .export-btn { margin-left: 6px; }
        .export-arrow { opacity: .6; font-size: 12px; }

        .editor-body { display: grid; grid-template-columns: 190px 1fr 252px; flex: 1; min-height: 0; }
        .editor-left { display: flex; border-right: 1px solid var(--border); min-width: 0; background: var(--bg); }
        .tool-rail { width: 46px; border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 6px 0; background: var(--bg-soft); }
        .rail-btn { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 9px 2px; background: none; border: none; cursor: pointer; color: var(--text-dim); font-size: 9px; font-weight: 600; border-left: 2px solid transparent; }
        .rail-btn:hover { color: var(--text); background: var(--surface); }
        .rail-btn.active { color: var(--accent); border-left-color: var(--accent); background: var(--surface); }
        .rail-icon { font-size: 15px; line-height: 1; }
        .tool-content { flex: 1; overflow-y: auto; padding: 14px 12px; min-width: 0; }
        .tool-hint { color: var(--text-dim); font-size: 12px; line-height: 1.5; }

        .editor-center { display: flex; flex-direction: column; min-width: 0; overflow: hidden; }
        .preview-wrap { flex: 1; display: grid; place-items: center; position: relative; min-height: 0; background: #0a0a0c; }
        .preview-empty { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; cursor: pointer; color: var(--text-dim); }
        .preview-empty .big { font-size: 42px; opacity: .8; }
        .preview-center-controls { position: absolute; bottom: 14px; left: 14px; }
        .big-play { width: 42px; height: 42px; border-radius: 50%; border: 1px solid rgba(255,255,255,.25); background: rgba(0,0,0,.55); backdrop-filter: blur(4px); color: #fff; display: grid; place-items: center; cursor: pointer; transition: background .15s, transform .1s; }
        .big-play:hover { background: rgba(245,197,24,.85); color: #000; transform: scale(1.05); }

        .transport { display: flex; align-items: center; gap: 4px; padding: 6px 12px; border-top: 1px solid var(--border); background: var(--bg-soft); }
        .btn-play.sm { background: var(--accent); color: #000; border: none; border-radius: 7px; width: 30px; height: 30px; font-weight: 800; cursor: pointer; font-size: 11px; }
        .timecode-display { font-family: var(--font-mono, monospace); font-size: 12px; font-variant-numeric: tabular-nums; color: var(--text); margin-left: 6px; }
        .tc-total { color: var(--text-dim); }
        .vol-slider { width: 64px; accent-color: var(--accent); }

        .timeline-wrap { border-top: 1px solid var(--border); padding: 8px 12px 10px; background: var(--bg-soft); min-width: 0; overflow: hidden; }
        .timeline-wrap .timeline-scroll { overflow-x: auto; }
        .editor-right { border-left: 1px solid var(--border); overflow-y: auto; min-width: 0; background: var(--bg); }
        .audio-cell { padding: 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 8px; cursor: pointer; }
        .audio-cell.selected { border-color: var(--accent); }

        @media (min-width: 768px) and (max-width: 1023px) {
          .editor-body { grid-template-columns: 46px 1fr; }
          .editor-right { display: none; }
          .tool-content { display: none; }
          .kbd-hint { display: none; }
        }

        @media (max-width: 767px) {
          .editor-shell { height: calc(100vh - var(--topbar-h) - 56px); }
          .editor-body { grid-template-columns: 1fr; grid-template-rows: 1fr auto; }
          .editor-left { display: none; }
          .editor-right { display: none; }
          .kbd-hint, .topbar-divider, .topbar-group { display: none; }
          .timeline-wrap .timeline-scroll { overflow-x: auto; }
          .timecode-display { font-size: 11px; }
          .proj-name-input { max-width: 130px; }
        }
      `}</style>
    </div>
  );
}