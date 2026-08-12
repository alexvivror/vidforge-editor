// CloudAiService.ts - Unified cloud integration layer for AI media generation
// Orchestrates: NVIDIA NIM (script/avatar), ElevenLabs (TTS), Firecrawl (scrape),
// OpenCode Zen (MARP layouts), WAWA Lip Sync (avatar animation), and media search
// (Unsplash, Pexels, Pixabay, Deezer, Freesound, MusicBrainz).

import type {
  ApiKeys,
  CloudAiResponse,
  LipSyncData,
  PresentationSlide,
  SearchResult,
  AiTask,
  Clip,
} from "@/types";

export class CloudAiService {
  private keys: ApiKeys;
  private pendingTasks: Map<string, AiTask>;
  private taskCallbacks: Map<string, (task: AiTask) => void>;

  constructor(keys: ApiKeys) {
    this.keys = keys;
    this.pendingTasks = new Map();
    this.taskCallbacks = new Map();
  }

  updateKeys(keys: ApiKeys): void {
    this.keys = keys;
  }

  // -------------------------------------------------------------------------
  // Task tracking (long-polling pipeline)
  // -------------------------------------------------------------------------
  registerTask(task: AiTask): void {
    this.pendingTasks.set(task.id, task);
  }

  getTask(taskId: string): AiTask | undefined {
    return this.pendingTasks.get(taskId);
  }

  onTaskUpdate(taskId: string, cb: (task: AiTask) => void): void {
    this.taskCallbacks.set(taskId, cb);
  }

