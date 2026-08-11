"use client";

import { useState } from "react";
import Topbar from "@/components/Topbar";
import { useEditor } from "@/stores/useStore";
import type { ProviderKeys } from "@/types";

function Field({ label, value, onChange, type = "text", placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; hint?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        className="input"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

function ProviderCard({ title, dot, children }: { title: string; dot: boolean; children: React.ReactNode }) {
  return (
    <div className="card provider-card">
      <div className="provider-header">
        <span className={`provider-dot ${dot ? "configured" : ""}`} />
        <h2 style={{ fontSize: 15 }}>{title}</h2>
        {dot && <span className="badge badge-green" style={{ marginLeft: "auto" }}>configured</span>}
      </div>
      {children}
    </div>
  );
}

export default function SettingsPage() {
  const { keys, setKeys } = useEditor();
  const [testResult, setTestResult] = useState<string>("");
  const k = keys as ProviderKeys;
  const set = (patch: Partial<ProviderKeys>) => setKeys(patch);

  const testConnection = async (provider: string) => {
    try {
      if (provider === "opencodezen") {
        const r = await fetch("/api/script", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic: "test", style: "educational", key: k.opencodezen, model: k.opencodezenModel }),
        });
        const d = await r.json();
        setTestResult(d.script ? `✅ OpenCode Zen OK — "${d.script.slice(0, 40)}…"` : `❌ ${d.error}`);
      } else if (provider === "elevenlabs") {
        setTestResult("⚙️ ElevenLabs: save a key, then use AI Studio → Voice to hear it.");
      } else if (provider === "images") {
        const r = await fetch("/api/images", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: "nature", provider: k.pexels ? "pexels" : "unsplash", key: k.pexels || k.unsplash }),
        });
        const d = await r.json();
        setTestResult(Array.isArray(d) ? `✅ Image API OK — ${d.length} results` : `❌ ${d.error}`);
      } else if (provider === "firecrawl") {
        const r = await fetch("/api/fetch", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: "https://en.wikipedia.org/wiki/Video_editing", key: k.firecrawl }),
        });
        const d = await r.json();
        setTestResult(d.text ? `✅ Firecrawl OK — ${d.length} chars extracted` : `❌ ${d.error}`);
      } else if (provider === "music") {
        const r = await fetch(`https://api.deezer.com/search?q=cinematic&limit=1`);
        const d = await r.json();
        setTestResult(d.data?.length ? `✅ Deezer OK — "${d.data[0].title}"` : "❌ Deezer unreachable");
      } else if (provider === "musicbrainz") {
        const r = await fetch(`https://musicbrainz.org/ws/2/recording?query=cinematic&fmt=json&limit=1`, {
          headers: { "User-Agent": "VidForgeEditor/1.0" },
        });
        const d = await r.json();
        setTestResult(d.recordings?.length ? `✅ MusicBrainz OK — "${d.recordings[0].title}"` : "❌ MusicBrainz unreachable");
      } else if (provider === "freesound") {
        const r = await fetch(`https://freesound.org/apiv2/search/text/?query=whoosh&token=${k.freesound}&fields=name&page_size=1`);
        const d = await r.json();
        setTestResult(d.results?.length ? `✅ Freesound OK — "${d.results[0].name}"` : `❌ ${d.detail || "unreachable"}`);
      } else if (provider === "nvidia") {
        setTestResult("⚙️ NVIDIA NIM: used for TTS + avatar in AI Studio; verify with a real generation.");
      }
    } catch (e: any) {
      setTestResult(`❌ ${String(e?.message || e)}`);
    }
  };

  return (
    <div className="page">
      <Topbar />
      <main className="container" style={{ maxWidth: 900 }}>
        <h1 style={{ marginBottom: 4 }}>Settings</h1>
        <p className="sub" style={{ marginBottom: 24 }}>
          Enter keys for the providers you want. Everything is optional — the editor works fully offline; AI features unlock as you add keys.
          Keys are stored locally in your browser (IndexedDB) and proxied through the server.
        </p>

        {testResult && <div className="success-box">{testResult}</div>}

        <div className="settings-section">
          <ProviderCard title="OpenCode Zen — Script Generation" dot={!!k.opencodezen}>
            <Field label="API Key" type="password" value={k.opencodezen} onChange={(v) => set({ opencodezen: v })} placeholder="sk-…" />
            <Field label="Base URL" value={k.opencodezenBase} onChange={(v) => set({ opencodezenBase: v })} placeholder="https://opencodezen.ai/api/v1" />
            <Field label="Model" value={k.opencodezenModel} onChange={(v) => set({ opencodezenModel: v })} placeholder="deepseek-v4-flash-free" />
            <button className="btn btn-ghost btn-sm" onClick={() => testConnection("opencodezen")}>Test Connection</button>
          </ProviderCard>

          <ProviderCard title="ElevenLabs — TTS Voice" dot={!!k.elevenlabs}>
            <Field label="API Key" type="password" value={k.elevenlabs} onChange={(v) => set({ elevenlabs: v })} placeholder="…" />
            <Field label="Voice ID" value={k.elevenlabsVoice} onChange={(v) => set({ elevenlabsVoice: v })} placeholder="21m00Tcm4TlvDq8ikWAM" />
            <Field label="Model" value={k.elevenlabsModel} onChange={(v) => set({ elevenlabsModel: v })} placeholder="eleven_multilingual_v2" />
            <button className="btn btn-ghost btn-sm" onClick={() => testConnection("elevenlabs")}>Test Connection</button>
          </ProviderCard>

          <ProviderCard title="NVIDIA NIM — TTS + Avatar" dot={!!k.nvidiaNim}>
            <Field label="API Key" type="password" value={k.nvidiaNim} onChange={(v) => set({ nvidiaNim: v })} placeholder="nvapi-…" />
            <Field label="Base URL" value={k.nvidiaNimBase} onChange={(v) => set({ nvidiaNimBase: v })} placeholder="https://ai.api.nvidia.com/v1" />
            <Field label="Text Model" value={k.nvidiaTextModel} onChange={(v) => set({ nvidiaTextModel: v })} placeholder="meta/llama-3.3-70b-instruct" />
            <Field label="Avatar / Image Model" value={k.nvidiaAvatarModel} onChange={(v) => set({ nvidiaAvatarModel: v })} placeholder="nvidia/sdxl" />
            <button className="btn btn-ghost btn-sm" onClick={() => testConnection("nvidia")}>Test Connection</button>
          </ProviderCard>

          <ProviderCard title="Wav2Lip — Avatar Lip-Sync" dot={!!k.wav2lipPath}>
            <Field label="Local / API Endpoint" value={k.wav2lipPath} onChange={(v) => set({ wav2lipPath: v })} placeholder="wav2lip/ or http://localhost:8000" hint="Path to Wav2Lip checkout or remote inference endpoint. Runs as a background job, never in the editor UI." />
            <button className="btn btn-ghost btn-sm" onClick={() => testConnection("nvidia")}>Test Connection</button>
          </ProviderCard>

          <ProviderCard title="Images — Unsplash · Pexels · Pixabay" dot={!!(k.unsplash || k.pexels || k.pixabay)}>
            <Field label="Unsplash Access Key" type="password" value={k.unsplash} onChange={(v) => set({ unsplash: v })} placeholder="…" />
            <Field label="Pexels API Key" type="password" value={k.pexels} onChange={(v) => set({ pexels: v })} placeholder="…" />
            <Field label="Pixabay API Key" type="password" value={k.pixabay} onChange={(v) => set({ pixabay: v })} placeholder="…" />
            <div className="hint">The AI calls one unified <code>searchImages(query)</code> — the first configured provider answers.</div>
            <button className="btn btn-ghost btn-sm" onClick={() => testConnection("images")} style={{ marginTop: 8 }}>Test Connection</button>
          </ProviderCard>

          <ProviderCard title="Article Fetch — Firecrawl" dot={!!k.firecrawl}>
            <Field label="API Key" type="password" value={k.firecrawl} onChange={(v) => set({ firecrawl: v })} placeholder="fc-…" />
            <button className="btn btn-ghost btn-sm" onClick={() => testConnection("firecrawl")}>Test Connection</button>
          </ProviderCard>

          <ProviderCard title="Music & Audio — MusicBrainz · Deezer · Freesound" dot={!!k.freesound}>
            <Field label="MusicBrainz (no key needed)" value={k.musicbrainz} onChange={(v) => set({ musicbrainz: v })} placeholder="optional config" hint="Free metadata — always available" />
            <Field label="Deezer (no key needed)" value={k.deezer} onChange={(v) => set({ deezer: v })} placeholder="optional config" hint="Free previews — always available" />
            <Field label="Freesound API Key" type="password" value={k.freesound} onChange={(v) => set({ freesound: v })} placeholder="…" hint="For SFX + CC0 sounds" />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => testConnection("music")}>Test Deezer</button>
              <button className="btn btn-ghost btn-sm" onClick={() => testConnection("musicbrainz")}>Test MusicBrainz</button>
              <button className="btn btn-ghost btn-sm" onClick={() => testConnection("freesound")}>Test Freesound</button>
            </div>
          </ProviderCard>
        </div>

        <div className="card" style={{ marginTop: 8 }}>
          <div className="card-title">Marp — Presentation Engine</div>
          <p className="sub">Marp runs server-side via marp-cli (auto-detected). Theme: dark + gold, matching the editor. No key needed.</p>
        </div>
      </main>
    </div>
  );
}
