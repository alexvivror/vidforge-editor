"use client";

// ---------- Captions panel: add manual caption + SRT/VTT import ----------
import { useRef, useState } from "react";
import { useEditor } from "@/stores/useStore";

export function parseSRT(text: string): { text: string; start: number; end: number }[] {
  const blocks = text.trim().split(/\n\s*\n/);
  const out: { text: string; start: number; end: number }[] = [];
  for (const b of blocks) {
    const lines = b.split("\n").filter(Boolean);
    const timeLine = lines.find((l) => l.includes("-->"));
    if (!timeLine) continue;
    const [s, e] = timeLine.split("-->").map((t) => {
      const p = t.trim().split(":");
      return (+p[0]) * 3600 + (+p[1]) * 60 + +p[2].replace(",", ".");
    });
    const text = lines.filter((l) => l !== timeLine && !/^\d+$/.test(l)).join(" ").trim();
    if (text && !isNaN(s) && !isNaN(e)) out.push({ text, start: s, end: e });
  }
  return out;
}

export function parseVTT(text: string): { text: string; start: number; end: number }[] {
  return parseSRT(text.replace(/^WEBVTT.*\n/, ""));
}

export default function CaptionsPanel() {
  const { project, addClip, currentTime, setCurrentTime } = useEditor();
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const [dur, setDur] = useState(2);

  const addCaption = () => {
    if (!text.trim()) return;
    const trackIdx = project.tracks.findIndex((t) => t.kind === "text");
    const t = currentTime;
    addClip(trackIdx < 0 ? 1 : trackIdx, {
      kind: "text", name: "Caption", caption: text.trim(),
      text: text.trim(), duration: dur, position: t, start: 0, end: dur,
      fontSize: 34, fontWeight: 600, color: "#ffffff", background: "rgba(0,0,0,.65)", animation: "fade",
    });
    setText("");
    setCurrentTime(t + dur);
  };

  const importFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const caps = file.name.toLowerCase().endsWith(".vtt") ? parseVTT(String(reader.result)) : parseSRT(String(reader.result));
      const trackIdx = project.tracks.findIndex((t) => t.kind === "text");
      caps.forEach((c, i) => {
        addClip(trackIdx < 0 ? 1 : trackIdx, {
          kind: "text", name: `Caption ${i + 1}`, caption: c.text, text: c.text,
          duration: c.end - c.start, position: c.start, start: 0, end: c.end - c.start,
          fontSize: 34, fontWeight: 600, color: "#ffffff", background: "rgba(0,0,0,.65)", animation: "fade",
        });
      });
      alert(`Imported ${caps.length} captions`);
    };
    reader.readAsText(file);
  };

  return (
    <div className="tool-panel">
      <div className="card-title">Captions</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => fileInput.current?.click()}>Import SRT/VTT</button>
      </div>
      <input ref={fileInput} type="file" accept=".srt,.vtt,.txt" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ""; }} />

      <div className="field">
        <label>Caption text</label>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a caption…" />
      </div>
      <div className="field">
        <label>Duration ({dur.toFixed(1)}s)</label>
        <input className="input range" type="range" min={1} max={8} step={0.5} value={dur} onChange={(e) => setDur(+e.target.value)} />
      </div>
      <button className="btn btn-primary btn-sm" style={{ width: "100%" }} onClick={addCaption} disabled={!text.trim()}>
        Add Caption at {Math.floor(currentTime)}s
      </button>
      <p className="hint" style={{ marginTop: 10 }}>Captions are text clips on the Text track — edit their style in properties.</p>
    </div>
  );
}
