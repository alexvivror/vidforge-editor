"use client";

// ---------- Voice recording (MediaRecorder) ----------
export class VoiceRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startedAt = 0;

  onData?: (blob: Blob, duration: number) => void;
  onTick?: (seconds: number) => void;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.chunks = [];
    this.mediaRecorder.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType || "audio/webm" });
      const duration = (Date.now() - this.startedAt) / 1000;
      this.stream?.getTracks().forEach((t) => t.stop());
      this.onData?.(blob, duration);
    };
    this.mediaRecorder.start();
    this.startedAt = Date.now();
    this.timer = setInterval(() => {
      this.onTick?.((Date.now() - this.startedAt) / 1000);
    }, 200);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.mediaRecorder?.stop();
  }

  pause(): void {
    this.mediaRecorder?.pause();
  }

  resume(): void {
    this.mediaRecorder?.resume();
  }

  get isRecording(): boolean {
    return this.mediaRecorder?.state === "recording";
  }
}
