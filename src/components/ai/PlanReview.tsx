"use client";

// ---------- AI Production Plan review (before expensive generation) ----------
import { useState } from "react";
import type { VideoPlan } from "@/types";

interface PlanReviewProps {
  plan: VideoPlan;
  onConfirm: (plan: VideoPlan) => void;
  onEdit: () => void;
}

export default function PlanReview({ plan, onConfirm, onEdit }: PlanReviewProps) {
  const [confirmed, setConfirmed] = useState(false);

  const format = plan.format;
  const sceneCount = plan.scenes?.length || 0;
  const wantsAvatar = !!plan.avatar?.enabled;
  const wantsPresentation = !!plan.presentation?.enabled;

  return (
    <div className="card" style={{ maxWidth: 640, margin: "24px auto 0" }}>
      <div className="card-title">
        AI Production Plan <span className="badge badge-accent">review</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
        <div className="plan-row"><span className="sub">Goal</span><strong>{plan.objective || "Generated video"}</strong></div>
        <div className="plan-row"><span className="sub">Format</span><strong>{format}</strong></div>
        <div className="plan-row"><span className="sub">Duration</span><strong>{plan.duration}s</strong></div>
        <div className="plan-row"><span className="sub">Scenes</span><strong>{sceneCount}</strong></div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
        {[
          { label: "Script", status: "✓ Generate", enabled: !!plan.script },
          { label: "Visuals", status: `✓ ${plan.visuals?.length || sceneCount} assets`, enabled: true },
          { label: "Narration", status: plan.narration?.provider ? `✓ ${plan.narration.provider}` : "✓ Generate voice", enabled: true },
          { label: "Captions", status: plan.captions?.enabled ? "✓ Auto captions" : "○ Off", enabled: !!plan.captions?.enabled },
          { label: "Music", status: plan.music?.query ? "✓ Background music" : "○ Off", enabled: !!plan.music?.query },
          { label: "Avatar", status: wantsAvatar ? "✓ Talking avatar" : "○ Optional", enabled: wantsAvatar },
          { label: "Presentation", status: wantsPresentation ? "✓ Marp deck" : "○ Not required", enabled: wantsPresentation },
        ].map((row) => (
          <div key={row.label} className="plan-check" style={{ opacity: row.enabled ? 1 : 0.45 }}>
            <span>{row.enabled ? "✓" : "○"}</span>
            <strong>{row.label}</strong>
            <span className="sub" style={{ marginLeft: "auto" }}>{row.status}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10 }}>
        <button className="btn btn-ghost btn-sm" onClick={onEdit}>Edit Plan</button>
        <button className="btn btn-primary btn-sm" style={{ marginLeft: "auto" }} onClick={() => { setConfirmed(true); onConfirm(plan); }}>
          Start Production
        </button>
      </div>

      <style>{`
        .plan-row { display: flex; flex-direction: column; gap: 2px; background: var(--bg-soft); padding: 10px 12px; border-radius: 8px; }
        .plan-check { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: var(--bg-soft); border-radius: 8px; font-size: 13.5px; }
        .plan-check span:first-child { color: var(--success); }
      `}</style>
    </div>
  );
}

/** Validate a raw AI plan against the strict schema. Returns errors list. */
export function validatePlan(raw: unknown): string[] {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") return ["Plan is not an object"];
  const p = raw as Record<string, unknown>;
  if (typeof p.format !== "string" || !["16:9", "9:16", "1:1", "4:5"].includes(p.format)) errors.push("format must be 16:9, 9:16, 1:1 or 4:5");
  if (typeof p.duration !== "number" || p.duration <= 0 || p.duration > 900) errors.push("duration must be a positive number ≤ 900");
  if (!Array.isArray(p.scenes)) errors.push("scenes must be an array");
  else p.scenes.forEach((s, i) => {
    if (!s || typeof s !== "object") errors.push(`scene ${i}: not an object`);
  });
  if (p.captions !== undefined && typeof p.captions !== "object") errors.push("captions must be an object");
  if (p.audio !== undefined && typeof p.audio !== "object") errors.push("audio must be an object");
  return errors;
}
