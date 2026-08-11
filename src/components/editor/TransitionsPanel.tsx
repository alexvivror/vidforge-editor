"use client";

// ---------- Transitions panel: metadata-only, applied between adjacent clips ----------
import { useState } from "react";
import { useEditor } from "@/stores/useStore";

const TRANSITIONS = ["none", "Fade", "Crossfade", "Slide", "Zoom", "Wipe"];

export default function TransitionsPanel() {
  const { project, selectedClipId, updateClip } = useEditor();
  const [dur, setDur] = useState(0.5);
  const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId);

  return (
    <div className="tool-panel">
      <div className="card-title">Transitions</div>
      <p className="hint" style={{ marginBottom: 12 }}>
        Select a clip, choose a transition — it applies at the clip's start edge.
      </p>
      <div className="trans-grid">
        {TRANSITIONS.map((t) => (
          <button
            key={t}
            className={`trans-cell ${clip?.transition === t ? "active" : ""}`}
            onClick={() => clip && updateClip(clip.id, { transition: t })}
          >
            <span className="trans-icon">
              {t === "none" ? "▭" : t === "Fade" ? "◐" : t === "Crossfade" ? "◎" : t === "Slide" ? "⇄" : t === "Zoom" ? "⊕" : "▤"}
            </span>
            <em>{t}</em>
          </button>
        ))}
      </div>
      <div className="field" style={{ marginTop: 14 }}>
        <label>Duration ({dur.toFixed(1)}s)</label>
        <input className="input range" type="range" min={0.1} max={2} step={0.1} value={dur} onChange={(e) => setDur(+e.target.value)} />
      </div>
      {!clip && <p className="hint" style={{ marginTop: 10 }}>No clip selected — select one on the timeline first.</p>}

      <style>{`
        .trans-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .trans-cell { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; }
        .trans-cell.active { border-color: var(--accent); background: rgba(245,197,24,.08); }
        .trans-cell:hover { border-color: var(--accent); }
        .trans-icon { font-size: 20px; }
        .trans-cell em { font-style: normal; font-size: 10.5px; font-weight: 600; }
      `}</style>
    </div>
  );
}
