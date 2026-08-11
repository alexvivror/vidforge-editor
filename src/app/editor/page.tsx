"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Topbar from "@/components/Topbar";
import ExportDialog from "@/components/export/ExportDialog";
import Timeline from "@/components/timeline/Timeline";
import { useEditor } from "@/stores/useStore";
import { useHistory } from "@/stores/history";
import { useAutoSave } from "@/lib/indexeddb/autosave";
import { useKeyboardShortcuts } from "@/lib/hotkeys";
import { drawFrame, syncAudio } from "@/lib/canvas/renderer";
import { cacheSource, getSource } from "@/lib/canvas/sources";
import { generateThumbnail } from "@/lib/canvas/thumbnails";
import { VoiceRecorder } from "@/lib/audio/recorder";
import type { Clip, Project } from "@/types";

const EFFECTS = ["none", "grayscale", "sepia", "vignette", "blur", "invert", "contrast"];
const TEXT_PRESETS = ["Title", "Subtitle", "Lower Third", "Quote", "Callout"];

export default function EditorPage() {
  const { project, setProject, currentTime, setCurrentTime, playing, setPlaying, addClip, updateClip, removeClip, selectedClipId, setSelectedClip, setPanel, activePanel } = useEditor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [fit, setFit] = useState<"fit" | "fill">("fit");
  const [rec, setRec] = useState<{ recording: boolean; seconds: number }>({ recording: false, seconds: 0 });
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);
  const timeRef = useRef(currentTime);
  const recorderRef = useRef<VoiceRecorder | null>(null);

  useAutoSave();
  useKeyboardShortcuts();
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
      const t = Math.min(totalDuration, timeRef.current + dt);
      timeRef.current = t;
      setCurrentTime(t);
    }
    lastTsRef.current = ts;
    drawFrame(ctx, canvas.width, canvas.height, timeRef.current, videoClips, textClips);
    syncAudio(timeRef.current, audioClips);
    rafRef.current = requestAnimationFrame(draw);
  }, [playing, totalDuration, videoClips, textClips, audioClips, setCurrentTime]);

  useEffect(() => {
    timeRef.current = currentTime;
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw, currentTime]);

  // pause video elements when not playing
  useEffect(() => {
    if (!playing) {
      const els = new Set<HTMLVideoElement>();
      videoClips.forEach((c) => { const s = getSource(c.src || c.id); if (s?.el instanceof HTMLVideoElement) els.add(s.el); });
      els.forEach((el) => el.pause());
    }
  }, [playing, videoClips]);

  // ---------- import ----------
  const onFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file, i) => {
      const url = URL.createObjectURL(file);
      const pos = currentTime + i * 2;
      if (file.type.startsWith("video")) {
        const el = document.createElement("video");
        el.src = url; el.muted = true; el.preload = "metadata";
        el.onloadedmetadata = () => {
          cacheSource(url, el);
          addClip(0, { src: url, kind: "video", name: file.name, duration: Math.min(el.duration || 5, 60), position: pos, start: 0, end: el.duration || 5 });
          void generateThumbnail(el, url);
        };
      } else if (file.type.startsWith("image")) {
        const img = new Image();
        img.src = url;
        img.onload = () => {
          cacheSource(url, img);
          addClip(0, { src: url, kind: "image", name: file.name, duration: 5, position: pos, start: 0, end: 5 });
          void generateThumbnail(img, url);
        };
      } else if (file.type.startsWith("audio")) {
        const el = document.createElement("audio");
        el.src = url; el.preload = "metadata";
        el.onloadedmetadata = () => {
          cacheSource(url, el);
          addClip(2, { src: url, kind: "audio", name: file.name, duration: Math.min(el.duration || 5, 120), position: pos, start: 0, end: el.duration || 5 });
        };
      }
    });
  };

  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files); };

  // ---------- clip ops ----------
  const splitAtPlayhead = () => {
    mut(() => {
      const all = project.tracks.flatMap((t) => t.clips);
      const sel = all.find((c) => c.id === selectedClipId);
      const target = sel || all.find((c) => currentTime >= c.position && currentTime < c.position + c.duration);
      if (!target) return;
      const local = currentTime - target.position;
      if (local < 0.1 || local > target.duration - 0.1) return;
      const trackIdx = project.tracks.findIndex((t) => t.clips.some((c) => c.id === target.id));
      if (trackIdx < 0) return;
      const rightDur = target.duration - local;
      addClip(trackIdx, { ...target, id: undefined, position: currentTime, duration: rightDur, start: (target.start || 0) + local });
      updateClip(target.id, { duration: local });
    });
  };

  const duplicateClip = (id: string) => {
    mut(() => {
      const trackIdx = project.tracks.findIndex((t) => t.clips.some((c) => c.id === id));
      if (trackIdx < 0) return;
      const c = project.tracks[trackIdx].clips.find((x) => x.id === id);
      if (!c) return;
      addClip(trackIdx, { ...c, id: undefined, position: c.position + c.duration });
    });
  };

  const addTextClip = () => {
    mut(() => {
      addClip(1, {
        kind: "text", name: "Text", text: "Your text", duration: 4, position: currentTime,
        start: 0, end: 4, fontSize: 56, fontWeight: 700, color: "#ffffff", animation: "fade",
      });
    });
  };

  // ---------- voice recording ----------
  const toggleRecord = async () => {
    if (rec.recording) {
      recorderRef.current?.stop();
      setRec({ recording: false, seconds: 0 });
      return;
    }
    try {
      const recorder = new VoiceRecorder();
      recorderRef.current = recorder;
      recorder.onTick = (s) => setRec({ recording: true, seconds: s });
      recorder.onData = (blob, dur) => {
        const url = URL.createObjectURL(blob);
        const el = document.createElement("audio");
        el.src = url;
        cacheSource(url, el);
        addClip(2, { src: url, kind: "audio", name: "Voice recording", duration: dur, position: currentTime, start: 0, end: dur });
      };
      await recorder.start();
      setRec({ recording: true, seconds: 0 });
    } catch (e) {
      alert("Microphone access denied: " + String(e));
    }
  };

  // ---------- helpers ----------
  const clipAt = (id: string) => project.tracks.flatMap((t) => t.clips).find((c) => c.id === id);
  const sel = clipAt(selectedClipId || "");
  const fmtT = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}.${String(Math.floor((s % 1) * 100)).padStart(2, "0")}`;

  return (
    <div className="page">
      <Topbar />
      <div className="editor-layout" onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}>
        {/* LEFT: media / tools */}
        <aside className="editor-panel">
          <div style={{ padding: 16 }}>
            <div className="card-title">Media</div>
            <button className="btn btn-primary" style={{ width: "100%", marginBottom: 8 }} onClick={() => fileInputRef.current?.click()}>Import Video / Image</button>
            <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginBottom: 12 }} onClick={() => audioInputRef.current?.click()}>🎵 Import Audio</button>
            <input ref={fileInputRef} type="file" accept="video/*,image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
            <input ref={audioInputRef} type="file" accept="audio/*" hidden onChange={(e) => onFiles(e.target.files)} />
            <p className="hint" style={{ marginBottom: 16 }}>Drop media anywhere, or use the buttons.</p>

            <div className="divider" />
            <div className="card-title">Add</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setPanel("crop")}>Crop</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setPanel("rotate")}>Rotate</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setPanel("flip")}>Flip</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setPanel("speed")}>Speed</button>
              <button className="btn btn-ghost btn-sm" onClick={addTextClip}>T+ Text</button>
              <button className="btn btn-ghost btn-sm" onClick={toggleRecord}>
                {rec.recording ? `⏺ ${rec.seconds.toFixed(0)}s` : "🎙 Record"}
              </button>
            </div>
            {rec.recording && <p className="hint" style={{ color: "var(--danger)", marginTop: 8 }}>● Recording… tap again to stop</p>}

            {activePanel && sel && (
              <div className="card" style={{ marginTop: 12, padding: 12 }}>
                <div className="card-title">Clip: {sel.name.slice(0, 18)}</div>
                <div className="field"><label>Position (s)</label>
                  <input className="input" type="number" step="0.1" value={Math.round(sel.position * 10) / 10} onChange={(e) => mut(() => updateClip(sel.id, { position: +e.target.value }))} />
                </div>
                <div className="field"><label>Duration (s)</label>
                  <input className="input" type="number" step="0.1" value={Math.round(sel.duration * 10) / 10} onChange={(e) => mut(() => updateClip(sel.id, { duration: Math.max(0.1, +e.target.value) }))} />
                </div>
                {sel.kind !== "text" && (
                  <>
                    <div className="field"><label>Scale</label>
                      <input className="input" type="range" min={0.1} max={3} step={0.05} value={sel.scale || 1} onChange={(e) => mut(() => updateClip(sel.id, { scale: +e.target.value }))} />
                    </div>
                    <div className="field"><label>Rotation°</label>
                      <input className="input" type="range" min={-180} max={180} step={1} value={sel.rotation || 0} onChange={(e) => mut(() => updateClip(sel.id, { rotation: +e.target.value }))} />
                    </div>
                    <div className="field"><label>Position X%</label>
                      <input className="input" type="range" min={-50} max={50} step={1} value={sel.x || 0} onChange={(e) => mut(() => updateClip(sel.id, { x: +e.target.value }))} />
                    </div>
                    <div className="field"><label>Position Y%</label>
                      <input className="input" type="range" min={-50} max={50} step={1} value={sel.y || 0} onChange={(e) => mut(() => updateClip(sel.id, { y: +e.target.value }))} />
                    </div>
                  </>
                )}
                <div className="field"><label>Opacity</label>
                  <input className="input" type="range" min={0} max={1} step={0.05} value={sel.opacity ?? 1} onChange={(e) => mut(() => updateClip(sel.id, { opacity: +e.target.value }))} />
                </div>
                {(sel.kind === "video" || sel.kind === "image") && (
                  <div className="field"><label>Speed</label>
                    <input className="input" type="range" min={0.25} max={3} step={0.25} value={sel.speed || 1} onChange={(e) => mut(() => updateClip(sel.id, { speed: +e.target.value }))} />
                  </div>
                )}
                {sel.kind === "audio" && (
                  <>
                    <div className="field"><label>Volume</label>
                      <input className="input" type="range" min={0} max={1} step={0.05} value={sel.volume ?? 1} onChange={(e) => mut(() => updateClip(sel.id, { volume: +e.target.value }))} />
                    </div>
                    <div className="field"><label>Fade in (s)</label>
                      <input className="input" type="number" step="0.1" value={sel.fadeIn || 0} onChange={(e) => mut(() => updateClip(sel.id, { fadeIn: +e.target.value }))} />
                    </div>
                    <div className="field"><label>Fade out (s)</label>
                      <input className="input" type="number" step="0.1" value={sel.fadeOut || 0} onChange={(e) => mut(() => updateClip(sel.id, { fadeOut: +e.target.value }))} />
                    </div>
                  </>
                )}
                {(sel.kind === "video" || sel.kind === "image") && (
                  <div className="field"><label>Effect</label>
                    <select className="select" value={sel.effects?.[0] || "none"} onChange={(e) => mut(() => updateClip(sel.id, { effects: [e.target.value] }))}>
                      {EFFECTS.map((fx) => <option key={fx} value={fx}>{fx}</option>)}
                    </select>
                  </div>
                )}
                {sel.kind === "text" && (
                  <>
                    <div className="field"><label>Text</label>
                      <input className="input" value={sel.text || ""} onChange={(e) => mut(() => updateClip(sel.id, { text: e.target.value }))} />
                    </div>
                    <div className="field"><label>Font size</label>
                      <input className="input" type="range" min={16} max={160} step={2} value={sel.fontSize || 56} onChange={(e) => mut(() => updateClip(sel.id, { fontSize: +e.target.value }))} />
                    </div>
                    <div className="field"><label>Preset</label>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                        {TEXT_PRESETS.map((p) => (
                          <button key={p} className="btn btn-ghost btn-sm" onClick={() => mut(() => updateClip(sel.id, { text: p, fontSize: p === "Title" ? 72 : p === "Caption" ? 32 : 48 }))}>{p}</button>
                        ))}
                      </div>
                    </div>
                    <div className="field"><label>Animation</label>
                      <select className="select" value={sel.animation || "none"} onChange={(e) => mut(() => updateClip(sel.id, { animation: e.target.value }))}>
                        {["none", "fade", "slide-in", "zoom"].map((a) => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                  </>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={duplicateClip.bind(null, sel.id)}>⧉ Duplicate</button>
                  <button className="btn btn-danger btn-sm" onClick={() => mut(() => { removeClip(sel.id); setSelectedClip(null); })}>Delete</button>
                </div>
              </div>
            )}
            {activePanel && !sel && <p className="hint" style={{ marginTop: 12 }}>Select a clip on the timeline to edit it.</p>}
          </div>
        </aside>

        {/* CENTER: preview + timeline */}
        <div className="editor-center">
          <div className="preview-wrap" style={{ background: dragging ? "rgba(245,197,24,.08)" : "#000" }}>
            <canvas
              ref={canvasRef}
              width={project.width}
              height={project.height}
              className="preview-canvas"
              style={{
                maxWidth: "100%", maxHeight: "100%",
                aspectRatio: `${project.width}/${project.height}`,
                objectFit: fit as "fill",
              }}
            />
            <div className="preview-time">{fmtT(currentTime)} / {fmtT(totalDuration)}</div>
          </div>

          <div className="transport">
            <button className="btn btn-ghost btn-sm" onClick={doUndo} disabled={!canUndo} title="Undo (Ctrl+Z)">↩</button>
            <button className="btn btn-ghost btn-sm" onClick={doRedo} disabled={!canRedo} title="Redo (Ctrl+Y)">↪</button>
            <button className="btn-play" onClick={() => { setPlaying(!playing); if (currentTime >= totalDuration) setCurrentTime(0); }}>
              {playing
                ? <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
                : <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>}
            </button>
            <button className="btn btn-ghost btn-sm" title="Frame back" onClick={() => setCurrentTime(Math.max(0, currentTime - 1 / project.fps))}>⏪</button>
            <button className="btn btn-ghost btn-sm" title="Frame forward" onClick={() => setCurrentTime(Math.min(totalDuration, currentTime + 1 / project.fps))}>⏩</button>
            <span className="res-info" style={{ fontSize: 12, color: "var(--text-dim)" }}>{project.width}×{project.height} · {project.fps}fps · {project.format}</span>
            <div className="spacer" style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-sm" onClick={() => setFit(fit === "fit" ? "fill" : "fit")} title="Fit / Fill">{fit === "fit" ? "⛶ Fit" : "⿻ Fill"}</button>
            <button className="btn btn-primary btn-sm" onClick={() => setExportOpen(true)}>Export</button>
          </div>

          {/* mobile tool drawer */}
          <div className="mobile-tools">
            {["✂️ Cut", "🔲 Crop", "T Text", "🔊 Audio", "✨ Effects", "💬 Captions", "🎙 Record", "⋯ More"].map((t) => (
              <button key={t} className="mobile-tool" onClick={() => {
                if (t.startsWith("🎙")) toggleRecord();
                else if (t.startsWith("T Text")) addTextClip();
                else if (t.startsWith("✂️")) splitAtPlayhead();
                else setPanel(t.split(" ")[1].toLowerCase() as any);
              }}>{t}</button>
            ))}
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

        {/* RIGHT: narration / audio / project */}
        <aside className="editor-panel right">
          <div style={{ padding: 16 }}>
            <div className="card-title">Narration</div>
            <textarea
              className="textarea"
              value={project.narration.text}
              onChange={(e) => useEditor.getState().setNarration(e.target.value)}
              placeholder="Script / narration text — used by AI voice…"
              style={{ minHeight: 100 }}
            />
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: "100%" }} onClick={() => {
              const synth = window.speechSynthesis;
              if (!synth) return;
              synth.cancel();
              const u = new SpeechSynthesisUtterance(project.narration.text || "No narration text yet.");
              synth.speak(u);
            }}>▶ Preview Voice (browser)</button>

            <div className="divider" />
            <div className="card-title">Audio Clips ({audioClips.length})</div>
            {audioClips.map((c) => (
              <div key={c.id} className="audio-row" onClick={() => setSelectedClip(c.id)}>
                <span>🎵 {c.name.slice(0, 16)}</span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{c.duration.toFixed(1)}s</span>
              </div>
            ))}
            {!audioClips.length && <p className="hint">Import audio or record your voice to add sound.</p>}

            <div className="divider" />
            <div className="card-title">Project</div>
            <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginBottom: 8 }} onClick={() => mut(() => useEditor.getState().newProject())}>New Project</button>
            <button className="btn btn-ghost btn-sm" style={{ width: "100%" }} onClick={() => {
              import("@/lib/indexeddb/db").then((m) => m.idbSaveProject(project)).then(() => alert("Saved to device"));
            }}>💾 Save to Device</button>
          </div>
        </aside>
      </div>

      {exportOpen && (
        <ExportDialog
          canvas={canvasRef.current}
          duration={totalDuration}
          fps={project.fps}
          onClose={() => setExportOpen(false)}
        />
      )}

      <style>{`
        .audio-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 6px; cursor: pointer; font-size: 12.5px; }
        .audio-row:hover { border-color: var(--accent); }
      `}</style>
    </div>
  );
}
