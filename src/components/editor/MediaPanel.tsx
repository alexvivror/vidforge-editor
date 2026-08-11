"use client";

// ---------- Media panel: asset grid with async thumbnails + drag ----------
import { useRef } from "react";
import { useEditor } from "@/stores/useStore";
import { cacheSource } from "@/lib/canvas/sources";
import { generateThumbnail } from "@/lib/canvas/thumbnails";

export default function MediaPanel() {
  const { assets, addAsset, addClip, currentTime, project, setPanel } = useEditor();
  const videoInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);

  const importFiles = (files: FileList | null, kind: "video" | "image" | "audio") => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const url = URL.createObjectURL(file);
      const pos = currentTime + assets.length * 0.5;
      if (kind === "video") {
        const el = document.createElement("video");
        el.src = url; el.muted = true; el.preload = "metadata";
        el.onloadedmetadata = () => {
          cacheSource(url, el);
          addAsset({ id: url, name: file.name, type: "video", duration: el.duration || 0, addedAt: Date.now() });
          void generateThumbnail(el, url).then((t) => addAsset({ id: url, name: file.name, type: "video", duration: el.duration || 0, thumb: t || undefined, addedAt: Date.now() }));
        };
      } else if (kind === "image") {
        const img = new Image();
        img.src = url;
        img.onload = () => {
          cacheSource(url, img);
          addAsset({ id: url, name: file.name, type: "image", duration: 0, addedAt: Date.now() });
          void generateThumbnail(img, url).then((t) => addAsset({ id: url, name: file.name, type: "image", duration: 0, thumb: t || undefined, addedAt: Date.now() }));
        };
      } else {
        const el = document.createElement("audio");
        el.src = url; el.preload = "metadata";
        el.onloadedmetadata = () => {
          cacheSource(url, el);
          addAsset({ id: url, name: file.name, type: "audio", duration: el.duration || 0, addedAt: Date.now() });
        };
      }
      // add to timeline immediately
      if (kind === "video" || kind === "image") {
        const trackIdx = project.tracks.findIndex((t) => t.kind === "video");
        if (trackIdx >= 0) {
          addClip(trackIdx, { src: url, kind, name: file.name, duration: kind === "video" ? 5 : 5, position: pos, start: 0, end: 5 });
        }
      }
    });
  };

  const addToTimeline = (assetId: string, kind: string) => {
    const pos = currentTime;
    const trackIdx = project.tracks.findIndex((t) => t.kind === kind);
    if (trackIdx < 0) return;
    const dur = kind === "audio" ? 10 : 5;
    addClip(trackIdx, { src: assetId, kind: kind as any, name: assets.find((a) => a.id === assetId)?.name || "Asset", duration: dur, position: pos, start: 0, end: dur });
  };

  return (
    <div className="tool-panel">
      <div className="card-title">Media</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => videoInput.current?.click()}>+ Add Media</button>
        <button className="btn btn-ghost btn-sm" onClick={() => audioInput.current?.click()}>🎵 Audio</button>
      </div>
      <input ref={videoInput} type="file" accept="video/*,image/*" multiple hidden onChange={(e) => importFiles(e.target.files, e.target.files?.[0]?.type.startsWith("audio") ? "audio" : "video")} />
      <input ref={audioInput} type="file" accept="audio/*" multiple hidden onChange={(e) => importFiles(e.target.files, "audio")} />
      <p className="hint" style={{ marginBottom: 12 }}>Drag assets to the timeline, or tap to add at playhead.</p>

      {!assets.length && (
        <div className="empty-state" style={{ padding: 20 }}>
          <div className="big">🎞️</div>
          <p>No media yet. Import a video, image or audio file.</p>
        </div>
      )}

      <div className="asset-grid">
        {assets.map((a) => (
          <div
            key={a.id}
            className="asset-cell"
            draggable
            onDragStart={(e) => { e.dataTransfer.setData("text/plain", a.id); e.dataTransfer.setData("application/x-kind", a.type); }}
            onClick={() => addToTimeline(a.id, a.type)}
            title={a.name}
          >
            {a.type === "audio" ? (
              <div className="asset-icon">🎵</div>
            ) : a.thumb ? (
              <img src={a.thumb} alt={a.name} style={{ width: "100%", height: 54, objectFit: "cover", borderRadius: 6 }} />
            ) : (
              <div className="asset-icon">{a.type === "video" ? "🎬" : "🖼"}</div>
            )}
            <div className="asset-name">{a.name.slice(0, 22)}</div>
            <div className="asset-meta">{a.type}{a.duration ? ` · ${Math.round(a.duration)}s` : ""}</div>
          </div>
        ))}
      </div>

      <style>{`
        .asset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .asset-cell { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 6px; cursor: grab; }
        .asset-cell:hover { border-color: var(--accent); }
        .asset-cell:active { cursor: grabbing; }
        .asset-icon { height: 54px; display: grid; place-items: center; background: var(--surface-2); border-radius: 6px; font-size: 22px; }
        .asset-name { font-size: 11px; font-weight: 600; margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .asset-meta { font-size: 10px; color: var(--text-dim); }
      `}</style>
    </div>
  );
}
