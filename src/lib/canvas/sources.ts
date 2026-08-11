// ---------- Media source registry (object URLs held in memory) ----------
// Video/image elements have w/h; audio elements only play (w/h = 0).

const sourceCache = new Map<string, { el: HTMLVideoElement | HTMLImageElement | HTMLAudioElement; w: number; h: number }>();

export function cacheSource(id: string, el: HTMLVideoElement | HTMLImageElement | HTMLAudioElement) {
  const w = el instanceof HTMLVideoElement ? el.videoWidth : (el as HTMLImageElement).naturalWidth || 0;
  const h = el instanceof HTMLVideoElement ? el.videoHeight : (el as HTMLImageElement).naturalHeight || 0;
  sourceCache.set(id, { el, w, h });
}

export function getSource(id: string) {
  return sourceCache.get(id);
}

export function clearSources() {
  sourceCache.forEach(({ el }) => {
    if (el instanceof HTMLVideoElement || el instanceof HTMLAudioElement) {
      el.pause();
      const src = el.currentSrc || el.src;
      if (src && src.startsWith("blob:")) URL.revokeObjectURL(src);
    }
  });
  sourceCache.clear();
}
