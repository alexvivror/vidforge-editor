// ---------- Unified provider API client ----------
// The AI doesn't know individual APIs — it calls searchImages/searchAudio
// and the provider manager picks whichever service is configured.
// Secret keys stay on the server (Next.js API routes); public APIs
// (MusicBrainz, Deezer) are called directly from the browser.

import type { ImageResult, MusicResult, ProviderKeys, ScriptRequest, ScriptStyle } from "@/types";

const api = async (path: string, body: unknown) => {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
};

// ---------------- Script generation (OpenCode Zen / offline fallback) ----------------

export async function generateScript(req: ScriptRequest, keys: ProviderKeys): Promise<{ script: string; provider: string }> {
  if (keys.opencodezen) {
    return api("/api/script", { ...req, key: keys.opencodezen, model: keys.opencodezenModel });
  }
  const styleHint: Record<ScriptStyle, string> = {
    educational: "Teach the topic clearly, step by step.",
    fast_youtube: "High energy, punchy, zero fluff.",
    documentary: "Cinematic, deliberate, authoritative.",
    research: "Precise, evidence-first, number-focused.",
    explainer: "Simple analogies, concrete examples.",
    news: "Neutral, factual, brisk.",
  };
  const outlineBullets = (req.outline || []).map((o) => `- ${o}`).join("\n");
  return {
    script: `[INTRO] ${styleHint[req.style]}\n${outlineBullets || `Topic: ${req.topic}`}\n[OUTRO] If this helped, share it with someone who needs it.`,
    provider: "offline-fallback",
  };
}

// ---------------- TTS (ElevenLabs / NVIDIA NIM / browser fallback) ----------------

export async function synthesizeSpeech(text: string, keys: ProviderKeys, voice?: string) {
  if (keys.elevenlabs) {
    return api("/api/tts", { text, provider: "elevenlabs", key: keys.elevenlabs, voice: voice || keys.elevenlabsVoice });
  }
  if (keys.nvidiaNim) {
    return api("/api/tts", { text, provider: "nim", key: keys.nvidiaNim });
  }
  return { provider: "browser", note: "browser speechSynthesis" };
}

// ---------------- Unified image search (provider manager) ----------------

export async function searchImages(query: string, keys: ProviderKeys, count = 6): Promise<ImageResult[]> {
  const attempts: Promise<ImageResult[]>[] = [];
  if (keys.unsplash) attempts.push(api("/api/images", { query, provider: "unsplash", key: keys.unsplash }));
  if (keys.pexels) attempts.push(api("/api/images", { query, provider: "pexels", key: keys.pexels }));
  if (keys.pixabay) attempts.push(api("/api/images", { query, provider: "pixabay", key: keys.pixabay }));
  if (!attempts.length) return [];
  const results = await Promise.allSettled(attempts);
  const imgs = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  return imgs.slice(0, count);
}

// ---------------- Unified audio/music search (MusicBrainz/Deezer/Freesound) ----------------

export async function searchAudio(query: string, keys: ProviderKeys, kind: "music" | "sfx" = "music"): Promise<MusicResult[]> {
  const out: MusicResult[] = [];
  // MusicBrainz — free, no key
  if (!kind || kind === "music") {
    try {
      const r = await fetch(`https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=5`, {
        headers: { "User-Agent": "VidForgeEditor/1.0 (research video tool)" },
      });
      const d = await r.json();
      (d.recordings || []).forEach((rec: any) => {
        out.push({ title: rec.title || "Untitled", artist: rec["artist-credit"]?.[0]?.name || "Unknown", source: "musicbrainz", license: "verify before commercial use" });
      });
    } catch { /* ignore */ }
    // Deezer — free, no key
    try {
      const r = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=5`);
      const d = await r.json();
      (d.data || []).forEach((t: any) => {
        out.push({ title: t.title || "", artist: t.artist?.name || "", preview: t.preview, source: "deezer", license: "verify before commercial use" });
      });
    } catch { /* ignore */ }
  }
  // Freesound — needs key (SFX or music)
  if (keys.freesound) {
    try {
      const fields = kind === "sfx" ? "name,previews,username,license" : "name,previews,username,license";
      const r = await fetch(
        `https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(query)}&token=${keys.freesound}&fields=${fields}&page_size=6`
      );
      const d = await r.json();
      (d.results || []).forEach((s: any) => {
        out.push({ title: s.name || "", artist: s.username || "", preview: s.previews?.["preview-hq-mp3"], source: "freesound", license: s.license || "verify" });
      });
    } catch { /* ignore */ }
  }
  return out.slice(0, 10);
}

export async function searchMusic(query: string, keys: ProviderKeys): Promise<MusicResult[]> {
  return searchAudio(query, keys, "music");
}

export async function searchSfx(query: string, keys: ProviderKeys): Promise<MusicResult[]> {
  return searchAudio(query, keys, "sfx");
}

// ---------------- Article fetch (Firecrawl / jina fallback) ----------------

export async function fetchArticle(url: string, keys: ProviderKeys) {
  if (keys.firecrawl) {
    return api("/api/fetch", { url, key: keys.firecrawl });
  }
  const res = await fetch(`https://r.jina.ai/${url}`);
  const text = await res.text();
  return { text, provider: "jina-reader" };
}

// ---------------- Marp presentation ----------------

export async function buildPresentation(title: string, outline: string[], style: string) {
  return api("/api/marp", { title, outline, style });
}

// ---------------- Avatar (NVIDIA NIM / CSS fallback) ----------------

export async function generateAvatar(prompt: string, keys: ProviderKeys) {
  if (keys.nvidiaNim) {
    return api("/api/avatar", { prompt, key: keys.nvidiaNim, model: keys.nvidiaAvatarModel });
  }
  return { provider: "css", note: "CSS animated presenter (no NIM key)" };
}
