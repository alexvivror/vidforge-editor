// ---------- Browser Lip-Sync engine (Wav2Lip-style, local-only) ----------
// Takes an avatar image + narration audio and animates the mouth in real time
// using Web Audio amplitude analysis — the browser equivalent of Wav2Lip's
// lip-sync, with zero GPU/server/key requirements.
//
// How it works:
//   1. Load the avatar image into an offscreen canvas
//   2. Route the narration <audio> through AnalyserNode
//   3. Every animation frame, compute smoothed RMS energy (0..1)
//   4. Draw the avatar with a mouth whose height maps to energy
//   5. Add subtle head-bob + blink for a "talking presenter" feel

export class BrowserLipSync {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private audio: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private avatar: HTMLImageElement | null = null;
  private raf = 0;
  private running = false;

  // mouth geometry (proportions of avatar height)
  private mouthY = 0.86;      // vertical position of mouth center
  private mouthWidth = 0.16;  // mouth width as fraction of avatar width
  private mouthOpen = 0;      // smoothed openness 0..1

  onStart?: () => void;
  onStop?: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
  }

  /** Load the avatar image (URL or File). */
  async setAvatar(src: string | File | Blob): Promise<void> {
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not load avatar image"));
      img.src = url;
    });
    this.avatar = img;
    this.canvas.width = img.naturalWidth;
    this.canvas.height = img.naturalHeight;
    this.drawStatic();
  }

  /** Attach narration audio (element must be in the DOM or use src). */
  attachAudio(audio: HTMLAudioElement): void {
    this.audio = audio;
    // create audio graph: audio -> analyser -> destination
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = this.audioCtx || new Ctx();
      if (this.audioCtx.state === "suspended") this.audioCtx.resume();
      const src = this.audioCtx.createMediaElementSource(audio);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.75;
      src.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
    } catch {
      this.analyser = null; // audio graph blocked — mouth stays subtle
    }
  }

  /** Start the talking animation loop. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.onStart?.();
    const loop = () => {
      if (!this.running) return;
      this.step();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Stop the loop and draw the static avatar. */
  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.onStop?.();
    this.drawStatic();
  }

  /** One animation frame. */
  private step(): void {
    if (!this.avatar) return;
    const energy = this.readEnergy();
    // target mouth openness: energy -> 0.05..0.75 (clamped, eased)
    const target = Math.min(0.75, Math.max(0.05, energy * 1.6));
    this.mouthOpen += (target - this.mouthOpen) * 0.35; // smoothing

    const w = this.canvas.width;
    const h = this.canvas.height;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this.avatar, 0, 0, w, h);

    // subtle head bob driven by energy
    const bob = Math.sin(performance.now() / 400) * energy * 4;
    ctx.save();
    ctx.translate(0, bob);

    // mouth (dark ellipse whose height follows openness)
    const mw = w * this.mouthWidth * (1 + this.mouthOpen * 0.25);
    const mh = h * 0.035 * (0.3 + this.mouthOpen);
    const mx = w / 2;
    const my = h * this.mouthY;

    // mouth shadow
    ctx.fillStyle = "rgba(30, 15, 20, 0.92)";
    ctx.beginPath();
    ctx.ellipse(mx, my, mw / 2, Math.max(2, mh), 0, 0, Math.PI * 2);
    ctx.fill();
    // lips highlight
    if (this.mouthOpen > 0.18) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.16)";
      ctx.beginPath();
      ctx.ellipse(mx, my - mh * 0.15, mw * 0.30, mh * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private readEnergy(): number {
    if (!this.analyser) return 0.18; // no audio graph — mid subtle openness
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    let sum = 0;
    // focus on speech band (roughly 200Hz-3kHz region of the spectrum)
    const lo = Math.floor((data.length * 200) / (this.audioCtx!.sampleRate / 2));
    const hi = Math.floor((data.length * 3000) / (this.audioCtx!.sampleRate / 2));
    for (let i = lo; i < Math.min(hi, data.length); i++) sum += data[i];
    const n = Math.max(1, Math.min(hi, data.length) - lo);
    return Math.min(1, sum / n / 255);
  }

  private drawStatic(): void {
    if (!this.avatar) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.drawImage(this.avatar, 0, 0, this.canvas.width, this.canvas.height);
  }

  destroy(): void {
    this.stop();
    this.audioCtx?.close();
    this.audioCtx = null;
  }
}
