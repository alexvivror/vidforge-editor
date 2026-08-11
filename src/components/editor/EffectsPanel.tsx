"use client";

// ---------- Effects panel: sliders, non-destructive (metadata on clip) ----------
import { useEditor } from "@/stores/useStore";

const SLIDERS = [
  { key: "brightness", label: "Brightness", min: -100, max: 100, def: 0 },
  { key: "contrast", label: "Contrast", min: -100, max: 100, def: 0 },
  { key: "saturation", label: "Saturation", min: -100, max: 100, def: 0 },
  { key: "blur", label: "Blur", min: 0, max: 20, def: 0 },
  { key: "vignette", label: "Vignette", min: 0, max: 100, def: 0 },
] as const;

const QUICK = ["none", "grayscale", "sepia", "invert", "sharpen"];

export default function EffectsPanel() {
  const { project, selectedClipId, updateClip } = useEditor();
  const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipId);

  const setFx = (key: string, value: number) => {
    if (!clip) return;
    const fx = { ...(clip.fx || {}), [key]: value };
    updateClip(clip.id, { fx });
  };

  return (
    <div className="tool-panel">
      <div className="card-title">Effects</div>
      {!clip ? (
        <p className="hint">Select a video or image clip on the timeline to add effects.</p>
      ) : (
        <>
          <div className="card-title" style={{ fontSize: 11.5 }}>Quick</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {QUICK.map((q) => (
              <button key={q} className={`pill ${clip.effects?.[0] === q ? "active" : ""}`}
                onClick={() => updateClip(clip.id, { effects: [q] })}>
                {q}
              </button>
            ))}
          </div>
          <div className="card-title" style={{ fontSize: 11.5 }}>Adjust</div>
          {SLIDERS.map((s) => (
            <div className="fx-row" key={s.key}>
              <div className="fx-label">
                <span>{s.label}</span>
                <span className="fx-val">{Math.round((clip.fx || {})[s.key] ?? s.def)}</span>
              </div>
              <input
                className="input range"
                type="range"
                min={s.min} max={s.max} step={1}
                value={(clip.fx || {})[s.key] ?? s.def}
                onChange={(e) => setFx(s.key, +e.target.value)}
              />
            </div>
          ))}
          <p className="hint" style={{ marginTop: 10 }}>Effects are non-destructive — applied at render.</p>
        </>
      )}

      <style>{`
        .fx-row { margin-bottom: 10px; }
        .fx-label { display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; margin-bottom: 3px; }
        .fx-val { color: var(--text-dim); font-weight: 500; }
        .range { width: 100%; accent-color: var(--accent); }
      `}</style>
    </div>
  );
}
