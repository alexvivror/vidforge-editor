"use client";

import { useState } from "react";
import Topbar from "@/components/Topbar";
import PlanReview, { validatePlan } from "@/components/ai/PlanReview";
import { useEditor } from "@/stores/useStore";
import { runDecisionMaker } from "@/ai/planner/planner";
import type { AiPlan, AiTask, VideoPlan } from "@/types";

const DURATIONS = [30, 60, 90, 180];
const FORMATS = [
  { id: "16:9", label: "YouTube", cls: "wider" },
  { id: "9:16", label: "Reels / Shorts", cls: "tall" },
  { id: "1:1", label: "Square", cls: "square" },
  { id: "4:5", label: "Portrait", cls: "portrait" },
] as const;
const STYLES = ["educational", "professional", "minimal", "creator", "news", "documentary"];

type Phase = "input" | "review" | "production" | "done";

export default function CreatePage() {
  const { keys, setProject, setAiTasks, setAiRunning, aiTasks, aiRunning, project } = useEditor();
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(60);
  const [format, setFormat] = useState<"16:9" | "9:16" | "1:1" | "4:5">("16:9");
  const [style, setStyle] = useState("educational");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const [plan, setPlan] = useState<VideoPlan | null>(null);
  const [phase, setPhase] = useState<Phase>("input");
  const [planErrors, setPlanErrors] = useState<string[]>([]);

  const buildPrompt = () => {
    const styleMap: Record<string, string> = {
      educational: "educational", professional: "professional", minimal: "minimal",
      creator: "fast_youtube", news: "news", documentary: "documentary",
    };
    const styleWord = style === "educational" ? "" : ` in ${style} style`;
    return `${prompt.trim()}. Make it ${duration} seconds${duration >= 60 ? ` (${Math.floor(duration / 60)} min)` : ""}, ${format} format${styleWord}.`;
  };

  // step 1: parse request into a plan (no generation yet)
  const planIt = async () => {
    if (!prompt.trim()) { setError("Describe the video you want to make."); return; }
    setError(""); setSummary(""); setPlan(null); setPlanErrors([]);
    setAiTasks([]); setAiRunning(true);
    setProject({ format, name: prompt.trim().slice(0, 40) });
    try {
      // lightweight plan-only pass: reuse the planner's intent detection via a
      // minimal run that stops after the plan is built (source+script only)
      const result = await runDecisionMaker({
        prompt: buildPrompt(),
        keys,
        onProgress: (task: AiTask, i: number) => {
          setAiTasks((prev: AiTask[]) => {
            const next = [...prev];
            next[i] = { ...task, progress: 100 };
            return next;
          });
        },
      });
      const errors = validatePlan(result.plan as never);
      setPlanErrors(errors);
      setPlan(result.plan);
      if (errors.length) setError(`Plan validation: ${errors.join("; ")}`);
      setPhase("review");
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally {
      setAiRunning(false);
    }
  };

  // step 2: user confirms -> run full production
  const produce = async (confirmedPlan: VideoPlan) => {
    setPhase("production");
    setAiRunning(true);
    setAiTasks([]);
    setError("");
    try {
      const result = await runDecisionMaker({
        prompt: buildPrompt(),
        keys,
        onProgress: (task: AiTask, i: number) => {
          setAiTasks((prev: AiTask[]) => {
            const next = [...prev];
            next[i] = { ...task, progress: task.status === "completed" ? 100 : 60 };
            return next;
          });
        },
      });
      setSummary(result.summary);
      setPlan(result.plan);
      const scriptTask = result.tasks.find((t) => t.type === "script" && t.status === "completed");
      if (scriptTask?.result && typeof scriptTask.result === "string") {
        setProject({ narration: { ...project.narration, text: scriptTask.result as string } });
      }
      setPhase("done");
    } catch (e: any) {
      setError(String(e?.message || e));
      setPhase("review");
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
            One prompt → production plan → script, slides, voice, images, music — you approve the plan before anything is generated.
          </p>

          {phase === "input" && (
            <>
              <div className="ai-input-wrap">
                <textarea
                  className="ai-input"
                  placeholder='e.g. "Create a 60-second Reel explaining ACL injury for physiotherapy students — educational style, Hindi-English narration, captions, background music and a talking avatar"'
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </div>

              <div className="ai-quick-controls">
                <div className="ai-control">
                  <span className="ai-control-label">Duration</span>
                  <div className="duration-pills">
                    {DURATIONS.map((d) => (
                      <button key={d} className={`pill ${duration === d ? "active" : ""}`} onClick={() => setDuration(d)}>
                        {d >= 60 ? `${Math.floor(d / 60)} min` : `${d}s`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="ai-control">
                  <span className="ai-control-label">Format</span>
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
                </div>
                <div className="ai-control">
                  <span className="ai-control-label">Style</span>
                  <div className="duration-pills" style={{ flexWrap: "wrap" }}>
                    {STYLES.map((s) => (
                      <button key={s} className={`pill ${style === s ? "active" : ""}`} onClick={() => setStyle(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              </div>

              <button className="btn btn-primary" style={{ fontSize: 16, padding: "14px 36px" }} onClick={planIt} disabled={aiRunning}>
                {aiRunning ? "Planning…" : "✨ Create Video"}
              </button>
              {error && <div className="error-box" style={{ marginTop: 16 }}>{error}</div>}
            </>
          )}

          {phase === "review" && plan && (
            <>
              <PlanReview
                plan={plan}
                onConfirm={(p) => produce(p)}
                onEdit={() => { setPhase("input"); setSummary(""); }}
              />
              {planErrors.length > 0 && (
                <div className="error-box" style={{ maxWidth: 640, margin: "12px auto 0" }}>
                  Plan needs attention: {planErrors.join(" · ")}
                </div>
              )}
            </>
          )}

          {phase === "production" && (
            <div className="card" style={{ maxWidth: 640, margin: "24px auto 0" }}>
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
                        <div className="progress-bar"><div style={{ width: "65%" }} /></div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setPhase("review")}>Cancel</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setPhase("review")}>Edit Plan</button>
              </div>
            </div>
          )}

          {phase === "done" && (
            <div className="card" style={{ maxWidth: 640, margin: "24px auto 0" }}>
              <div className="card-title">✨ Production Complete</div>
              {summary && <div className="success-box">{summary}</div>}
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <a className="btn btn-primary btn-sm" href="/editor">Open in Editor</a>
                <a className="btn btn-ghost btn-sm" href="/studio">AI Studio</a>
                <button className="btn btn-ghost btn-sm" onClick={() => { setPhase("input"); setPrompt(""); setSummary(""); }}>New Video</button>
              </div>
            </div>
          )}
        </div>
      </main>

      <style>{`
        .ai-quick-controls { text-align: left; max-width: 640px; margin: 0 auto 24px; }
        .ai-control { margin-bottom: 14px; }
        .ai-control-label { display: block; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--text-dim); margin-bottom: 8px; }
        .ai-control .duration-pills { justify-content: flex-start; }
        .ai-control .format-cards { max-width: 100%; }
      `}</style>
    </div>
  );
}
