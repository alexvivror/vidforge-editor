"use client";

// ---------- Media panel (OmniClip-inspired library): asset grid + drag ----------
import { useRef, useState } from "react";
import { useEditor } from "@/stores/useStore";
import { cacheSource } from "@/lib/canvas/sources";
import { generateThumbnail } from "@/lib/canvas/thumbnails";

type Filter = "all" | "video" | "image" | "audio";

export default function MediaPanel() {
  const { assets, addAsset, addClip, currentTime, project, removeAsset } = useEditor();
  const [filter, setFilter] = useState<Filter>("all");
  const videoInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const dragOver = useRef<string | null>(null);

  const importFiles = (files: FileList | null, kind: "video" | "image" | "audio") => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      const url = URL.createObjectURL(file);
      if (kind === "video") {
        const el = document.createElement("video");
        el.src = url; el.muted = true; el.preload = "metadata";
        el.onloadedmetadata = () => {
          cacheSource(url, el);
          addAsset({ id: url, name: file.name, type: "video", duration: el.duration || 0, addedAt: Date.now() });
          void generateThumbnail(el, url).then((t) => t && addAsset({ id: url, name: file.name, type: "video", duration: el.duration || 0, thumb: t, addedAt: Date.now() }));
        };
      } else if (kind === "image") {
        const img = new Image();
        img.src = url;
        img.onload = () => {
          cacheSource(url, img);
          addAsset({ id: url, name: file.name, type: "image", duration: 0, addedAt: Date.now() });
          void generateThumbnail(img, url).then((t) => t && addAsset({ id: url, name: file.name, type: "image", duration: 0, thumb: t, addedAt: Date.now() }));
        };
      } else {
        const el = document.createElement("audio");
        el.src = url; el.preload = "metadata";
        el.onloadedmetadata = () => {
          cacheSource(url, el);
          addAsset({ id: url, name: file.name, type: "audio", duration: el.duration || 0, addedAt: Date.now() });
        };
      }
      // add to timeline immediately at playhead
      if (kind === "video" || kind === "image") {
        const trackIdx = project.tracks.findIndex((t) => t.kind === "video");
        if (trackIdx >= 0) addClip(trackIdx, { src: url, kind, name: file.name, duration: 5, position: currentTime + assets.length * 0.25, start: 0, end: 5 });
      } else if (kind === "audio") {
        const trackIdx = project.tracks.findIndex((t) => t.kind === "audio");
        if (trackIdx >= 0) addClip(trackIdx, { src: url, kind: "audio", name: file.name, duration: 10, position: currentTime, start: 0, end: 10 });
      }
    });
  };

  const addToTimeline = (assetId: string, kind: string) => {
    const trackIdx = kind === "audio" ? project.tracks.findIndex((t) => t.kind === "audio") : project.tracks.findIndex((t) => t.kind === "video");
    if (trackIdx < 0) return;
    const dur = kind === "audio" ? 10 : 5;
    addClip(trackIdx, { src: assetId, kind: kind as any, name: assets.find((a) => a.id === assetId)?.name || "Asset", duration: dur, position: currentTime, start: 0, end: dur });
  };

  const filtered = filter === "all" ? assets : assets.filter((a) => a.type === filter);
  const counts = {
    all: assets.length,
    video: assets.filter((a) => a.type === "video").length,
    image: assets.filter((a) => a.type === "image").length,
    audio: assets.filter((a) => a.type === "audio").length,
  };

  const fmtDur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : `0:${String(Math.floor(s)).padStart(2, "0")}`);

  return (
    <div className="media-panel">
      <div className="media-import">
        <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => videoInput.current?.click()}>
          + Import
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => audioInput.current?.click()} title="Import audio">♪</button>
      </div>
      <input ref={videoInput} type="file" accept="video/*,image/*" multiple hidden onChange={(e) => importFiles(e.target.files, e.target.files?.[0]?.type.startsWith("video") ? "video" : "image")} />
      <input ref={audioInput} type="file" accept="audio/*" multiple hidden onChange={(e) => importFiles(e.target.files, "audio")} />

      <div className="media-filters">
        {(["all", "video", "image", "audio"] as Filter[]).map((f) => (
          <button key={f} className={`media-filter ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f[0].toUpperCase() + f.slice(1)} <span className="mf-count">{counts[f]}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="media-empty">
          <div className="big">🎞️</div>
          <p>No media yet</p>
          <span className="hint">Import or drop files anywhere</span>
        </div>
      ) : (
        <div className="media-grid">
          {filtered.map((a) => (
            <div
              key={a.id}
              className={`media-item ${dragOver.current === a.id ? "dragging" : ""}`}
              draggable
              onDragStart={(e) => { e.dataTransfer.setData("text/plain", a.id); e.dataTransfer.setData("application/x-kind", a.type); dragOver.current = a.id; }}
              onDragEnd={() => { dragOver.current = null; }}
              onClick={() => addToTimeline(a.id, a.type)}
              title={`${a.name} — tap to add at playhead, drag to timeline`}
            >
              {a.type === "audio" ? (
                <div className="media-thumb audio">
                  <span>♪</span>
                  <div className="wave-bars">{Array.from({ length: 14 }).map((_, i) => <i key={i} style={{ height: `${30 + ((i * 13) % 60)}%` }} />)}</div>
                </div>
              ) : a.thumb ? (
                <img className="media-thumb img" src={a.thumb} alt={a.name} loading="lazy" />
              ) : (
                <div className="media-thumb video"><span>🎬</span></div>
              )}
              <div className="media-name">{a.name.replace(/\.[^.]+$/, "").slice(0, 18)}</div>
              <div className="media-meta">
                <span className="media-type">{a.type}</span>
                {a.duration > 0 && <span className="media-dur">{fmtDur(a.duration)}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        .media-panel { display: flex; flex-direction: column; height: 100%; }
        .media-import { display: flex; gap: 6px; margin-bottom: 10px; }
        .media-filters { display: flex; gap: 2px; margin-bottom: 12px; }
        .media-filter { display: flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 6px; font-size: 10.5px; font-weight: 600; color: var(--text-muted); border: none; background: none; cursor: pointer; text-transform: capitalize; }
        .media-filter:hover { background: var(--surface); }
        .media-filter.active { background: var(--surface-2); color: var(--accent); }
        .mf-count { font-size: 9px; background: var(--surface); padding: 0 5px; border-radius: 8px; }
        .media-empty { text-align: center; padding: 32px 12px; color: var(--text-dim); }
        .media-empty .big { font-size: 34px; margin-bottom: 8px; }
        .media-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; overflow-y: auto; padding-bottom: 8px; }
        .media-item { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 6px; cursor: pointer; transition: border-color .12s, transform .1s; }
        .media-item:hover { border-color: var(--accent); }
        .media-item.dragging { opacity: .5; }
        .media-thumb { position: relative; width: 100%; aspect-ratio: 16/10; border-radius: 6px; overflow: hidden; background: var(--surface-2); display: grid; place-items: center; font-size: 20px; }
        .media-thumb.img { object-fit: cover; }
        .media-thumb.audio { background: var(--bg); }
        .wave-bars { position: absolute; inset: 0; display: flex; align-items: center; gap: 2px; padding: 8px; opacity: .8; }
        .wave-bars i { flex: 1; background: var(--accent); opacity: .5; border-radius: 2px; }
        .media-name { font-size: 10.5px; font-weight: 600; margin-top: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .media-meta { display: flex; justify-content: space-between; font-size: 9.5px; color: var(--text-dim); margin-top: 1px; }
        .media-type { text-transform: uppercase; letter-spacing: .5px; }
      `}</style>
    </div>
  );
}