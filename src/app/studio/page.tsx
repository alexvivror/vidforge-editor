"use client";

import { useState } from "react";
import Topbar from "@/components/Topbar";
import AvatarLipSync from "@/components/ai/AvatarLipSync";
import { useEditor } from "@/stores/useStore";
import { buildPresentation, generateAvatar, generateScript, searchAudio, searchImages, synthesizeSpeech } from "@/providers";

const TABS = ["Script", "Scenes", "Images", "Voice", "Avatar", "Music", "Captions", "Presentation"] as const;

export default function StudioPage() {
  const { project, keys, setProject, setNarration } = useEditor();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Script");
  const [topic, setTopic] = useState("");
  const [style, setStyle] = useState("educational");
  const [script, setScript] = useState(project.narration.text);
  const [images, setImages] = useState<{ url: string; alt: string; source: string }[]>([]);
  const [music, setMusic] = useState<{ title: string; artist: string; preview?: string; source: string; license?: string }[]>([]);
  const [audioBase64, setAudioBase64] = useState("");
  const [avatarBase64, setAvatarBase64] = useState("");
  const [marpHtml, setMarpHtml] = useState("");
  const [marpMd, setMarpMd] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const run = async (fn: () => Promise<void>) => {
    setLoading(true); setMsg("");
    try { await fn(); } catch (e: any) { setMsg(`❌ ${e?.message || e}`); } finally { setLoading(false); }
  };

  const genScript = () => run(async () => {
    const s = await generateScript({ topic: topic || project.name, style: style as any }, keys);
    setScript(s.script);
    setNarration(s.script);
    setMsg(`✅ Script via ${s.provider} (${s.script.split(/\s+/).length} words)`);
  });

  const findImages = () => run(async () => {
    const imgs = await searchImages(topic || project.name, keys);
    setImages(imgs);
    setMsg(imgs.length ? `✅ ${imgs.length} images from ${imgs[0].source}` : "⚠️ No image API key — add one in Settings");
  });

  const genVoice = () => run(async () => {
    const audio = await synthesizeSpeech(script || project.narration.text, keys);
    if (audio.audioBase64) {
      setAudioBase64(audio.audioBase64);
      const blob = b64toBlob(audio.audioBase64, audio.mime || "audio/mpeg");
      const url = URL.createObjectURL(blob);
      setProject({ narration: { ...project.narration, audioUrl: url } });
      setMsg(`✅ Voice via ${audio.provider}`);
    } else {
      window.speechSynthesis?.speak(new SpeechSynthesisUtterance(script || project.narration.text));
      setMsg("🎙️ Browser voice (no TTS key)");
    }
  });

  const genAvatar = () => run(async () => {
    const av = await generateAvatar(topic || project.name, keys);
    if (av.imageBase64) {
      setAvatarBase64(av.imageBase64);
      setProject({ avatar: { enabled: true, provider: "nvidia_nim", prompt: topic } });
      setMsg("✅ Avatar generated via NVIDIA NIM");
    } else {
      setProject({ avatar: { enabled: true, provider: "css" } });
      setMsg("🎭 CSS presenter (add NIM key for a real avatar)");
    }
  });

  const findMusic = () => run(async () => {
    const tracks = await searchAudio(topic || project.name, keys, "music");
    setMusic(tracks);
    setMsg(tracks.length ? `✅ ${tracks.length} tracks found — check licenses before commercial use` : "No music found");
  });

  const genPresentation = () => run(async () => {
    const outline = (script || project.narration.text)
      .split(/(?<=[.!?])\s+/)
      .filter((s) => s.length > 30)
      .slice(0, 6);
    const pres = await buildPresentation(project.name, outline, style);
    setMarpHtml(pres.html || "");
    setMarpMd(pres.marp || "");
    setMsg(pres.html ? `✅ Marp deck rendered (${pres.slides} slides)` : "✅ Marp markdown ready (marp-cli not on server, markdown shown)");
  });

  return (
    <div className="page">
      <Topbar />
      <main className="container" style={{ maxWidth: 1100 }}>
        <h1 style={{ marginBottom: 4 }}>AI Studio</h1>
        <p className="sub" style={{ marginBottom: 24 }}>Generate each production asset — or let AI Create orchestrate all of them from one prompt.</p>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {TABS.map((t) => (
            <button key={t} className={`pill ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>

        <div className="grid" style={{ gridTemplateColumns: "320px 1fr", alignItems: "start" }}>
          <div className="card">
            <div className="card-title">Input</div>
            <div className="field">
              <label>Topic</label>
              <input className="input" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Quantum computing basics" />
            </div>
            <div className="field">
              <label>Style</label>
              <select className="select" value={style} onChange={(e) => setStyle(e.target.value)}>
                <option value="educational">Educational</option>
                <option value="fast_youtube">Fast YouTube</option>
                <option value="documentary">Documentary</option>
                <option value="research">Research / Academic</option>
                <option value="explainer">Explainer</option>
                <option value="news">News / Briefing</option>
              </select>
            </div>
            <div className="field">
              <label>Script text (used by Voice + Presentation)</label>
              <textarea className="textarea" value={script} onChange={(e) => { setScript(e.target.value); setNarration(e.target.value); }} style={{ minHeight: 160 }} />
            </div>
            <button className="btn btn-primary" style={{ width: "100%" }} onClick={genScript} disabled={loading}>
              {loading ? "Working…" : "Generate Script (OpenCode Zen)"}
            </button>
            {msg && <div className="success-box" style={{ marginTop: 12 }}>{msg}</div>}
          </div>

          <div className="card">
            <div className="card-title">
              {tab} <span className="badge badge-accent" style={{ marginLeft: 8 }}>{tab}</span>
            </div>

            {tab === "Script" && (
              <>
                <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 14, lineHeight: 1.8, color: "var(--text-dim)", maxHeight: 420, overflowY: "auto" }}>{script || "Generate a script or type one above."}</pre>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => { navigator.clipboard?.writeText(script); setMsg("Copied!"); }}>Copy</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => { window.speechSynthesis?.speak(new SpeechSynthesisUtterance(script)); }}>Listen</button>
                </div>
              </>
            )}

            {tab === "Scenes" && (
              <div className="empty-state">
                <div className="big">🎬</div>
                <p>Scenes are derived from your script. Each sentence cluster becomes a scene with its own slide, image and narration segment.</p>
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={genScript}>Derive from Script</button>
              </div>
            )}

            {tab === "Images" && (
              <>
                <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={findImages} disabled={loading}>
                  {loading ? "Searching…" : "Search Images (Unsplash / Pexels / Pixabay)"}
                </button>
                <div className="grid-4">
                  {images.map((img, i) => (
                    <div key={i} className="card" style={{ padding: 8, cursor: "pointer" }}>
                      <img src={img.url} alt={img.alt} style={{ width: "100%", aspectRatio: "16/9", objectFit: "cover", borderRadius: 8 }} loading="lazy" />
                      <div className="hint" style={{ marginTop: 6 }}>{img.source}</div>
                    </div>
                  ))}
                  {!images.length && <p className="sub">No images yet. Add image API keys in Settings.</p>}
                </div>
              </>
            )}

            {tab === "Voice" && (
              <>
                <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={genVoice} disabled={loading}>
                  {loading ? "Synthesizing…" : "Generate Voice (ElevenLabs / NVIDIA NIM)"}
                </button>
                {audioBase64 && (
                  <audio controls src={`data:audio/mpeg;base64,${audioBase64}`} style={{ width: "100%" }} />
                )}
                {project.narration.audioUrl && !audioBase64 && (
                  <audio controls src={project.narration.audioUrl} style={{ width: "100%" }} />
                )}
                <p className="hint" style={{ marginTop: 8 }}>No key? Browser speechSynthesis is used (works offline).</p>
              </>
            )}

            {tab === "Avatar" && (
              <>
                <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={genAvatar} disabled={loading}>
                  {loading ? "Generating…" : "Generate Avatar (NVIDIA NIM)"}
                </button>
                {avatarBase64 && (
                  <img src={`data:image/png;base64,${avatarBase64}`} alt="avatar" style={{ width: 240, borderRadius: 12, border: "1px solid var(--border)" }} />
                )}
                <p className="hint" style={{ marginTop: 8 }}>
                  Lip-sync pipeline: script → NIM avatar image → ElevenLabs voice → Wav2Lip (runs as a background job on your GPU box).
                </p>
              </>
            )}

            {tab === "Music" && (
              <>
                <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={findMusic} disabled={loading}>
                  {loading ? "Searching…" : "Search Music (MusicBrainz / Deezer / Freesound)"}
                </button>
                <div className="task-list">
                  {music.map((t, i) => (
                    <div className="task-row" key={i}>
                      <div style={{ flex: 1 }}>
                        <div className="task-name">{t.title} — {t.artist}</div>
                        <div className="task-detail">{t.source}{t.license ? ` · ${t.license}` : ""}</div>
                      </div>
                      {t.preview && <audio controls src={t.preview} style={{ height: 32, maxWidth: 200 }} />}
                    </div>
                  ))}
                  {!music.length && <p className="sub">No tracks yet. Deezer + MusicBrainz work without keys.</p>}
                </div>
              </>
            )}

            {tab === "Captions" && (
              <div className="empty-state">
                <div className="big">💬</div>
                <p>Auto-captions are generated from the script word-by-word, synced to the narration timeline (word-level timestamps from TTS).</p>
                <label className="checkbox-row" style={{ justifyContent: "center", marginTop: 12 }}>
                  <input type="checkbox" checked={!!project.captionsEnabled} onChange={(e) => setProject({ captionsEnabled: e.target.checked })} />
                  Enable captions
                </label>
              </div>
            )}

            {tab === "Presentation" && (
              <>
                <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={genPresentation} disabled={loading}>
                  {loading ? "Building…" : "Build Presentation (Marp)"}
                </button>
                {marpHtml ? (
                  <iframe srcDoc={marpHtml} style={{ width: "100%", aspectRatio: "16/9", borderRadius: 12, border: "1px solid var(--border)", background: "#000" }} />
                ) : marpMd ? (
                  <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, color: "var(--text-dim)", maxHeight: 300, overflowY: "auto", background: "var(--bg)", padding: 12, borderRadius: 8 }}>{marpMd}</pre>
                ) : (
                  <p className="sub">Build a Marp presentation from your script — rendered as HTML slides ready for canvas capture.</p>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function b64toBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}
