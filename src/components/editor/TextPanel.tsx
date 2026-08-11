"use client";

// ---------- Text tool panel: presets + add text ----------
import { useEditor } from "@/stores/useStore";

const PRESETS = [
  { name: "Title", fontSize: 72, fontWeight: 800 },
  { name: "Subtitle", fontSize: 48, fontWeight: 600 },
  { name: "Lower Third", fontSize: 40, fontWeight: 700 },
  { name: "Quote", fontSize: 44, fontWeight: 600 },
  { name: "Caption", fontSize: 32, fontWeight: 600 },
];

export default function TextPanel() {
  const { addClip, currentTime, project, setSelectedClip, setPanel } = useEditor();

  const addText = (preset?: (typeof PRESETS)[number]) => {
    const trackIdx = project.tracks.findIndex((t) => t.kind === "text");
    const clip = addClip(trackIdx < 0 ? 1 : trackIdx, {
      kind: "text", name: preset?.name || "Text",
      text: preset?.name === "Quote" ? "“Quote”" : preset?.name || "Your text",
      duration: 4, position: currentTime, start: 0, end: 4,
      fontSize: preset?.fontSize || 56, fontWeight: preset?.fontWeight || 700,
      color: "#ffffff", animation: "fade",
    });
  };

  return (
    <div className="tool-panel">
      <div className="card-title">Text</div>
      <button className="btn btn-primary btn-sm" style={{ width: "100%", marginBottom: 12 }} onClick={() => addText()}>+ Add Text</button>
      <div className="card-title" style={{ fontSize: 11.5 }}>Presets</div>
      <div className="preset-grid">
        {PRESETS.map((p) => (
          <button key={p.name} className="text-preset" onClick={() => { addText(p); setPanel(null); }}>
            <span style={{ fontSize: Math.min(18, p.fontSize / 3) }}>{p.name === "Quote" ? "“ ”" : "Aa"}</span>
            <em>{p.name}</em>
          </button>
        ))}
      </div>
      <p className="hint" style={{ marginTop: 12 }}>Select a text clip on the timeline to edit its style.</p>

      <style>{`
        .preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .text-preset { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; cursor: pointer; }
        .text-preset:hover { border-color: var(--accent); }
        .text-preset em { font-style: normal; font-size: 11px; font-weight: 600; }
      `}</style>
    </div>
  );
}
