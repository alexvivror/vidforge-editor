"use client";

import { useState } from "react";
import Topbar from "@/components/Topbar";
import { useEditor } from "@/stores/useStore";
import { runDecisionMaker } from "@/ai/planner/planner";
import type { AiTask } from "@/types";

const DURATIONS = [30, 60, 90, 180];
const FORMATS = [
  { id: "16:9", label: "YouTube", cls: "wider" },
  { id: "9:16", label: "Reels / Shorts", cls: "tall" },
  { id: "1:1", label: "Square", cls: "square" },
  { id: "4:5", label: "Portrait", cls: "portrait" },
] as const;

export default function CreatePage() {
  const { keys, setProject, setAiTasks, setAiRunning, aiTasks, aiRunning, project } = useEditor();
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(60);
  const [format, setFormat] = useState<"16:9" | "9:16" | "1:1" | "4:5">("16:9");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");

  const create = async () => {
    if (!prompt.trim()) { setError("Describe the video you want to make."); return; }
    setError(""); setSummary("");
    setAiTasks([]); setAiRunning(true);
    setProject({ format, name: prompt.trim().slice(0, 40) });
    try {
      const plan = await runDecisionMaker({
        prompt,
        keys,
        onProgress: (task: AiTask, i: number) => {
          setAiTasks((prev: AiTask[]) => {
            const next = [...prev];
            next[i] = { ...task, progress: 100 };
            return next;
          });
        },
      });
      setSummary(plan.summary);
      if (plan.tasks.length) {
        // attach produced script to the project
        const scriptTask = plan.tasks.find((t) => t.type === "script" && t.status === "completed");
        if (scriptTask?.result && typeof scriptTask.result === "string") {
          setProject({ narration: { ...project.narration, text: scriptTask.result as string } });
        }
      }
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setAiRunning(false);
    }
  };

  return (
    <div className="page">
      <Topbar />
      <main className="container">
        <div className="ai-hero">
          <h1>Describe the video. AI builds it.</h1>
          <p className="sub">
            One prompt → production plan → script, slides, voice, images, music — orchestrated automatically.
          </p>

          <div className="ai-input-wrap">
            <textarea
              className="ai-input"
              placeholder='e.g. "Make a 60-second YouTube Short about ACL injuries for physiotherapy students — with a presenter avatar and background music"'
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </div>

          <div className="duration-pills">
            {DURATIONS.map((d) => (
              <button key={d} className={`pill ${duration === d ? "active" : ""}`} onClick={() => setDuration(d)}>
                {d >= 60 ? `${d / 60} min` : `${d}s`}
              </button>
            ))}
          </div>

          <div className="format-cards">
            {FORMATS.map((f) => (
              <div key={f.id} className={`format-card ${format === f.id ? "active" : ""}`} onClick={() => setFormat(f.id)}>
                <div className="ratio" style={{ width: f.id === "16:9" ? 32 : 22, height: f.id === "9:16" ? 20 : f.id === "1:1" ? 26 : 30 }}>
                  {f.id}
                </div>
                {f.label}
              </div>
            ))}
          </div>

          <button className="btn btn-primary" style={{ fontSize: 16, padding: "14px 36px" }} onClick={create} disabled={aiRunning}>
            {aiRunning ? "Creating…" : "✨ Create Video"}
          </button>

          {error && <div className="error-box" style={{ marginTop: 16 }}>{error}</div>}
          {summary && <div className="success-box">{summary}</div>}
        </div>

        {aiTasks.length > 0 && (
          <div className="card" style={{ maxWidth: 720, margin: "32px auto 0" }}>
            <div className="card-title">
              AI Production <span className="badge badge-accent">{aiRunning ? "running" : "done"}</span>
            </div>
            <div className="task-list">
              {aiTasks.map((t) => (
                <div className="task-row" key={t.id}>
                  <div className={`task-icon ${t.status}`}>
                    {t.status === "completed" ? "✓" : t.status === "failed" ? "✕" : t.status === "running" ? "●" : "○"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="task-name">{t.name}</div>
                    {t.detail && <div className="task-detail">{t.detail}</div>}
                    {t.status === "running" && (
                      <div className="progress-bar"><div style={{ width: "70%" }} /></div>
                    )}
                  </div>
                  <span className="task-progress">{t.status === "completed" ? "done" : t.status === "failed" ? "failed" : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
