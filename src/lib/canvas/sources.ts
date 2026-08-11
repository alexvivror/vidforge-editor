// ---------- Video source registry (object URLs held in memory) ----------
// Moved out of the page so pages stay clean for Next.js type checking.

const sourceCache = new Map<string, { el: HTMLVideoElement | HTMLImageElement; w: number; h: number }>();

export function cacheSource(id: string, el: HTMLVideoElement | HTMLImageElement) {
  const w = el instanceof HTMLVideoElement ? el.videoWidth : (el as HTMLImageElement).naturalWidth;
  const h = el instanceof HTMLVideoElement ? el.videoHeight : (el as HTMLImageElement).naturalHeight;
  sourceCache.set(id, { el, w, h });
}

export function getSource(id: string) {
  return sourceCache.get(id);
}

export function clearSources() {
  sourceCache.clear();
}
