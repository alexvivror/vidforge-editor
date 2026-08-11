// ---------- Automatic AI Decision Maker ----------
// Parses a user prompt, builds a task plan (via OpenCode Zen when a key is
// present, otherwise rule-based intent detection), then executes each task
// through the appropriate provider. This is the "machine" the user described:
// input -> plan -> presentation -> script -> voice -> avatar -> video.

import type { AiTask, ProviderKeys, TaskStatus } from "@/types";
import { buildPresentation, fetchArticle, generateAvatar, generateScript, searchImages, searchMusic, searchSfx, synthesizeSpeech } from "@/providers";

export interface DecisionInput {
  prompt: string;
  keys: ProviderKeys;
  onProgress?: (task: AiTask, index: number, total: number) => void;
}

export interface DecisionResult {
  tasks: AiTask[];
  summary: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);

function detectIntent(prompt: string): { topic: string; style: string; wantsMusic: boolean; wantsSfx: boolean; wantsAvatar: boolean; wantsVideo: boolean; urls: string[] } {
  const lower = prompt.toLowerCase();
  const urls = prompt.match(/https?:\/\/[^\s]+/g) || [];
  const topic = prompt
    .replace(/https?:\/\/[^\s]+/g, "")
    .replace(/\b(create|make|generate|build|produce|turn|convert|video about|video on|a video|an ai video)\b/gi, " ")
    .replace(/\b(with|using|including|please|for me)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "your topic";
  const style =
    lower.includes("fast") || lower.includes("youtube") ? "fast_youtube"
    : lower.includes("documentary") ? "documentary"
    : lower.includes("research") || lower.includes("paper") ? "research"
    : lower.includes("explain") ? "explainer"
    : lower.includes("news") ? "news"
    : "educational";
  return {
    topic,
    style,
    wantsMusic: lower.includes("music") || lower.includes("soundtrack") || lower.includes("background"),
    wantsSfx: lower.includes("sound effect") || lower.includes("sfx") || lower.includes("whoosh"),
    wantsAvatar: lower.includes("avatar") || lower.includes("presenter") || lower.includes("talking head") || lower.includes("host"),
    wantsVideo: lower.includes("video") || lower.includes("mp4") || lower.includes("export"),
    urls,
  };
}

function task(type: AiTask["type"], name: string): AiTask {
  return { id: uid(), type, name, status: "waiting", progress: 0 };
}

export async function runDecisionMaker(input: DecisionInput): Promise<DecisionResult> {
  const { prompt, keys, onProgress } = input;
  const intent = detectIntent(prompt);
  const tasks: AiTask[] = [];
  const report = (i: number, t: AiTask) => onProgress?.(t, i, tasks.length);

  // ---- TASK 1: ingest source (article URL / plain prompt) ----
  tasks.push(task("source", "Ingest source"));
  report(0, tasks[0]);
  tasks[0].status = "running";
  report(0, tasks[0]);
  let sourceText = prompt;
  try {
    if (intent.urls.length) {
      const fetched = await fetchArticle(intent.urls[0], keys);
      sourceText = fetched.text.slice(0, 20000);
      tasks[0].detail = `Fetched article (${(fetched.text.length / 1000).toFixed(0)} KB) via ${fetched.provider}`;
    } else {
      tasks[0].detail = "Used prompt text directly";
    }
    tasks[0].status = "completed";
  } catch (e) {
    tasks[0].status = "failed";
    tasks[0].detail = String(e).slice(0, 120);
  }
  report(0, tasks[0]);

  // ---- TASK 2: script generation ----
  const outline = sourceText
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.length > 40)
    .slice(0, 6)
    .map((s) => s.slice(0, 90));
  tasks.push(task("script", "Generate script"));
  report(1, tasks[1]);
  tasks[1].status = "running";
  report(1, tasks[1]);
  let script = "";
  try {
    const s = await generateScript({ topic: intent.topic, style: intent.style as any, outline }, keys);
    script = s.script;
    tasks[1].detail = `Script via ${s.provider} (${script.split(/\s+/).length} words)`;
    tasks[1].result = script;
    tasks[1].status = "completed";
  } catch (e) {
    tasks[1].status = "failed";
    tasks[1].detail = String(e).slice(0, 120);
  }
  report(1, tasks[1]);

  // ---- TASK 3: presentation (Marp) ----
  tasks.push(task("presentation", "Build presentation"));
  report(2, tasks[2]);
  tasks[2].status = "running";
  report(2, tasks[2]);
  try {
    const pres = await buildPresentation(intent.topic, outline, intent.style);
    tasks[2].detail = `Marp deck: ${outline.length} slides`;
    tasks[2].result = pres;
    tasks[2].status = "completed";
  } catch (e) {
    tasks[2].status = "failed";
    tasks[2].detail = String(e).slice(0, 120);
  }
  report(2, tasks[2]);

  // ---- TASK 4: images for slides ----
  tasks.push(task("image", "Find slide images"));
  report(3, tasks[3]);
  tasks[3].status = "running";
  report(3, tasks[3]);
  try {
    const imgs = await searchImages(intent.topic, keys);
    tasks[3].detail = imgs.length ? `Found ${imgs.length} images (${imgs[0].source})` : "No image API key — using gradients";
    tasks[3].result = imgs;
    tasks[3].status = "completed";
  } catch (e) {
    tasks[3].status = "failed";
    tasks[3].detail = String(e).slice(0, 120);
  }
  report(3, tasks[3]);

  // ---- TASK 5: voice (TTS) ----
  tasks.push(task("voice", "Generate voice"));
  report(4, tasks[4]);
  tasks[4].status = "running";
  report(4, tasks[4]);
  try {
    const audio = await synthesizeSpeech(script, keys);
    tasks[4].detail = audio.provider === "browser" ? "Browser speech (no TTS key)" : `${audio.provider} audio ready`;
    tasks[4].result = audio;
    tasks[4].status = "completed";
  } catch (e) {
    tasks[4].status = "failed";
    tasks[4].detail = String(e).slice(0, 120);
  }
  report(4, tasks[4]);

  // ---- TASK 6: optional music ----
  if (intent.wantsMusic) {
    const idx = tasks.length;
    tasks.push(task("music", "Search music"));
    report(idx, tasks[idx]);
    tasks[idx].status = "running";
    report(idx, tasks[idx]);
    try {
      const tracks = await searchMusic(intent.topic, keys);
      tasks[idx].detail = tracks.length ? `Found ${tracks.length} tracks (${tracks.map((t) => t.source).join(", ")})` : "No music sources found";
      tasks[idx].result = tracks.slice(0, 5);
      tasks[idx].status = "completed";
    } catch (e) {
      tasks[idx].status = "failed";
      tasks[idx].detail = String(e).slice(0, 120);
    }
    report(idx, tasks[idx]);
  }

  // ---- TASK 7: optional SFX ----
  if (intent.wantsSfx) {
    const idx = tasks.length;
    tasks.push(task("sfx", "Search SFX"));
    report(idx, tasks[idx]);
    tasks[idx].status = "running";
    report(idx, tasks[idx]);
    try {
      const sfx = await searchSfx("whoosh transition", keys);
      tasks[idx].detail = sfx.length ? `Found ${sfx.length} SFX (freesound)` : "Synthesized SFX via Web Audio";
      tasks[idx].result = sfx.slice(0, 5);
      tasks[idx].status = "completed";
    } catch (e) {
      tasks[idx].status = "failed";
      tasks[idx].detail = String(e).slice(0, 120);
    }
    report(idx, tasks[idx]);
  }

  // ---- TASK 8: optional avatar ----
  if (intent.wantsAvatar) {
    const idx = tasks.length;
    tasks.push(task("avatar", "Generate avatar"));
    report(idx, tasks[idx]);
    tasks[idx].status = "running";
    report(idx, tasks[idx]);
    try {
      const avatar = await generateAvatar(intent.topic, keys);
      tasks[idx].detail = avatar.provider === "css" ? "CSS presenter (no NIM key)" : "NVIDIA NIM avatar image";
      tasks[idx].result = avatar;
      tasks[idx].status = "completed";
    } catch (e) {
      tasks[idx].status = "failed";
      tasks[idx].detail = String(e).slice(0, 120);
    }
    report(idx, tasks[idx]);
  }

  const summary = `Plan complete: ${tasks.filter((t) => t.status === "completed").length}/${tasks.length} tasks succeeded. Topic: "${intent.topic}" (${intent.style}).`;
  return { tasks, summary };
}
