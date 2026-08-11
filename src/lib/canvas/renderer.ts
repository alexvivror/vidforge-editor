// ---------- Canvas renderer: video/image/text/audio clips ----------
// Draws the current frame for a given timeline time. Video elements are
// advanced to (clip.start + localTime) * speed for real playback sync.
import type { Clip } from "@/types";
import { getSource } from "@/lib/canvas/sources";

export interface RenderOptions { muted?: boolean; volume?: number; }

/** Sync audio clips to the timeline time: play/pause + volume + fades. */
export function syncAudio(time: number, audioClips: Clip[], opts: RenderOptions = {}): void {
  for (const clip of audioClips) {
    const src = getSource(clip.src || clip.id);
    if (!src || !(src.el instanceof HTMLAudioElement)) continue;
    const local = time - clip.position;
    const active = local >= 0 && local <= clip.duration;
    if (active) {
      const target = (clip.start || 0) + local * (clip.speed || 1);
      if (Math.abs(src.el.currentTime - target) > 0.1) {
        try { src.el.currentTime = Math.min(target, src.el.duration || target); } catch { /* ignore */ }
      }
      // volume with fades
      let vol = (clip.volume ?? 1) * (opts.volume ?? 1);
      if (clip.muted || opts.muted) vol = 0;
      if (clip.fadeIn && local < clip.fadeIn) vol *= local / clip.fadeIn;
      if (clip.fadeOut && local > clip.duration - clip.fadeOut) {
        vol *= Math.max(0, (clip.duration - local) / clip.fadeOut);
      }
      src.el.volume = Math.max(0, Math.min(1, vol));
      if (src.el.paused) src.el.play().catch(() => {});
    } else if (!src.el.paused) {
      src.el.pause();
    }
  }
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  time: number,
  videoClips: Clip[],
  textClips: Clip[],
  opts: RenderOptions = {}
): void {
  ctx.clearRect(0, 0, cw, ch);
  // base background
  ctx.fillStyle = "#0d0d18";
  ctx.fillRect(0, 0, cw, ch);
  // ---- video / image layer ----
  for (const clip of videoClips) {
    const local = time - clip.position;
    if (local < 0 || local > clip.duration) continue;
    const src = getSource(clip.src || clip.id);
    if (!src) continue;

    // real playback sync: advance media element
    if (src.el instanceof HTMLVideoElement) {
      const target = (clip.start || 0) + local * (clip.speed || 1);
      if (Math.abs(src.el.currentTime - target) > 0.08) {
        try { src.el.currentTime = Math.min(target, src.el.duration || target); } catch { /* not ready */ }
      }
      if (src.el.paused) { src.el.play().catch(() => {}); }
    }

    // transform: fit contain + user scale/rotation/position/flip
    const fit = Math.min(cw / src.w, ch / src.h);
    const dw = src.w * fit * (clip.scale || 1);
    const dh = src.h * fit * (clip.scale || 1);
    ctx.save();
    ctx.globalAlpha = clip.opacity ?? 1;
    ctx.translate(cw / 2 + ((clip.x || 0) / 100) * cw, ch / 2 + ((clip.y || 0) / 100) * ch);
    ctx.rotate(((clip.rotation || 0) * Math.PI) / 180);
    if (clip.flipped) ctx.scale(-1, 1);
    ctx.drawImage(src.el as CanvasImageSource, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();

    // filters (simple pixel ops for supported ones)
    const fx = clip.effects?.[0];
    if (fx && fx !== "none") {
      applySimpleFilter(ctx, cw, ch, fx);
    }
  }

  // ---- text overlay layer ----
  for (const clip of textClips) {
    const local = time - clip.position;
    if (local < 0 || local > clip.duration) continue;
    drawTextClip(ctx, cw, ch, clip, local);
  }
}

function applySimpleFilter(ctx: CanvasRenderingContext2D, cw: number, ch: number, fx: string) {
  try {
    const img = ctx.getImageData(0, 0, cw, ch);
    const d = img.data;
    if (fx === "grayscale") {
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = d[i + 1] = d[i + 2] = g;
      }
    } else if (fx === "sepia") {
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        d[i] = Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b);
        d[i + 1] = Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b);
        d[i + 2] = Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b);
      }
    } else if (fx === "invert") {
      for (let i = 0; i < d.length; i += 4) {
        d[i] = 255 - d[i]; d[i + 1] = 255 - d[i + 1]; d[i + 2] = 255 - d[i + 2];
      }
    } else if (fx === "vignette") {
      // handled after putImageData via gradient
      ctx.putImageData(img, 0, 0);
      const grad = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.35, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.5)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cw, ch);
      return;
    }
    ctx.putImageData(img, 0, 0);
  } catch { /* canvas tainted — skip filter */ }
}

function drawTextClip(ctx: CanvasRenderingContext2D, cw: number, ch: number, clip: Clip, local: number) {
  const text = clip.text || clip.caption || "Text";
  const fs = clip.fontSize || 48;
  const x = cw / 2 + ((clip.x || 0) / 100) * cw;
  const y = ch / 2 + ((clip.y || 0) / 100) * ch;

  ctx.save();
  ctx.globalAlpha = clip.opacity ?? 1;
  ctx.translate(x, y);
  ctx.rotate(((clip.rotation || 0) * Math.PI) / 180);

  // animation: fade / slide-in / zoom based on local time
  const anim = clip.animation || "none";
  const p = Math.min(1, 0.15 + local / 0.5);
  if (anim === "fade") ctx.globalAlpha *= p;
  else if (anim === "slide-in") ctx.translate((1 - Math.min(1, local / 0.5)) * cw * 0.2, 0);
  else if (anim === "zoom") ctx.scale(0.5 + 0.5 * Math.min(1, local / 0.5), 0.5 + 0.5 * Math.min(1, local / 0.5));

  // background pill
  if (clip.background && clip.background !== "none") {
    ctx.font = `700 ${fs}px ${clip.font || "Inter, sans-serif"}`;
    const w = ctx.measureText(text).width;
    const pad = fs * 0.4;
    ctx.fillStyle = clip.background;
    ctx.beginPath();
    ctx.roundRect(-w / 2 - pad, -fs * 0.75, w + pad * 2, fs * 1.5, fs * 0.3);
    ctx.fill();
  }

  ctx.font = `${clip.fontWeight || 700} ${fs}px ${clip.font || "Inter, sans-serif"}`;
  ctx.textAlign = (clip.textAlign as CanvasTextAlign) || "center";
  ctx.textBaseline = "middle";
  if (clip.color) ctx.fillStyle = clip.color;
  // shadow
  ctx.shadowColor = "rgba(0,0,0,.6)";
  ctx.shadowBlur = fs * 0.2;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
