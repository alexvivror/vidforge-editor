// ---------- Thumbnail generation (async, off main thread where possible) ----------
import { idbPutThumb } from "@/lib/indexeddb/db";

export async function generateThumbnail(
  source: HTMLVideoElement | HTMLImageElement | Blob,
  id: string,
  width = 320
): Promise<string | null> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    const img = source instanceof Blob ? null : source;

    // load blob source into element first
    let el = img;
    if (source instanceof Blob) {
      const url = URL.createObjectURL(source);
      const video = document.createElement("video");
      video.muted = true;
      video.src = url;
      await new Promise<void>((resolve) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => resolve();
        setTimeout(resolve, 3000);
      });
      if (video.videoWidth) {
        el = video;
        try { video.currentTime = Math.min(0.5, video.duration || 0.5); } catch { /* ignore */ }
        await new Promise((r) => setTimeout(r, 200));
      } else {
        const image = new Image();
        image.src = url;
        await new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve(); });
        el = image;
      }
    }

    if (!el || (!(el instanceof HTMLVideoElement) && !(el as HTMLImageElement).naturalWidth)) {
      URL.revokeObjectURL((el as HTMLVideoElement)?.src || "");
      return null;
    }
    const w = el instanceof HTMLVideoElement ? el.videoWidth : (el as HTMLImageElement).naturalWidth;
    const h = el instanceof HTMLVideoElement ? el.videoHeight : (el as HTMLImageElement).naturalHeight;
    if (!w || !h) return null;
    canvas.height = Math.round((width * h) / w);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(el as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
    if (source instanceof Blob) URL.revokeObjectURL((el as HTMLVideoElement).src || "");
    // cache in IndexedDB
    void idbPutThumb(id, dataUrl).catch(() => {});
    return dataUrl;
  } catch {
    return null;
  }
}
