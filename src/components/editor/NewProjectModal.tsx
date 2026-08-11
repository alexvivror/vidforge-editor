"use client";

// ---------- New Project modal: name / aspect / resolution / fps / presets ----------
import { useState } from "react";
import { useEditor } from "@/stores/useStore";
import type { Project } from "@/types";

const ASPECTS = [
  { id: "16:9", label: "16:9", w: 1920, h: 1080 },
  { id: "9:16", label: "9:16", w: 1080, h: 1920 },
  { id: "1:1", label: "1:1", w: 1080, h: 1080 },
  { id: "4:5", label: "4:5", w: 1080, h: 1350 },
] as const;

const PRESETS = [
  { name: "YouTube", w: 1920, h: 1080, fps: 30 },
  { name: "YouTube Shorts", w: 1080, h: 1920, fps: 30 },
  { name: "Instagram Reel", w: 1080, h: 1920, fps: 30 },
  { name: "Instagram Post", w: 1080, h: 1080, fps: 30 },
  { name: "TikTok", w: 1080, h: 1920, fps: 30 },
  { name: "Custom", w: 1280, h: 720, fps: 30 },
] as const;

interface Props {
  onClose: () => void;
  onCreate: (project: Partial<Project>) => void;
}

export default function NewProjectModal({ onClose, onCreate }: Props) {
  const [name, setName] = useState("My Video");
  const [aspect, setAspect] = useState<"16:9" | "9:16" | "1:1" | "4:5">("16:9");
  const [resIdx, setResIdx] = useState(1); // 0=720p, 1=1080p, 2=custom
  const [fps, setFps] = useState(30);
  const [customW, setCustomW] = useState(1280);
  const [customH, setCustomH] = useState(720);
  const [preset, setPreset] = useState<string>("");

  const applyPreset = (p: (typeof PRESETS)[number]) => {
    setPreset(p.name);
    setCustomW(p.w);
    setCustomH(p.h);
    setAspect(p.w > p.h ? "16:9" : p.w === p.h ? "1:1" : "9:16");
    setFps(p.fps);
  };

  const aspectDim = ASPECTS.find((a) => a.id === aspect)!;
  const width = resIdx === 0 ? (aspect === "9:16" || aspect === "4:5" ? 1080 : 1280) : resIdx === 1 ? aspectDim.w : customW;
  const height = resIdx === 0 ? (aspect === "9:16" || aspect === "4:5" ? 1920 : 720) : resIdx === 1 ? aspectDim.h : customH;

  const create = () => {
    onCreate({
      name: name.trim() || "My Video",
      width, height, fps,
      format: aspect,
      duration: 0,
    } as Partial<Project>);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-head">
          <h3>New Project</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">
          <div className="field">
            <label>Name</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div className="field">
            <label>Presets</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PRESETS.map((p) => (
                <button key={p.name} className={`pill ${preset === p.name ? "active" : ""}`} onClick={() => applyPreset(p)}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Aspect Ratio</label>
            <div className="format-cards" style={{ maxWidth: 420 }}>
              {ASPECTS.map((a) => (
                <div key={a.id} className={`format-card ${aspect === a.id ? "active" : ""}`} onClick={() => { setAspect(a.id); setPreset(""); }}>
                  <div className="ratio" style={{ width: a.id === "16:9" ? 34 : 22, height: a.id === "9:16" ? 24 : a.id === "1:1" ? 28 : 30 }}>
                    {a.id}
                  </div>
                  {a.id === "16:9" ? "Landscape" : a.id === "9:16" ? "Vertical" : a.id === "1:1" ? "Square" : "Portrait"}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="field">
              <label>Resolution</label>
              <select className="select" value={resIdx} onChange={(e) => setResIdx(+e.target.value)}>
                <option value={0}>720p</option>
                <option value={1}>1080p</option>
                <option value={2}>Custom</option>
              </select>
            </div>
            <div className="field">
              <label>Frame Rate</label>
              <select className="select" value={fps} onChange={(e) => setFps(+e.target.value)}>
                <option value={24}>24 FPS</option>
                <option value={30}>30 FPS</option>
                <option value={60}>60 FPS</option>
              </select>
            </div>
          </div>

          {resIdx === 2 && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div className="field"><label>Width</label><input className="input" type="number" value={customW} onChange={(e) => setCustomW(+e.target.value)} /></div>
              <div className="field"><label>Height</label><input className="input" type="number" value={customH} onChange={(e) => setCustomH(+e.target.value)} /></div>
            </div>
          )}

          <div className="hint" style={{ marginTop: 12 }}>
            Canvas: <strong>{width}×{height}</strong> · {aspect} · {fps} FPS
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={create}>Create Project</button>
        </div>
      </div>
    </div>
  );
}
