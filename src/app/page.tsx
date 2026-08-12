"use client";

// Home — projects dashboard (editor-first, no AI)
// Actions: New Project (canvas presets), Import Project, open recent projects.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import NewProjectModal from "@/components/editor/NewProjectModal";
import { useEditor } from "@/stores/useStore";
import { idbListProjects, idbDeleteProject, idbGetThumb, idbLoadProject, idbSaveProject, formatBytes, idbStorageUsage } from "@/lib/indexeddb/db";
import type { Project } from "@/types";

export default function HomePage() {
  const router = useRouter();
  const { createProject } = useEditor();
  const [projects, setProjects] = useState<any[]>([]);
  const [usage, setUsage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const list = (await idbListProjects()) as any[];
    const withThumbs = await Promise.all(
      list.map(async (p) => ({ ...p, thumb: await idbGetThumb(p.id).catch(() => undefined) }))
    );
    withThumbs.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    setProjects(withThumbs);
    const { bytes } = await idbStorageUsage();
    setUsage(formatBytes(bytes));
    setLoaded(true);
  };

  useEffect(() => { void refresh(); }, []);

  const openProject = async (id: string) => {
    const loaded = await idbLoadProject(id);
    if (loaded) {
      const p = loaded as any;
      createProject({
        id: p.id, name: p.name, width: p.width, height: p.height, fps: p.fps,
        format: p.format, tracks: p.tracks, narration: p.narration, duration: p.duration,
      });
      router.push("/editor");
    }
  };

  const removeProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this project?")) return;
    await idbDeleteProject(id);
    void refresh();
  };

  const renameProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenameId(id);
    setRenameVal(projects.find((p) => p.id === id)?.name || "");
  };

  const submitRename = async () => {
    if (!renameId) return;
    const proj = (await idbLoadProject(renameId)) as any;
    if (proj) {
      proj.name = renameVal.trim() || proj.name;
      proj.updatedAt = Date.now();
      await idbSaveProject(proj);
    }
    setRenameId(null);
    void refresh();
  };

  const duplicateProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const proj = (await idbLoadProject(id)) as any;
    if (!proj) return;
    const copy = {
      ...structuredClone(proj),
      id: Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      name: `${proj.name} (copy)`, updatedAt: Date.now(),
    };
    await idbSaveProject(copy);
    void refresh();
  };

  const exportProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const proj = await idbLoadProject(id);
    if (!proj) return;
    const blob = new Blob([JSON.stringify(proj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(proj as any).name || "project"}.vidforge.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importProject = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const proj = JSON.parse(String(reader.result));
        if (!proj.id || !proj.tracks) throw new Error("Not a valid project file");
        proj.id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
        proj.updatedAt = Date.now();
        await idbSaveProject(proj);
        void refresh();
      } catch (e) {
        alert("Couldn't import project: " + String(e));
      }
    };
    reader.readAsText(file);
  };

  const fmtDur = (s: number) =>
    s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : `0:${String(Math.max(0, Math.floor(s))).padStart(2, "0")}`;
  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className="page">
      <Topbar />
      <main className="container">
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
          <h1 style={{ margin: 0 }}>Projects</h1>
          <span className="sub">{usage ? `${usage} used locally` : ""}</span>
        </div>
        <p className="sub" style={{ marginBottom: 24 }}>Your videos stay on this device.</p>

        <div className="grid-3" style={{ marginBottom: 32 }}>
          <button className="card action-card" onClick={() => setNewOpen(true)}>
            <div className="action-icon">＋</div>
            <div className="action-title">New Project</div>
            <div className="sub">Choose canvas, resolution and frame rate</div>
          </button>
          <button className="card action-card" onClick={() => fileInput.current?.click()}>
            <div className="action-icon">📂</div>
            <div className="action-title">Import Project</div>
            <div className="sub">Restore a .vidforge.json project file</div>
          </button>
          <button className="card action-card" onClick={() => { createProject({}); router.push("/editor"); }}>
            <div className="action-icon">✂️</div>
            <div className="action-title">Quick Edit</div>
            <div className="sub">Open the editor with default settings</div>
          </button>
        </div>
        <input ref={fileInput} type="file" accept=".json,.vidforge.json" hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importProject(f); e.target.value = ""; }} />

        <div className="card-title" style={{ marginBottom: 12 }}>
          Recent Projects <span className="badge">{projects.length}</span>
        </div>

        {!loaded && <p className="sub">Loading projects…</p>}
        {loaded && projects.length === 0 && (
          <div className="empty-state">
            <div className="big">🎬</div>
            <p>No projects yet. Create your first video.</p>
            <button className="btn btn-primary btn-sm" onClick={() => setNewOpen(true)}>+ New Project</button>
          </div>
        )}

        <div className="grid-4">
          {projects.map((p) => (
            <div key={p.id} className="card project-card" onClick={() => openProject(p.id)} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && openProject(p.id)}>
              <div className="project-thumb">
                {p.thumb ? <img src={p.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div className="thumb-fallback">🎞️</div>}
                <span className="project-dur">{fmtDur(p.duration || 0)}</span>
                <div className="project-menu">
                  <button onClick={(e) => renameProject(p.id, e)} title="Rename">✏️</button>
                  <button onClick={(e) => duplicateProject(p.id, e)} title="Duplicate">⧉</button>
                  <button onClick={(e) => exportProject(p.id, e)} title="Export">⬇</button>
                  <button onClick={(e) => removeProject(p.id, e)} title="Delete">🗑</button>
                </div>
              </div>
              {renameId === p.id ? (
                <input className="input" style={{ marginBottom: 6, fontSize: 13 }} value={renameVal} autoFocus
                  onChange={(e) => setRenameVal(e.target.value)}
                  onBlur={submitRename}
                  onKeyDown={(e) => { if (e.key === "Enter") submitRename(); }} />
              ) : (
                <div className="project-name">{p.name || "Untitled"}</div>
              )}
              <div className="sub" style={{ fontSize: 11.5 }}>
                {p.width || 1920}×{p.height || 1080} · {p.format || "16:9"} · {fmtDate(p.updatedAt || Date.now())}
              </div>
            </div>
          ))}
        </div>
      </main>

      {newOpen && (
        <NewProjectModal
          onClose={() => setNewOpen(false)}
          onCreate={(settings) => { createProject(settings); router.push("/editor"); }}
        />
      )}

      <style>{`
        .action-card { text-align: left; cursor: pointer; transition: border-color .15s, transform .15s; }
        .action-card:hover { border-color: var(--accent); transform: translateY(-2px); }
        .action-icon { font-size: 26px; margin-bottom: 10px; }
        .action-title { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
        .project-card { padding: 10px; cursor: pointer; position: relative; }
        .project-card:hover { border-color: var(--accent); }
        .project-thumb { position: relative; aspect-ratio: 16/9; border-radius: 8px; overflow: hidden; background: var(--surface); margin-bottom: 10px; }
        .thumb-fallback { width: 100%; height: 100%; display: grid; place-items: center; font-size: 28px; }
        .project-dur { position: absolute; bottom: 6px; left: 6px; background: rgba(0,0,0,.7); color: #fff; font-size: 10.5px; padding: 2px 7px; border-radius: 4px; }
        .project-menu { position: absolute; top: 6px; right: 6px; display: flex; gap: 2px; background: rgba(0,0,0,.65); border-radius: 6px; padding: 2px; opacity: 0; transition: opacity .15s; }
        .project-card:hover .project-menu { opacity: 1; }
        .project-menu button { background: none; border: none; color: #fff; cursor: pointer; font-size: 12px; padding: 2px 5px; border-radius: 4px; }
        .project-menu button:hover { background: rgba(255,255,255,.15); }
        .project-name { font-weight: 600; font-size: 13.5px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      `}</style>
    </div>
  );
}