  private async executeTask<T = Record<string, unknown>>(
    taskId: string,
    type: AiTask["type"],
    input: Record<string, unknown>,
    operation: () => Promise<T>
  ): Promise<CloudAiResponse<T>> {
    const existing = this.pendingTasks.get(taskId);
    const task: AiTask = existing || {
      id: taskId,
      type,
      status: "running",
      progress: 10,
      input,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    task.status = "running";
    task.progress = 10;
    task.type = type;
    task.input = input;
    task.updatedAt = Date.now();
    this.registerTask(task);
    this.emitTask(task);

    try {
      const result = await operation();
      task.status = "completed";
      task.progress = 100;
      task.output = result as unknown as Record<string, unknown>;
      task.updatedAt = Date.now();
      this.emitTask(task);
      return { success: true, data: result };
    } catch (e) {
      task.status = "failed";
      task.error = e instanceof Error ? e.message : String(e);
      task.updatedAt = Date.now();
      this.emitTask(task);
      return { success: false, error: task.error };
    }
  }

  private emitTask(task: AiTask): void {
    this.pendingTasks.set(task.id, task);
    const cb = this.taskCallbacks.get(task.id);
    if (cb) cb(task);
  }

  updateTaskProgress(taskId: string, progress: number): void {
    const task = this.pendingTasks.get(taskId);
    if (task) {
      task.progress = Math.min(99, progress);
      task.updatedAt = Date.now();
      this.emitTask(task);
    }
  }

  // -------------------------------------------------------------------------
  // 1. Presentation script generation via NVIDIA NIM
  // -------------------------------------------------------------------------
  async generatePresentationScript(
    taskId: string,
    prompt: string,
    options: { tone?: string; audience?: string; language?: string; duration?: number } = {}
  ): Promise<CloudAiResponse<{ script: string; slides: PresentationSlide[] }>> {
    return this.executeTask(taskId, "script", { prompt }, async () => {
      if (!this.keys.nvidiaNim) {
        // graceful offline fallback: template-based script
        const fallback = this.buildFallbackScript(prompt, options);
        return fallback;
      }
      const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.keys.nvidiaNim}`,
        },
        body: JSON.stringify({
          model: "meta/llama-3.1-8b-instruct",
          messages: [
            {
              role: "system",
              content:
                "You are a professional video script writer. Create a structured narration script with slide breakdowns. Return JSON with {script: string, slides: [{title, content, layout, duration}]}.",
            },
            {
              role: "user",
              content: `Topic: ${prompt}\nTone: ${options.tone || "educational"}\nAudience: ${options.audience || "general"}\nLanguage: ${options.language || "English"}\nTarget duration: ${options.duration || 60} seconds.\nProduce a complete script.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 2048,
        }),
      });
      if (!response.ok) {
        throw new Error(`NIM API error: ${response.status} ${await response.text()}`);
      }
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      try {
        const parsed = JSON.parse(content);
        return parsed;
      } catch {
        return { script: content, slides: this.splitScriptToSlides(content) };
      }
    });
  }

  private buildFallbackScript(prompt: string, options: { tone?: string; audience?: string; duration?: number } = {}): {
    script: string;
    slides: PresentationSlide[];
  } {
    const wordsPerSecond = 2.5;
    const totalSeconds = options.duration || 60;
    const targetWords = Math.floor(totalSeconds * wordsPerSecond);
    const base = prompt.trim();
    const sentences = [
      `Welcome. Today we explore ${base}.`,
      `Understanding this topic starts with the fundamentals — the core ideas that make it accessible.`,
      `Research shows that breaking it into small steps improves retention and clarity.`,
      `Let's examine the practical applications and what they mean in everyday scenarios.`,
      `One common misconception is that this requires advanced expertise — in reality, the basics are enough to begin.`,
      `Looking ahead, the trends in ${base} point toward broader adoption and simpler tools.`,
      `To summarize: start small, stay consistent, and build on what you learn each session.`,
      `Thank you for watching. If this helped, share it with someone who needs it — and subscribe for more.`,
    ];
    const script = sentences.join(" ");
    const slides: PresentationSlide[] = sentences.slice(0, 6).map((s, i) => ({
      id: `slide-${i + 1}`,
      title: `${base} — ${i === 0 ? "Introduction" : `Section ${i + 1}`}`,
      content: s,
      layout: i === 0 ? "title" : i % 2 === 0 ? "content" : "quote",
      duration: Math.max(5, Math.round(totalSeconds / 6)),
    }));
    return { script, slides };
  }

  private splitScriptToSlides(script: string): PresentationSlide[] {
    const sentences = script.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 20).slice(0, 8);
    return sentences.map((s, i) => ({
      id: `slide-${i + 1}`,
      title: `Section ${i + 1}`,
      content: s.trim(),
      layout: i === 0 ? "title" : "content",
      duration: 8,
    }));
  }

  // -------------------------------------------------------------------------
  // 2. Text-to-speech via ElevenLabs
  // -------------------------------------------------------------------------
  async textToSpeech(
    taskId: string,
    text: string,
    options: { voiceId?: string; model?: string; stability?: number; similarity?: number; speed?: number } = {}
  ): Promise<CloudAiResponse<{ audioUrl: string; mimeType: string; duration: number }>> {
    return this.executeTask(taskId, "tts", { text: text.slice(0, 500) }, async () => {
      if (!this.keys.elevenLabs) {
        throw new Error("ElevenLabs API key not configured");
      }
      const voiceId = options.voiceId || "pNInz6obpgDQGcFmaJgB"; // default Adam
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": this.keys.elevenLabs,
        },
        body: JSON.stringify({
          text,
          model_id: options.model || "eleven_multilingual_v2",
          voice_settings: {
            stability: options.stability ?? 0.5,
            similarity_boost: options.similarity ?? 0.75,
            style: 0,
            speed: options.speed ?? 1,
          },
        }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ElevenLabs error: ${response.status} ${errText.slice(0, 200)}`);
      }
      const blob = await response.blob();
      const audioUrl = URL.createObjectURL(blob);
      // estimate duration (rough: 15 chars/sec at normal pace)
      const duration = text.length / 15;
      return { audioUrl, mimeType: blob.type || "audio/mpeg", duration };
    });
  }

  // -------------------------------------------------------------------------
  // 3. Wait — avatar layer generation via NVIDIA NIM image API
  // -------------------------------------------------------------------------
  async generateAvatarLayer(
    taskId: string,
    scriptText: string,
    style = "professional presenter, studio lighting, neutral background, photorealistic"
  ): Promise<CloudAiResponse<{ imageUrl: string; avatarPrompt: string }>> {
    return this.executeTask(taskId, "avatar", { scriptText: scriptText.slice(0, 200) }, async () => {
      if (!this.keys.nvidiaNim) {
        // CSS-based fallback avatar (no API needed)
        const dataUrl = this.buildCssAvatarDataUrl(scriptText);
        return { imageUrl: dataUrl, avatarPrompt: "css-fallback-presenter" };
      }
      const prompt = `Professional video presenter avatar: ${style}. The avatar should look trustworthy and engaging, suitable for educational content about: ${scriptText.slice(0, 150)}`;
      const response = await fetch("https://ai.api.nvidia.com/v1/genai/nvidia/consistory", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.keys.nvidiaNim}`,
        },
        body: JSON.stringify({
          mode: 1,
          aspect_ratio: "16:9",
          width: 1280,
          height: 720,
          seed: Math.floor(Math.random() * 10000),
          subject_prompt: prompt,
          image_prompt: prompt,
          subject_target: "Human",
          subject_mask: "None",
          cfg_scale: 6,
          steps: 18,
          negative_prompt: "blurry, distorted, cartoon, low quality, watermark",
        }),
      });
      if (!response.ok) {
        throw new Error(`NIM image error: ${response.status}`);
      }
      const data = await response.json();
      const imageUrl = data?.artifacts?.[0]?.base64
        ? `data:image/png;base64,${data.artifacts[0].base64}`
        : data?.image_url || "";
      if (!imageUrl) throw new Error("Avatar generation returned no image");
      return { imageUrl, avatarPrompt: prompt };
    });
  }

  private buildCssAvatarDataUrl(scriptText: string): string {
    // Generates a simple SVG avatar silhouette with a name label derived from the topic
    const topic = scriptText.trim().split(" ").slice(0, 2).join(" ").toUpperCase() || "PRESENTER";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <rect width="1280" height="720" fill="#111118"/>
      <circle cx="640" cy="260" r="120" fill="#3b82f6" opacity="0.9"/>
      <path d="M400 720 C400 540 520 460 640 460 C760 460 880 540 880 720 Z" fill="#3b82f6" opacity="0.9"/>
      <rect x="500" y="120" width="280" height="16" rx="8" fill="#334155"/>
      <text x="640" y="560" text-anchor="middle" font-family="Arial" font-size="56" font-weight="bold" fill="#f8fafc">${topic}</text>
      <text x="640" y="620" text-anchor="middle" font-family="Arial" font-size="28" fill="#94a3b8">AI Presenter</text>
    </svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }

  // -------------------------------------------------------------------------
  // 4. Research scraping via Firecrawl
  // -------------------------------------------------------------------------
  async scrapeResearchData(
    taskId: string,
    url: string,
    options: { limit?: number; format?: "markdown" | "html" | "text" } = {}
  ): Promise<CloudAiResponse<{ content: string; title: string; url: string }>> {
    return this.executeTask(taskId, "scrape", { url }, async () => {
      if (!this.keys.firecrawl) {
        throw new Error("Firecrawl API key not configured");
      }
      const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.keys.firecrawl}`,
        },
        body: JSON.stringify({
          url,
          formats: [options.format || "markdown"],
          onlyMainContent: true,
          limit: options.limit || 100,
        }),
      });
      if (!response.ok) throw new Error(`Firecrawl error: ${response.status}`);
      const data = await response.json();
      const content = data?.data?.markdown || data?.data?.content || data?.data?.text || "";
      const title = data?.data?.metadata?.title || url;
      if (!content) throw new Error("Firecrawl returned empty content");
      return { content: content.slice(0, 30000), title, url };
    });
  }

  // -------------------------------------------------------------------------
  // 5. MARP presentation layout (OpenCode Zen assisted)
  // -------------------------------------------------------------------------
  async buildMarpDeck(
    taskId: string,
    slides: PresentationSlide[],
    options: { theme?: string; aspectRatio?: "16:9" | "4:3"; customCSS?: string } = {}
  ): Promise<CloudAiResponse<{ marpMarkdown: string; html: string }>> {
    return this.executeTask(taskId, "composite", { slideCount: slides.length }, async () => {
      const theme = options.theme || "dark-gold";
      const themeCSS =
        theme === "dark-gold"
          ? `/* @theme dark-gold */
@import default;
:root { --color-background: #09090b; --color-foreground: #fafafa; --color-highlight: #f5c518; }
section { background: #09090b; color: #fafafa; font-family: Inter, sans-serif; }`
          : theme === "light-clean"
            ? `/* @theme light-clean */
@import default;
section { background: #ffffff; color: #111827; font-family: Inter, sans-serif; }`
            : "";

      const marpMarkdown = `---\nmarp: true\ntheme: ${theme}\n${options.customCSS ? `style: ${options.customCSS}` : ""}\n---\n\n${slides
        .map(
          (s) => `# ${s.title}\n\n${s.content}\n\n<!-- _duration: ${s.duration} -->\n\n---`
        )
        .join("\n\n")}`;

      // Request a server-rendered HTML via the Next.js proxy route
      let html = marpMarkdown;
      try {
        const proxy = await fetch("/api/marp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ marp: marpMarkdown, theme }),
        });
        if (proxy.ok) {
          const d = await proxy.json();
          if (d.html) html = d.html;
        }
      } catch {
        // keep markdown fallback
      }
      return { marpMarkdown, html };
    });
  }

  // -------------------------------------------------------------------------
  // 6. WAWA Lip Sync interface model
  // -------------------------------------------------------------------------
  async generateLipSync(
    taskId: string,
    audioUrl: string,
    avatarImageUrl: string,
    options: { fps?: number; model?: string } = {}
  ): Promise<CloudAiResponse<{ clip: Clip }>> {
    return this.executeTask(taskId, "lip-sync", { audioUrl, avatarImageUrl }, async () => {
      if (!this.keys.wawaLipSync) {
        // No WAWA endpoint configured — return phoneme-mapped audio metadata
        // so the UI renders a CSS/JS-animated avatar driven by audio amplitude.
        const lipSync: LipSyncData = this.buildAmplitudeLipSync(audioUrl);
        return { clip: null as unknown as Clip, lipSync };
      }
      // WAWA-compatible interface (endpoint per configured base URL)
      const endpoint = this.keys.wawaLipSync.trim().replace(/\/$/, "");
      const response = await fetch(`${endpoint}/api/v1/lipsync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio_url: audioUrl,
          image_url: avatarImageUrl,
          fps: options.fps || 30,
          model: options.model || "wav2lip",
          sync: true,
        }),
      });
      if (!response.ok) throw new Error(`WAWA LipSync error: ${response.status}`);
      const data = await response.json();
      const videoUrl = data?.video_url || data?.output_url || "";
      if (!videoUrl) throw new Error("LipSync returned no video URL");
      return { clip: { id: "", name: "Avatar LipSync", type: "avatar", url: videoUrl } as unknown as Clip };
    });
  }

  private buildAmplitudeLipSync(audioUrl: string): LipSyncData {
    // Creates a frame-level phoneme map that the UI can drive with Web Audio
    // amplitude analysis (works fully offline, no server required).
    const frames: LipSyncData["phonemes"] = [];
    const duration = 10; // placeholder until audio metadata loads
    for (let t = 0; t < duration * 30; t += 1) {
      const time = t / 30;
      const closed = Math.abs(Math.sin(time * Math.PI * 2)) < 0.25;
      frames.push({
        time,
        phoneme: closed ? "M" : "AA",
        mouthShape: {
          jawOpen: closed ? 0 : Math.min(1, Math.abs(Math.sin(time * 3))),
          lipSpread: 0.3,
          lipRound: closed ? 1 : 0.2,
        },
        intensity: closed ? 0 : 0.8,
      });
    }
    return { phonemes: frames, duration, audioUrl };
  }

  // -------------------------------------------------------------------------
  // 7. Unified media search (images / video / audio)
  // -------------------------------------------------------------------------
  async searchMedia(
    taskId: string,
    query: string,
    options: { type?: "image" | "video" | "audio"; orientation?: "landscape" | "portrait" | "square"; limit?: number; mood?: string } = {}
  ): Promise<CloudAiResponse<{ results: SearchResult[] }>> {
    const type = options.type || "image";
    return this.executeTask(taskId, "search-media", { query, type }, async () => {
      const results: SearchResult[] = [];
      const limit = options.limit || 8;

      // --- Unsplash ---
      if (this.keys.unsplash && type === "image") {
        try {
          const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${limit}${options.orientation ? `&orientation=${options.orientation}` : ""}`;
          const res = await fetch(url, { headers: { Authorization: `Client-ID ${this.keys.unsplash}` } });
          if (res.ok) {
            const data = await res.json();
            for (const photo of data.results || []) {
              results.push({
                id: `unsplash-${photo.id}`,
                source: "unsplash",
                type: "image",
                url: photo.urls?.full || photo.urls?.regular,
                thumbnailUrl: photo.urls?.thumb || photo.urls?.small,
                title: photo.alt_description || "Unsplash image",
                author: photo.user?.name,
                license: "Unsplash License (free to use, no attribution required)",
                width: photo.width,
                height: photo.height,
                tags: photo.tags?.map((t: { title: string }) => t.title),
              });
            }
          }
        } catch {
          /* provider unavailable — continue */
        }
      }

      // --- Pexels ---
      if (this.keys.pexels) {
        try {
          const perPage = type === "video" ? Math.min(15, limit) : limit;
          const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${perPage}&type=${type === "video" ? "video" : "photo"}`, {
            headers: { Authorization: this.keys.pexels },
          });
          if (res.ok) {
            const data = await res.json();
            if (type === "video") {
              for (const v of data.videos || []) {
                const file = v.video_files?.find((f: { width: number }) => f.width >= 720) || v.video_files?.[0];
                results.push({
                  id: `pexels-${v.id}`,
                  source: "pexels",
                  type: "video",
                  url: file?.link || "",
                  thumbnailUrl: v.image,
                  title: v.url ? "Pexels video" : "Pexels video",
                  author: v.user?.name,
                  license: "Pexels License (free to use)",
                  duration: v.duration,
                  width: file?.width,
                  height: file?.height,
                });
              }
            } else {
              for (const photo of data.photos || []) {
                results.push({
                  id: `pexels-${photo.id}`,
                  source: "pexels",
                  type: "image",
                  url: photo.src?.original || photo.src?.large2x,
                  thumbnailUrl: photo.src?.small || photo.src?.tiny,
                  title: `Pexels: ${photo.alt || "image"}`,
                  author: photo.photographer,
                  license: "Pexels License (free to use)",
                  width: photo.width,
                  height: photo.height,
                });
              }
            }
          }
        } catch {
          /* continue */
        }
      }

      // --- Pixabay ---
      if (this.keys.pixabay && results.length < limit) {
        try {
          const res = await fetch(`https://pixabay.com/api/?key=${this.keys.pixabay}&q=${encodeURIComponent(query)}&per_page=${limit}`);
          if (res.ok) {
            const data = await res.json();
            for (const hit of data.hits || []) {
              results.push({
                id: `pixabay-${hit.id}`,
                source: "pixabay",
                type: "image",
                url: hit.largeImageURL || hit.webformatURL,
                thumbnailUrl: hit.previewURL,
                title: hit.tags || "Pixabay image",
                author: hit.user,
                license: "Pixabay Content License (free to use, no attribution required)",
                width: hit.imageWidth,
                height: hit.imageHeight,
                tags: hit.tags?.split(", "),
              });
            }
          }
        } catch {
          /* continue */
        }
      }

      // --- MusicBrainz (metadata only, free, no key) ---
      if (type === "audio") {
        try {
          const res = await fetch(`https://musicbrainz.org/ws/2/recording/?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}`, {
            headers: { "User-Agent": "VidForgeEditor/1.0 (video editor)" },
          });
          if (res.ok) {
            const data = await res.json();
            for (const rec of data.recordings || []) {
              const artist = rec["artist-credit"]?.[0]?.name || "Unknown";
              results.push({
                id: `mb-${rec.id}`,
                source: "musicbrainz",
                type: "audio",
                url: "",
                thumbnailUrl: "",
                title: rec.title || "Unknown track",
                author: artist,
                license: "Metadata only — verify rights before use",
                duration: rec.length ? rec.length / 1000 : undefined,
              });
            }
          }
        } catch {
          /* continue */
        }

        // --- Deezer preview streams ---
        if (this.keys.deezer && results.length < limit) {
          try {
            const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=${limit}`);
            if (res.ok) {
              const data = await res.json();
              for (const track of data.data || []) {
                results.push({
                  id: `dz-${track.id}`,
                  source: "deezer",
                  type: "audio",
                  url: track.preview || "",
                  thumbnailUrl: track.album?.cover_small || "",
                  title: track.title || "Unknown track",
                  author: track.artist?.name || "Unknown",
                  license: "Deezer preview — 30s sample, verify rights before use",
                  duration: track.duration,
                });
              }
            }
          } catch {
            /* continue */
          }
        }

        // --- Freesound ---
        if (this.keys.freesound && results.length < limit) {
          try {
            const res = await fetch(`https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(query)}&fields=id,name,previews,username,license,url,duration&page_size=${Math.min(20, limit)}`, {
              headers: { Authorization: `Token ${this.keys.freesound}` },
            });
            if (res.ok) {
              const data = await res.json();
              for (const s of data.results || []) {
                results.push({
                  id: `fs-${s.id}`,
                  source: "freesound",
                  type: "audio",
                  url: s.previews?.["preview-hq-mp3"] || s.previews?.["preview-lq-mp3"] || "",
                  thumbnailUrl: "",
                  title: s.name || "Freesound sample",
                  author: s.username || "Unknown",
                  license: s.license || "CC — verify specific license",
                  duration: s.duration,
                });
              }
            }
          } catch {
            /* continue */
          }
        }
      }

      if (!results.length) {
        throw new Error("No media found — configure at least one provider (Unsplash, Pexels, Pixabay, Deezer, Freesound)");
      }
      // dedupe and sort: prefer results with playable URLs
      const seen = new Set<string>();
      return {
        results: results.filter((r) => {
          if (seen.has(r.id) || !r.url) return false;
          seen.add(r.id);
          return true;
        }).slice(0, limit),
      };
    });
  }

  // -------------------------------------------------------------------------
  // Full prompt-to-production pipeline
  // -------------------------------------------------------------------------
  async fullProductionPipeline(
    prompt: string,
    options: {
      targetUrl?: string;
      duration?: number;
      style?: string;
      withAvatar?: boolean;
      withMusic?: boolean;
      onTask?: (task: AiTask) => void;
    } = {}
  ): Promise<{ tasks: AiTask[]; script: string; slides: PresentationSlide[]; audioUrl?: string; avatarUrl?: string; media: SearchResult[]; music: SearchResult[] }> {
    const tasks: AiTask[] = [];
    const mkTask = (type: AiTask["type"], input: Record<string, unknown>): string => {
      const id = `task-${Date.now()}-${tasks.length}`;
      const t: AiTask = { id, type, status: "pending", progress: 0, input, createdAt: Date.now(), updatedAt: Date.now() };
      tasks.push(t);
      this.registerTask(t); // register in service so executeTask reuses THIS object
      if (options.onTask) options.onTask(t);
      return id;
    };

    // Phase 1: research (parallel-safe)
    const scrapeId = options.targetUrl ? mkTask("scrape", { url: options.targetUrl }) : null;
    if (scrapeId && options.targetUrl) {
      void this.scrapeResearchData(scrapeId, options.targetUrl).then((res) => {
        if (res.success) options.onTask?.({ ...this.getTask(scrapeId)!, status: "completed", progress: 100 });
      });
    }

    // Phase 2: script
    const scriptId = mkTask("script", { prompt });
    const scriptRes = await this.generatePresentationScript(scriptId, prompt, { duration: options.duration, tone: options.style });

    // Phase 3: TTS (if ElevenLabs configured)
    let audioUrl: string | undefined;
    if (this.keys.elevenLabs && scriptRes.data?.script) {
      const ttsId = mkTask("tts", { text: scriptRes.data.script.slice(0, 500) });
      const tts = await this.textToSpeech(ttsId, scriptRes.data.script, {});
      if (tts.success) audioUrl = tts.data?.audioUrl;
    }

    // Phase 4: avatar
    let avatarUrl: string | undefined;
    if (options.withAvatar) {
      const avId = mkTask("avatar", { scriptText: scriptRes.data?.script || "" });
      const av = await this.generateAvatarLayer(avId, scriptRes.data?.script || prompt);
      if (av.success) avatarUrl = av.data?.imageUrl;
    }

    // Phase 5: media search
    const mediaId = mkTask("search-media", { query: prompt, type: "image" });
    const mediaRes = await this.searchMedia(mediaId, prompt, { type: "image", limit: 8 });

    // Phase 6: music
    let music: SearchResult[] = [];
    if (options.withMusic) {
      const musicId = mkTask("search-audio", { query: prompt, mood: options.style });
      const musicRes = await this.searchMedia(musicId, prompt, { type: "audio", limit: 4, mood: options.style });
      if (musicRes.success) music = musicRes.data?.results || [];
    }

    // wait briefly for the fire-and-forget scrape to at least start
    if (scrapeId && options.targetUrl) {
      await new Promise((r) => setTimeout(r, 800));
    }

    return {
      tasks: tasks.map((t) => this.getTask(t.id) || t), // live task objects
      script: scriptRes.data?.script || "",
      slides: scriptRes.data?.slides || [],
      audioUrl,
      avatarUrl,
      media: mediaRes.data?.results || [],
      music,
    };
  }
}