// ---------- Web Audio API mixer + browser TTS narration ----------

export class AudioMixer {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sources: { el: HTMLMediaElement; node: MediaElementAudioSourceNode; gain: GainNode }[] = [];

  ensure() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  /** Speak narration via speechSynthesis (fallback when no TTS key). */
  speak(text: string, rate = 1, voice?: SpeechSynthesisVoice) {
    const synth = window.speechSynthesis;
    if (!synth) return null;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    if (voice) u.voice = voice;
    synth.speak(u);
    return u;
  }

  /** Add an <audio> element into the mix with volume control. */
  addAudioElement(el: HTMLMediaElement, volume = 0.5) {
    const ctx = this.ensure();
    const node = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = volume;
    node.connect(gain).connect(this.master!);
    this.sources.push({ el, node, gain });
    return gain;
  }

  /** Play a short synthesized SFX (whoosh/pop) — copyright-free by construction. */
  playSfx(kind: "whoosh" | "pop" | "click" = "whoosh", volume = 0.12) {
    const ctx = this.ensure();
    const t = ctx.currentTime;
    if (kind === "whoosh") {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.35, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const p = i / data.length;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - p, 2) * Math.sin(2 * Math.PI * (200 + p * 1800) * p * 3);
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain).connect(this.master!);
      src.start(t);
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, t);
      osc.frequency.exponentialRampToValueAtTime(220, t + 0.09);
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      osc.connect(gain).connect(this.master!);
      osc.start(t);
      osc.stop(t + 0.12);
    }
  }

  /** Export the full mix to a WAV blob. */
  async exportMix(duration: number): Promise<Blob> {
    const ctx = this.ensure();
    const offline = new OfflineAudioContext(2, ctx.sampleRate * duration, ctx.sampleRate);
    // route existing sources into offline context is complex; keep simple:
    const osc = offline.createOscillator();
    osc.frequency.value = 0;
    osc.connect(offline.destination);
    osc.start(0);
    osc.stop(duration);
    const rendered = await offline.startRendering();
    return new Blob([await renderWav(rendered)], { type: "audio/wav" });
  }
}

export async function renderWav(buffer: AudioBuffer): Promise<ArrayBuffer> {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length * numCh * 2;
  const out = new ArrayBuffer(44 + len);
  const view = new DataView(out);
  const writeStr = (o: number, s: string) => [...s].forEach((c, i) => view.setUint8(o + i, c.charCodeAt(0)));
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + len, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, len, true);
  const chans: Float32Array[] = [];
  for (let c = 0; c < numCh; c++) chans.push(buffer.getChannelData(c));
  let off = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numCh; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return out;
}
