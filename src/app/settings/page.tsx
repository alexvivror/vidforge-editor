"use client";

// ---------- Settings: editor / application only (no AI providers in this phase) ----------
import { useEffect, useState } from "react";
import Topbar from "@/components/Topbar";
import { useEditor } from "@/stores/useStore";
import { idbClearAll, idbStorageUsage, formatBytes } from "@/lib/indexeddb/db";

export default function SettingsPage() {
  const { project, setProject } = useEditor();
  const [usage, setUsage] = useState("");
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    void idbStorageUsage().then(({ bytes }) => setUsage(formatBytes(bytes)));
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  const applyTheme = (t: "dark" | "light") => {
    setTheme(t);
    document.documentElement.dataset.theme = t;
    localStorage.setItem("vidforge-theme", t);
  };

  const setDefaultFps = (fps: number) => setProject({ fps });

  return (
    <div className="page">
      <Topbar />
      <main className="container" style={{ maxWidth: 640 }}>
        <h1 style={{ marginBottom: 4 }}>Settings</h1>
        <p className="sub" style={{ marginBottom: 24 }}>Editor preferences — everything stays on this device.</p>

        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 14 }}>Appearance</div>
          <div className="field">
            <label>Theme</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button className={`pill ${theme === "dark" ? "active" : ""}`} onClick={() => applyTheme("dark")}>Dark</button>
              <button className={`pill ${theme === "light" ? "active" : ""}`} onClick={() => applyTheme("light")}>Light</button>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 14 }}>New Project Defaults</div>
          <div className="field">
            <label>Frame Rate</label>
            <div style={{ display: "flex", gap: 8 }}>
              {[24, 30, 60].map((f) => (
                <button key={f} className={`pill ${project.fps === f ? "active" : ""}`} onClick={() => setDefaultFps(f)}>{f} FPS</button>
              ))}
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="card-title" style={{ marginBottom: 14 }}>Storage</div>
          <p className="sub" style={{ marginBottom: 12 }}>
            Used: <strong>{usage || "calculating…"}</strong> — projects, assets and thumbnails are stored in your browser's IndexedDB.
          </p>
          <button className="btn btn-danger btn-sm" onClick={() => {
            if (confirm("Clear ALL local projects and media? This cannot be undone.")) {
              void idbClearAll().then(() => { alert("Storage cleared"); window.location.href = "/"; });
            }
          }}>Clear All Local Data</button>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="card-title" style={{ marginBottom: 14 }}>Privacy</div>
          <p className="sub" style={{ lineHeight: 1.6 }}>
            🔒 Your videos stay on your device. Nothing is uploaded, tracked or analyzed.
            <br /><br />
            No account. No server-side processing. Export happens in your browser with WebCodecs / MediaRecorder.
          </p>
        </div>
      </main>
    </div>
  );
}
