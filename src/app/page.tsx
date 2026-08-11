"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Topbar from "@/components/Topbar";
import { useEditor } from "@/stores/useStore";
import { idbListProjects, idbDeleteProject, idbGetThumb, formatBytes, idbStorageUsage, idbLoadProject } from "@/lib/indexeddb/db";
import type { Project } from "@/types";

function projectMeta(p: any) {
  return {
    id: p.id,
    name: p.name || "Untitled",
    duration: p.duration || 0,
    width: p.width || 1920,
    height: p.height || 1080,
    format: p.format || "16:9",
    updatedAt: p.updatedAt || Date.now(),
  };
}

export default function HomePage() {
  const router = useRouter();
  const { setProject, project } = useEditor();
  const [projects, setProjects] = useState<any[]>([]);
  const [usage, setUsage] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  const refresh = async () => {
    const list = (await idbListProjects()) as any[];
    const withThumbs = await Promise.all(
      list.map(async (p) => {
        const meta = projectMeta(p);
        const thumb = await idbGetThumb(meta.id).catch(() => undefined);
        return { ...meta, thumb };
      })
    );
    withThumbs.sort((a, b) => b.updatedAt - a.updatedAt);
    setProjects(withThumbs);
    const { bytes } = await idbStorageUsage();
    setUsage(formatBytes(bytes));
    setLoaded(true);
  };

  useEffect(() => { void refresh(); }, []);

  const openProject = async (id: string) => {
    const loaded = await idbLoadProject(id);
    if (loaded) {
      setProject(loaded as Partial<Project>);
      router.push("/editor");
    }
  };

  const removeProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this project? This cannot be undone.")) return;
    await idbDeleteProject(id);
    void refresh();
  };

  const saveCurrent = async () => {
    await import("@/lib/indexeddb/db").then((m) => m.idbSaveProject(project));
    void refresh();
  };

  const fmtDur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : `0:${String(Math.floor(s)).padStart(2, "0")}`);
  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className="page">
      <Topbar />
      <main className="container">
        <h1 style={{ marginBottom: 4 }}>Your projects</h1>
        <p className="sub" style={{ marginBottom: 24 }}>
          {usage ? `Local storage: ${usage} used · ` : ""}Your videos stay on this device unless you choose a cloud AI feature.
        </p>

        {/* primary actions */}
        <div className="grid-3" style={{ marginBottom: 32 }}>
          <button className="card action-card" onClick={() => router.push("/create")}>
            <div className="action-icon">✨</div>
            <div className="action-title">AI Create</div>
            <div className="sub">Describe a video — AI plans and builds it</div>
          </button>
          <button className="card action-card" onClick={() => { saveCurrent(); router.push("/editor"); }}>
            <div className="action-icon">✂️</div>
            <div className="action-title">Start Editing</div>
            <div className="sub">Open the manual editor with your current project</div>
          </button>
          <button className="card action-card" onClick={() => { saveCurrent(); router.push("/editor"); }}>
            <div className="action-icon">📁</div>
            <div className="action-title">Continue Current</div>
            <div className="sub">"{project.name}" · {fmtDur(project.duration)} · {project.width}×{project.height}</div>
          </button>
        </div>

        <div className="card-title" style={{ marginBottom: 12 }}>
          Recent Projects <span className="badge">{projects.length}</span>
        </div>

        {!loaded && <p className="sub">Loading projects…</p>}
        {loaded && projects.length === 0 && (
          <div className="empty-state">
            <div className="big">🎬</div>
            <p>No projects yet. Create your first video with AI or start editing.</p>
          </div>
        )}

        <div className="grid-4">
          {projects.map((p) => (
            <div key={p.id} className="card project-card" onClick={() => openProject(p.id)} role="button" tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && openProject(p.id)}>
              <div className="project-thumb">
                {p.thumb ? (
                  <img src={p.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", fontSize: 28 }}>🎞️</div>
                )}
                <span className="project-dur">{fmtDur(p.duration)}</span>
                <button className="project-more" title="Delete" onClick={(e) => removeProject(p.id, e)}>🗑</button>
              </div>
              <div className="project-name">{p.name}</div>
              <div className="sub" style={{ fontSize: 11.5 }}>
                {p.width}×{p.height} · {p.format} · {fmtDate(p.updatedAt)}
              </div>
            </div>
          ))}
        </div>
      </main>

      <style>{`
        .action-card { text-align: left; cursor: pointer; transition: border-color .15s, transform .15s; }
        .action-card:hover { border-color: var(--accent); transform: translateY(-2px); }
        .action-icon { font-size: 26px; margin-bottom: 10px; }
        .action-title { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
        .project-card { padding: 10px; cursor: pointer; }
        .project-card:hover { border-color: var(--accent); }
        .project-thumb { position: relative; aspect-ratio: 16/9; border-radius: 8px; overflow: hidden; background: var(--bg-soft); margin-bottom: 10px; }
        .project-dur { position: absolute; bottom: 6px; left: 6px; background: rgba(0,0,0,.7); color: #fff; font-size: 10.5px; padding: 2px 7px; border-radius: 4px; }
        .project-more { position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,.6); border: none; border-radius: 6px; padding: 4px 8px; cursor: pointer; font-size: 13px; opacity: 0; transition: opacity .15s; }
        .project-card:hover .project-more { opacity: 1; }
        .project-name { font-weight: 600; font-size: 13.5px; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      `}</style>
    </div>
  );
}
