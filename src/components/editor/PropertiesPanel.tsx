"use client";

// ---------- Right Properties panel: contextual, expandable sections ----------
import { useState } from "react";
import { useEditor } from "@/stores/useStore";

export default function PropertiesPanel() {
  const { project, selectedClipId, updateClip, removeClip, setSelectedClip, audioClips } = useEditor() as any;
  const [open, setOpen] = useState<Record<string, boolean>>({ Transform: true, Appearance: true, Audio: true });
  const clip = project.tracks.flatMap((t: any) => t.clips).find((c: any) => c.id === selectedClipId);

  const section = (title: string, body: React.ReactNode) => (
    <div className="prop-section">
      <button className="prop-head" onClick={() => setOpen((o) => ({ ...o, [title]: !o[title] }))} aria-expanded={!!open[title]}>
        <span>{title}</span><span className="prop-caret">{open[title] ? "▾" : "▸"}</span>
      </button>
      {open[title] && <div className="prop-body">{body}</div>}
    </div>
  );

  const row = (label: string, control: React.ReactNode) => (
    <div className="prop-row"><span className="prop-label">{label}</span>{control}</div>
  );

  if (!clip) {
    return (
      <div className="properties-empty">
        <div className="pe-icon">▦</div>
        <p>Nothing selected</p>
        <p className="sub" style={{ fontSize: 11.5 }}>Select a clip on the timeline to edit it.</p>
      </div>
    );
  }

  const set = (patch: Record<string, unknown>) => updateClip(clip.id, patch);

  return (
    <div className="properties">
      <div className="prop-title">
        <span style={{ textTransform: "capitalize" }}>{clip.kind}</span>
        <span className="sub">{clip.name.slice(0, 20)}</span>
      </div>

      {section("Transform", (
        <>
          {row("Position X", <input className="input sm" type="number" step={1} value={Math.round(clip.x || 0)} onChange={(e) => set({ x: +e.target.value })} />)}
          {row("Position Y", <input className="input sm" type="number" step={1} value={Math.round(clip.y || 0)} onChange={(e) => set({ y: +e.target.value })} />)}
          {row("Scale", <input className="input range" type="range" min={0.1} max={3} step={0.05} value={clip.scale || 1} onChange={(e) => set({ scale: +e.target.value })} />)}
          {row("Rotation", <input className="input range" type="range" min={-180} max={180} step={1} value={clip.rotation || 0} onChange={(e) => set({ rotation: +e.target.value })} />)}
          {row("Flip", <label className="checkbox-row"><input type="checkbox" checked={!!clip.flipped} onChange={(e) => set({ flipped: e.target.checked })} /> Horizontal</label>)}
          {row("Opacity", <input className="input range" type="range" min={0} max={1} step={0.05} value={clip.opacity ?? 1} onChange={(e) => set({ opacity: +e.target.value })} />)}
          {clip.kind !== "text" && row("Speed", <input className="input range" type="range" min={0.25} max={4} step={0.25} value={clip.speed || 1} onChange={(e) => set({ speed: +e.target.value })} />)}
        </>
      ))}

      {clip.kind === "text" && section("Text Style", (
        <>
          {row("Text", <input className="input sm" value={clip.text || ""} onChange={(e) => set({ text: e.target.value })} />)}
          {row("Font size", <input className="input range" type="range" min={16} max={160} step={2} value={clip.fontSize || 56} onChange={(e) => set({ fontSize: +e.target.value })} />)}
          {row("Weight", <select className="select sm" value={clip.fontWeight || 700} onChange={(e) => set({ fontWeight: +e.target.value })}>
            <option value={400}>Regular</option><option value={600}>Semibold</option><option value={700}>Bold</option><option value={800}>Extrabold</option>
          </select>)}
          {row("Align", <select className="select sm" value={clip.textAlign || "center"} onChange={(e) => set({ textAlign: e.target.value })}>
            <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
          </select>)}
          {row("Color", <input className="input sm" type="color" value={clip.color || "#ffffff"} onChange={(e) => set({ color: e.target.value })} />)}
          {row("Background", <input className="input sm" type="color" value={clip.background && clip.background !== "none" ? clip.background : "#000000"} onChange={(e) => set({ background: e.target.value === "#000000" ? "rgba(0,0,0,.65)" : e.target.value })} />)}
        </>
      ))}

      {clip.kind === "audio" && section("Audio", (
        <>
          {row("Volume", <input className="input range" type="range" min={0} max={1} step={0.05} value={clip.volume ?? 1} onChange={(e) => set({ volume: +e.target.value })} />)}
          {row("Mute", <label className="checkbox-row"><input type="checkbox" checked={!!clip.muted} onChange={(e) => set({ muted: e.target.checked })} /> Muted</label>)}
          {row("Fade in", <input className="input sm" type="number" step={0.1} min={0} value={clip.fadeIn || 0} onChange={(e) => set({ fadeIn: +e.target.value })} />)}
          {row("Fade out", <input className="input sm" type="number" step={0.1} min={0} value={clip.fadeOut || 0} onChange={(e) => set({ fadeOut: +e.target.value })} />)}
        </>
      ))}

      {clip.kind !== "text" && section("Appearance", (
        <>
          {row("Effect", <select className="select sm" value={clip.effects?.[0] || "none"} onChange={(e) => set({ effects: [e.target.value] })}>
            {["none", "grayscale", "sepia", "invert", "blur", "sharpen", "vignette"].map((fx) => <option key={fx} value={fx}>{fx}</option>)}
          </select>)}
          {row("Transition", <select className="select sm" value={clip.transition || "none"} onChange={(e) => set({ transition: e.target.value })}>
            {["none", "Fade", "Crossfade", "Slide", "Zoom", "Wipe"].map((t) => <option key={t} value={t}>{t}</option>)}
          </select>)}
        </>
      ))}

      {clip.kind === "text" && section("Animation", (
        <>
          {row("Entrance", <select className="select sm" value={clip.animation || "none"} onChange={(e) => set({ animation: e.target.value })}>
            {["none", "fade", "slide-in", "zoom"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>)}
        </>
      ))}

      <div style={{ display: "flex", gap: 8, padding: "4px 12px 14px" }}>
        <button className="btn btn-ghost btn-sm" onClick={() => {
          const trackIdx = project.tracks.findIndex((t: any) => t.clips.some((c: any) => c.id === clip.id));
          const c = { ...clip, id: undefined, position: (clip.position || 0) + (clip.duration || 1) };
          if (trackIdx >= 0) useEditor.getState().addClip(trackIdx, c);
        }}>⧉ Duplicate</button>
        <button className="btn btn-danger btn-sm" style={{ marginLeft: "auto" }} onClick={() => { removeClip(clip.id); setSelectedClip(null); }}>Delete</button>
      </div>

      <style>{`
        .prop-section { border-bottom: 1px solid var(--border); }
        .prop-head { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 9px 12px; background: none; border: none; cursor: pointer; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: .6px; color: var(--text); }
        .prop-head:hover { background: var(--surface); }
        .prop-caret { color: var(--text-dim); }
        .prop-body { padding: 2px 12px 12px; }
        .prop-row { display: grid; grid-template-columns: 88px 1fr; align-items: center; gap: 8px; margin-bottom: 8px; }
        .prop-label { font-size: 11.5px; color: var(--text-dim); font-weight: 600; }
        .input.sm { width: 100%; padding: 5px 8px; font-size: 12px; }
        .select.sm { width: 100%; padding: 5px 8px; font-size: 12px; }
        .input.range { width: 100%; accent-color: var(--accent); }
        .prop-title { display: flex; justify-content: space-between; align-items: baseline; padding: 12px; border-bottom: 1px solid var(--border); font-weight: 700; }
        .properties-empty { padding: 40px 16px; text-align: center; color: var(--text-dim); }
        .pe-icon { font-size: 26px; margin-bottom: 8px; color: var(--text-dim); opacity: .6; }
      `}</style>
    </div>
  );
}
