"use client";

// ---------- Timeline: draggable clips, trim handles, split, zoom ----------
// Pure metadata manipulation (no per-frame React). Clips render as absolutely
// positioned blocks; pointer events drive drag/trim with snapping.
// OmniClip-inspired: track headers, thumbnail-backed video clips, clean ruler.

import { useRef, useState, type PointerEvent } from "react";
import type { Clip, Project } from "@/types";

interface TimelineProps {
  project: Project;
  totalDuration: number;
  currentTime: number;
  selectedClipId: string | null;
  onSelect: (id: string | null) => void;
  onUpdateClip: (id: string, patch: Partial<Clip>) => void;
  onSplit: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onSeek: (t: number) => void;
}

const TRACK_META: Record<string, { label: string; color: string }> = {
  video: { label: "Video", color: "#f5c518" },
  image: { label: "Images", color: "#f5c518" },
  text: { label: "Text", color: "#60a5fa" },
  audio: { label: "Audio", color: "#4ade80" },
};

const SNAP = 0.25;

export default function Timeline({
  project, totalDuration, currentTime, selectedClipId,
  onSelect, onUpdateClip, onSplit, onDuplicate, onDelete, onSeek,
}: TimelineProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(60);
  const [drag, setDrag] = useState<{ clipId: string; mode: "move" | "trimL" | "trimR"; startX: number; origPos: number; origDur: number; origStart: number } | null>(null);

  const pxToSec = (px: number) => px / zoom;
  const width = Math.max(totalDuration + 5, 20) * zoom;

  const onClipPointerDown = (e: PointerEvent, clip: Clip, mode: "move" | "trimL" | "trimR") => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ clipId: clip.id, mode, startX: e.clientX, origPos: clip.position, origDur: clip.duration, origStart: clip.start });
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drag) return;
    const dxSec = (e.clientX - drag.startX) / zoom;
    let { position, duration, start } = { position: drag.origPos, duration: drag.origDur, start: drag.origStart };
    if (drag.mode === "move") {
      position = Math.max(0, drag.origPos + dxSec);
    } else if (drag.mode === "trimL") {
      const newStart = Math.max(0, Math.min(drag.origStart + dxSec, drag.origStart + drag.origDur - 0.1));
      start = newStart;
      duration = drag.origDur - (newStart - drag.origStart);
      position = drag.origPos + (newStart - drag.origStart);
    } else if (drag.mode === "trimR") {
      duration = Math.max(0.1, drag.origDur + dxSec);
    }
    position = Math.round(position / SNAP) * SNAP;
    duration = Math.max(0.1, Math.round(duration / SNAP) * SNAP);
    onUpdateClip(drag.clipId, { position, duration, start });
  };

  const onPointerUp = () => setDrag(null);

  const onRulerClick = (e: React.MouseEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    onSeek(Math.max(0, (e.clientX - rect.left) / zoom));
  };

  return (
    <div className="tl-root">
      <div className="tl-toolbar">
        <button className="icon-btn" onClick={onSplit} title="Split at playhead (S)">✂</button>
        <button className="icon-btn" onClick={() => setZoom((z) => Math.max(20, z / 1.4))} title="Zoom out">−</button>
        <span className="tl-zoom">{zoom}px/s</span>
        <button className="icon-btn" onClick={() => setZoom((z) => Math.min(200, z * 1.4))} title="Zoom in">+</button>
        <div style={{ flex: 1 }} />
        <span className="tl-hint">drag to move · edges to trim</span>
      </div>

      <div className="tl-scroll" ref={wrapRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
        {/* ruler */}
        <div className="tl-ruler" style={{ width }} onClick={onRulerClick}>
          {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, s) => (
            <span key={s} className="tl-tick" style={{ left: s * zoom }}>
              <i />
              <em>{s}s</em>
            </span>
          ))}
          <div className="tl-playhead" style={{ left: currentTime * zoom }} />
        </div>

        {/* tracks */}
        <div style={{ width }}>
          {project.tracks.map((track) => {
            const meta = TRACK_META[track.kind] || { label: track.name, color: "#94a3b8" };
            return (
              <div key={track.id} className="tl-track">
                <div className="tl-track-head">
                  <span className="tl-track-dot" style={{ background: meta.color }} />
                  <span className="tl-track-label">{meta.label}</span>
                  <span className="tl-track-count">{track.clips.length}</span>
                </div>
                <div className="tl-lane">
                  {track.clips.map((clip) => (
                    <div
                      key={clip.id}
                      className={`tl-clip ${selectedClipId === clip.id ? "selected" : ""} ${drag?.clipId === clip.id ? "dragging" : ""}`}
                      style={{
                        left: clip.position * zoom,
                        width: Math.max(6, clip.duration * zoom),
                        background: selectedClipId === clip.id ? `${meta.color}2e` : `${meta.color}1a`,
                        borderColor: meta.color,
                      }}
                      onPointerDown={(e) => { onSelect(clip.id); onClipPointerDown(e, clip, "move"); }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {clip.kind === "audio" ? (
                        <div className="tl-clip-audio" style={{ background: `repeating-linear-gradient(180deg, ${meta.color}44 0 2px, transparent 2px 4px)` }} />
                      ) : null}
                      <div className="tl-clip-name">{clip.kind === "text" ? "T " : clip.kind === "image" ? "🖼 " : clip.kind === "audio" ? "♪ " : "🎬 "}{clip.name}</div>
                      <div className="tl-trim tl-trim-l" onPointerDown={(e) => onClipPointerDown(e, clip, "trimL")} title="Trim start" />
                      <div className="tl-trim tl-trim-r" onPointerDown={(e) => onClipPointerDown(e, clip, "trimR")} title="Trim end" />
                      {selectedClipId === clip.id && (
                        <div className="tl-clip-actions">
                          <button onClick={(e) => { e.stopPropagation(); onDuplicate(clip.id); }} title="Duplicate">⧉</button>
                          <button onClick={(e) => { e.stopPropagation(); onDelete(clip.id); }} title="Delete">🗑</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {track.clips.length === 0 && <div className="tl-empty">Drop here</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .tl-root { display: flex; flex-direction: column; gap: 4px; user-select: none; }
        .tl-toolbar { display: flex; align-items: center; gap: 2px; }
        .tl-zoom { font-size: 10.5px; color: var(--text-dim); min-width: 46px; text-align: center; }
        .tl-hint { font-size: 10px; color: var(--text-dim); }
        .tl-scroll { overflow-x: auto; padding-bottom: 4px; }
        .tl-ruler { position: relative; height: 24px; cursor: pointer; }
        .tl-tick { position: absolute; top: 0; height: 100%; }
        .tl-tick i { position: absolute; top: 0; left: 0; width: 1px; height: 6px; background: var(--border-strong); }
        .tl-tick em { position: absolute; top: 7px; left: 3px; font-size: 9.5px; font-style: normal; color: var(--text-dim); }
        .tl-playhead { position: absolute; top: 0; bottom: -14px; width: 2px; background: var(--accent); z-index: 9; pointer-events: none; box-shadow: 0 0 8px rgba(245,197,24,.5); }
        .tl-playhead::before { content: ""; position: absolute; top: 0; left: -3px; border: 4px solid transparent; border-top: 6px solid var(--accent); }
        .tl-track { display: flex; margin-bottom: 2px; }
        .tl-track-head { width: 84px; flex-shrink: 0; display: flex; align-items: center; gap: 5px; padding: 0 6px; font-size: 10px; font-weight: 700; color: var(--text-muted); border: 1px solid var(--border); border-right: none; border-radius: 6px 0 0 6px; background: var(--bg-soft); }
        .tl-track-dot { width: 7px; height: 7px; border-radius: 2px; }
        .tl-track-count { margin-left: auto; font-size: 9px; color: var(--text-dim); }
        .tl-lane { position: relative; flex: 1; height: 46px; border: 1px solid var(--border); border-radius: 0 6px 6px 0; background: var(--bg); }
        .tl-clip { position: absolute; top: 3px; height: 40px; border-radius: 6px; border: 1px solid; display: flex; align-items: center; padding: 0 8px; font-size: 10.5px; overflow: hidden; cursor: grab; z-index: 2; }
        .tl-clip.selected { box-shadow: 0 0 0 2px rgba(245,197,24,.25); z-index: 3; }
        .tl-clip.dragging { opacity: .7; cursor: grabbing; z-index: 5; }
        .tl-clip-name { position: relative; z-index: 2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; color: var(--text); text-shadow: 0 1px 3px rgba(0,0,0,.6); }
        .tl-clip-audio { position: absolute; inset: 0; opacity: .5; }
        .tl-trim { position: absolute; top: 0; bottom: 0; width: 9px; cursor: ew-resize; z-index: 4; }
        .tl-trim-l { left: 0; border-left: 2px solid var(--accent); border-radius: 6px 0 0 6px; }
        .tl-trim-r { right: 0; border-right: 2px solid var(--accent); border-radius: 0 6px 6px 0; }
        .tl-clip-actions { position: absolute; top: -13px; right: 2px; display: flex; gap: 2px; z-index: 6; }
        .tl-clip-actions button { background: var(--surface-2); border: 1px solid var(--border-strong); border-radius: 4px; font-size: 9px; padding: 1px 5px; cursor: pointer; }
        .tl-empty { position: absolute; inset: 0; display: grid; place-items: center; color: var(--text-dim); font-size: 10px; opacity: .5; pointer-events: none; }
      `}</style>
    </div>
  );
}