"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Topbar from "@/components/Topbar";
import { useEditor } from "@/stores/useStore";
import { applyEffect, recordCanvas } from "@/lib/webcodecs/codecs";
import { cacheSource, getSource } from "@/lib/canvas/sources";
import type { Clip } from "@/types";

const EFFECTS = [
  "none", "grayscale", "sepia", "vignette", "blur", "invert", "contrast",
];

export default function EditorPage() {
  const { project, currentTime, setCurrentTime, playing, setPlaying, addClip, updateClip, removeClip, selectedClipId, setSelectedClip, setPanel, activePanel } = useEditor();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [exportState, setExportState] = useState<{ pct: number; url?: string; mime?: string } | null>(null);
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);

  const totalDuration = Math.max(10, ...project.tracks.flatMap((t) => t.clips.map((c) => c.position + c.duration)));

  // ---------- render loop ----------
  const draw = useCallback((ts: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (playing && lastTsRef.current) {
      const dt = (ts - lastTsRef.current) / 1000;
      setCurrentTime(Math.min(totalDuration, currentTime + dt));
    }
    lastTsRef.current = ts;

    // draw clips that overlap currentTime
    for (const track of project.tracks) {
      for (const clip of track.clips) {
        const local = currentTime - clip.position;
        if (local < 0 || local > clip.duration) continue;
        const src = getSource(clip.src || clip.id);
        if (!src) continue;
        drawClip(ctx, canvas, clip, src, local);
      }
    }
    rafRef.current = requestAnimationFrame(draw);
  }, [project, currentTime, playing, setCurrentTime, totalDuration]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  // keep time in sync for preview
  useEffect(() => { setCurrentTime(currentTime); }, []);

  // ---------- import ----------
  const onFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file, i) => {
      const url = URL.createObjectURL(file);
      const isVideo = file.type.startsWith("video");
      const isImage = file.type.startsWith("image");
      if (isVideo) {
        const el = document.createElement("video");
        el.src = url;
        el.muted = true;
        el.preload = "metadata";
        el.onloadedmetadata = () => {
          cacheSource(url, el);
          addClip(0, { src: url, kind: "video", name: file.name, duration: Math.min(el.duration || 5, 30), position: currentTime, start: 0, end: el.duration || 5 });
        };
      } else if (isImage) {
        const img = new Image();
        img.src = url;
        img.onload = () => {
          cacheSource(url, img);
          addClip(0, { src: url, kind: "image", name: file.name, duration: 5, position: currentTime + i * 5.5, start: 0, end: 5 });
        };
      }
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    onFiles(e.dataTransfer.files);
  };

  // ---------- export ----------
  const exportVideo = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setExportState({ pct: 0 });
    // export renders at project resolution
    try {
      const blob = await recordCanvas(canvas, totalDuration, project.fps, null, (pct) => setExportState({ pct }));
      setExportState({ pct: 100, url: URL.createObjectURL(blob), mime: blob.type });
    } catch (e: any) {
      setExportState({ pct: 0, url: undefined });
      console.error("export failed", e);
    }
  };

  // ---------- helpers ----------
  const clipAt = (id: string) => project.tracks.flatMap((t) => t.clips).find((c) => c.id === id);
  const sel = clipAt(selectedClipId || "");

  return (
    <div className="page">
      <Topbar />
      <div className="editor-layout"
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {/* LEFT: media / tools */}
        <aside className="editor-panel">
          <div style={{ padding: 16 }}>
            <div className="card-title">Media</div>
            <button className="btn btn-primary" style={{ width: "100%", marginBottom: 12 }} onClick={() => fileInputRef.current?.click()}>
              Import Media
            </button>
            <input ref={fileInputRef} type="file" accept="video/*,image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
            <p className="hint" style={{ marginBottom: 16 }}>Drop video/image files anywhere, or click Import.</p>

            <div className="divider" />
            <div className="card-title">Tools</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {["Trim", "Split", "Crop", "Rotate", "Flip", "Speed", "Text", "Effects"].map((t) => (
                <button key={t} className="btn btn-ghost btn-sm" onClick={() => setPanel(t.toLowerCase() as any)}>{t}</button>
              ))}
            </div>
            {activePanel && sel && (
              <div className="card" style={{ marginTop: 12, padding: 12 }}>
                <div className="card-title">Clip: {sel.name.slice(0, 18)}</div>
                <div className="field"><label>Position (s)</label>
                  <input className="input" type="number" value={Math.round(sel.position * 10) / 10} onChange={(e) => updateClip(sel.id, { position: +e.target.value })} />
                </div>
                <div className="field"><label>Duration (s)</label>
                  <input className="input" type="number" value={Math.round(sel.duration * 10) / 10} onChange={(e) => updateClip(sel.id, { duration: Math.max(0.1, +e.target.value) })} />
                </div>
                <div className="field"><label>Volume</label>
                  <input className="input" type="range" min={0} max={1} step={0.05} value={sel.volume} onChange={(e) => updateClip(sel.id, { volume: +e.target.value })} />
                </div>
                <div className="field"><label>Speed</label>
                  <input className="input" type="range" min={0.25} max={3} step={0.25} value={sel.speed || 1} onChange={(e) => updateClip(sel.id, { speed: +e.target.value })} />
                </div>
                <div className="field"><label>Opacity</label>
                  <input className="input" type="range" min={0} max={1} step={0.05} value={sel.opacity || 1} onChange={(e) => updateClip(sel.id, { opacity: +e.target.value })} />
                </div>
                <div className="field"><label>Effect</label>
                  <select className="select" value={sel.effects?.[0] || "none"} onChange={(e) => updateClip(sel.id, { effects: [e.target.value] })}>
                    {EFFECTS.map((fx) => <option key={fx} value={fx}>{fx}</option>)}
                  </select>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => { removeClip(sel.id); setSelectedClip(null); }}>Delete Clip</button>
              </div>
            )}
            {activePanel && !sel && <p className="hint" style={{ marginTop: 12 }}>Select a clip on the timeline to edit it.</p>}
          </div>
        </aside>

        {/* CENTER: preview + timeline */}
        <div className="editor-center">
          <div className="preview-wrap" style={{ background: dragging ? "rgba(245,197,24,.08)" : "#000" }}>
            <canvas ref={canvasRef} width={project.width} height={project.height} className="preview-canvas" style={{ maxWidth: "100%", maxHeight: "100%", aspectRatio: `${project.width}/${project.height}` }} />
            <div className="preview-time">{currentTime.toFixed(1)}s / {totalDuration.toFixed(1)}s</div>
          </div>

          <div className="transport">
            <button className="btn-play" onClick={() => { setPlaying(!playing); if (currentTime >= totalDuration) setCurrentTime(0); }}>
              {playing ? (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{project.width}×{project.height} · {project.fps}fps · {project.format}</span>
            <div className="spacer" style={{ flex: 1 }} />
            <button className="btn btn-ghost btn-sm" onClick={() => setCurrentTime(0)}>⏮</button>
            <button className="btn btn-primary btn-sm" onClick={exportVideo} disabled={!!exportState && exportState.pct < 100}>
              {exportState && exportState.pct < 100 ? `Exporting ${Math.round(exportState.pct)}%…` : "Export Video"}
            </button>
          </div>

          <div className="timeline-wrap">
            {project.tracks.map((track, ti) => (
              <div className="timeline-track" key={track.id}>
                <div className="timeline-track-label">{track.name}</div>
                <div className="timeline-clips" onClick={() => setSelectedClip(null)}>
                  {track.clips.map((clip) => (
                    <div
                      key={clip.id}
                      className={`timeline-clip ${selectedClipId === clip.id ? "selected" : ""}`}
                      style={{ left: `${(clip.position / totalDuration) * 100}%`, width: `${(clip.duration / totalDuration) * 100}%`, minWidth: 60 }}
                      onClick={(e) => { e.stopPropagation(); setSelectedClip(clip.id); }}
                      title={clip.name}
                    >
                      <span className="clip-name">🎬 {clip.name}</span>
                    </div>
                  ))}
                  <div className="playhead" style={{ left: `${(currentTime / totalDuration) * 100}%` }} />
                </div>
              </div>
            ))}
            {/* ruler */}
            <div className="timeline-ruler">
              {Array.from({ length: Math.ceil(totalDuration / 5) + 1 }).map((_, i) => (
                <span key={i} style={{ position: "absolute", left: `${(i * 5 / totalDuration) * 100}%`, fontSize: 10, color: "var(--text-dim)", transform: "translateX(-50%)" }}>
                  {i * 5}s
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: narration / AI panel */}
        <aside className="editor-panel right">
          <div style={{ padding: 16 }}>
            <div className="card-title">Narration</div>
            <textarea
              className="textarea"
              value={project.narration.text}
              onChange={(e) => useEditor.getState().setNarration(e.target.value)}
              placeholder="Script / narration text — used by AI voice…"
              style={{ minHeight: 120 }}
            />
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: "100%" }} onClick={() => {
              const synth = window.speechSynthesis;
              if (!synth) return;
              synth.cancel();
              const u = new SpeechSynthesisUtterance(project.narration.text || "No narration text yet.");
              synth.speak(u);
            }}>▶ Preview Voice (browser)</button>
            <div className="divider" />
            <div className="card-title">Project</div>
            <button className="btn btn-ghost btn-sm" style={{ width: "100%", marginBottom: 8 }} onClick={() => useEditor.getState().newProject()}>New Project</button>
            {exportState?.url && (
              <div className="success-box" style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 8 }}>✅ Export ready ({exportState.mime})</div>
                <a className="btn btn-primary btn-sm" href={exportState.url} download={`vidforge-${project.name}.${exportState.mime?.includes("mp4") ? "mp4" : "webm"}`}>⬇ Download</a>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ---------- clip drawing ----------
function drawClip(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  clip: Clip,
  src: { el: HTMLVideoElement | HTMLImageElement; w: number; h: number },
  local: number
) {
  const cw = canvas.width, ch = canvas.height;
  ctx.save();
  ctx.globalAlpha = clip.opacity ?? 1;

  // fit source into canvas (contain), then apply user scale/rotation/position
  const fit = Math.min(cw / src.w, ch / src.h);
  const dw = src.w * fit * (clip.scale || 1);
  const dh = src.h * fit * (clip.scale || 1);
  const cx = cw / 2 + ((clip.x || 0) / 100) * cw;
  const cy = ch / 2 + ((clip.y || 0) / 100) * ch;
  ctx.translate(cx, cy);
  ctx.rotate(((clip.rotation || 0) * Math.PI) / 180);
  if (clip.flipped) ctx.scale(-1, 1);
  ctx.drawImage(src.el as CanvasImageSource, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();

  // effects
  const fx = clip.effects?.[0];
  if (fx && fx !== "none") {
    const snapshot = ctx.getImageData(0, 0, cw, ch);
    if (fx === "blur") {
      const tmp = document.createElement("canvas");
      tmp.width = cw; tmp.height = ch;
      const tctx = tmp.getContext("2d")!;
      tctx.filter = "blur(8px)";
      tctx.drawImage(canvas, 0, 0);
      ctx.putImageData(ctx.getImageData(0, 0, cw, ch), 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(tmp, 0, 0);
    } else if (fx === "invert" || fx === "contrast") {
      const d = snapshot.data;
      for (let i = 0; i < d.length; i += 4) {
        if (fx === "invert") { d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2]; }
        else { d[i] = d[i] * 1.3 > 255 ? 255 : d[i] * 1.3; d[i + 1] = d[i + 1] * 1.3 > 255 ? 255 : d[i + 1] * 1.3; d[i + 2] = d[i + 2] * 1.3 > 255 ? 255 : d[i + 2] * 1.3; }
      }
      ctx.putImageData(snapshot, 0, 0);
    } else if (fx === "grayscale" || fx === "sepia") {
      const processed = applyEffect(canvas, fx, cw, ch);
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(processed, 0, 0);
    } else if (fx === "vignette") {
      const grad = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.55)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cw, ch);
    }
  }
}
