"use client";

// ---------- Timeline: draggable clips, trim handles, split, zoom ----------
// Pure metadata manipulation (no per-frame React). Clips render as absolutely
// positioned blocks; pointer events drive drag/trim with snapping.

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

const TRACK_COLORS: Record<string, string> = {
  video: "rgba(245,197,24,.14)",
  audio: "rgba(74,222,128,.12)",
  text: "rgba(96,165,250,.14)",
};

const SNAP = 0.25; // snap grid seconds

export default function Timeline({
  project, totalDuration, currentTime, selectedClipId,
  onSelect, onUpdateClip, onSplit, onDuplicate, onDelete, onSeek,
}: TimelineProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(60); // px per second
  const [drag, setDrag] = useState<{ clipId: string; mode: "move" | "trimL" | "trimR"; startX: number; origPos: number; origDur: number; origStart: number } | null>(null);

  const pxToSec = (px: number) => px / zoom;
  const width = Math.max(totalDuration + 5, 20) * zoom;

  // ---------- pointer interactions ----------
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
    // snap
    position = Math.round(position / SNAP) * SNAP;
    duration = Math.max(0.1, Math.round(duration / SNAP) * SNAP);
    onUpdateClip(drag.clipId, { position, duration, start });
  };

  const onPointerUp = () => setDrag(null);

  // ---------- ruler click seek ----------
  const onRulerClick = (e: React.MouseEvent) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    onSeek(Math.max(0, (e.clientX - rect.left) / zoom));
  };

  return (
    <div className="timeline-root">
      {/* zoom controls */}
      <div className="timeline-zoom">
        <button className="btn btn-ghost btn-sm" onClick={() => setZoom((z) => Math.max(20, z / 1.4))}>−</button>
        <span style={{ fontSize: 11, color: "var(--text-dim)", minWidth: 60, textAlign: "center" }}>{zoom}px/s</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setZoom((z) => Math.min(200, z * 1.4))}>+</button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={onSplit} title="Split at playhead (S)">✂ Split</button>
      </div>

      <div
        className="timeline-scroll"
        ref={wrapRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* ruler */}
        <div className="timeline-ruler" style={{ width }} onClick={onRulerClick}>
          {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, s) => (
            <span key={s} className="ruler-tick" style={{ left: s * zoom }}>
              <i style={{ position: "absolute", top: 0, left: 0, width: 1, height: 6, background: "var(--border)" }} />
              <em style={{ position: "absolute", top: 8, left: 2, fontSize: 10, color: "var(--text-dim)", fontStyle: "normal" }}>
                {s}s
              </em>
            </span>
          ))}
          {/* playhead */}
          <div className="tl-playhead" style={{ left: currentTime * zoom }} />
        </div>

        {/* tracks */}
        <div style={{ width }}>
          {project.tracks.map((track) => (
            <div key={track.id} className="tl-track" style={{ width }}>
              <div className="tl-track-label">{track.name}</div>
              <div className="tl-track-lane">
                {track.clips.map((clip) => (
                  <div
                    key={clip.id}
                    className={`tl-clip ${selectedClipId === clip.id ? "selected" : ""} ${drag?.clipId === clip.id ? "dragging" : ""}`}
                    style={{
                      left: clip.position * zoom,
                      width: Math.max(6, clip.duration * zoom),
                      background: TRACK_COLORS[track.kind] || "var(--surface-2)",
                    }}
                    onPointerDown={(e) => { onSelect(clip.id); onClipPointerDown(e, clip, "move"); }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="tl-clip-name">{clip.name}</div>
                    <div
                      className="tl-trim tl-trim-l"
                      onPointerDown={(e) => onClipPointerDown(e, clip, "trimL")}
                      title="Trim start"
                    />
                    <div
                      className="tl-trim tl-trim-r"
                      onPointerDown={(e) => onClipPointerDown(e, clip, "trimR")}
                      title="Trim end"
                    />
                    {/* quick actions on selected */}
                    {selectedClipId === clip.id && (
                      <div className="tl-clip-actions">
                        <button onClick={(e) => { e.stopPropagation(); onDuplicate(clip.id); }} title="Duplicate">⧉</button>
                        <button onClick={(e) => { e.stopPropagation(); onDelete(clip.id); }} title="Delete">🗑</button>
                      </div>
                    )}
                  </div>
                ))}
                {track.clips.length === 0 && (
                  <div className="tl-empty" style={{ width }}>Drop media here</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style>{`
        .timeline-root { display: flex; flex-direction: column; gap: 6px; }
        .timeline-zoom { display: flex; align-items: center; gap: 4px; }
        .timeline-scroll { overflow-x: auto; padding-bottom: 8px; }
        .timeline-ruler { position: relative; height: 26px; cursor: pointer; }
        .ruler-tick { position: absolute; top: 0; height: 100%; }
        .tl-playhead { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--accent); z-index: 8; pointer-events: none; }
        .tl-track { position: relative; margin-bottom: 4px; }
        .tl-track-label { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; color: var(--text-dim); margin-bottom: 2px; }
        .tl-track-lane { position: relative; height: 52px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
        .tl-clip { position: absolute; top: 4px; height: 44px; border-radius: 8px; border: 1px solid var(--border); display: flex; align-items: center; padding: 0 8px; font-size: 11px; overflow: hidden; cursor: grab; user-select: none; }
        .tl-clip.selected { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(245,197,24,.2); }
        .tl-clip.dragging { opacity: .7; cursor: grabbing; }
        .tl-clip-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
        .tl-trim { position: absolute; top: 0; bottom: 0; width: 10px; cursor: ew-resize; z-index: 3; }
        .tl-trim-l { left: 0; border-left: 2px solid var(--accent); }
        .tl-trim-r { right: 0; border-right: 2px solid var(--accent); }
        .tl-clip-actions { position: absolute; top: -14px; right: 0; display: flex; gap: 2px; }
        .tl-clip-actions button { background: var(--surface-2); border: 1px solid var(--border); border-radius: 4px; font-size: 10px; padding: 1px 5px; cursor: pointer; }
        .tl-empty { display: grid; place-items: center; height: 52px; color: var(--text-dim); font-size: 11.5px; }
      `}</style>
    </div>
  );
}
