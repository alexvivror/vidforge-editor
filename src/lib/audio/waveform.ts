// ---------- Async waveform generation (Web Audio, off main thread where possible) ----------

export interface WaveformData {
  peaks: number[];   // 0..1 amplitude per bucket
  duration: number;
}

export async function generateWaveform(url: string, buckets = 180): Promise<WaveformData> {
  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const audio = await ctx.decodeAudioData(buf);
    const channel = audio.getChannelData(0);
    const step = Math.floor(channel.length / buckets) || 1;
    const peaks: number[] = [];
    for (let i = 0; i < buckets && i * step < channel.length; i++) {
      let max = 0;
      for (let j = i * step; j < Math.min((i + 1) * step, channel.length); j++) {
        const v = Math.abs(channel[j]);
        if (v > max) max = v;
      }
      peaks.push(max);
    }
    return { peaks, duration: audio.duration };
  } finally {
    void ctx.close().catch(() => {});
  }
}

/** Tiny canvas waveform renderer (SVG-free, cheap). */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: number[],
  color = "#f5c518",
  progress = 0
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth * dpr;
  const h = canvas.clientHeight * dpr;
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  const barW = w / peaks.length;
  const mid = h / 2;
  const cut = Math.floor(progress * peaks.length);
  for (let i = 0; i < peaks.length; i++) {
    const amp = Math.max(0.04, peaks[i]);
    ctx.fillStyle = i < cut ? color : "rgba(255,255,255,.25)";
    ctx.fillRect(i * barW + 1, mid - amp * mid, Math.max(1, barW - 2), amp * mid * 2);
  }
}
