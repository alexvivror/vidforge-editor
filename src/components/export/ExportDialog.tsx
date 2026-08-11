"use client";

// ---------- Export dialog: format / resolution / fps / quality + progress ----------
import { useEffect, useRef, useState } from "react";
import { recordCanvas } from "@/lib/webcodecs/codecs";

const RESOLUTIONS = [
  { label: "480p", w: 854, h: 480 },
  { label: "720p", w: 1280, h: 720 },
  { label: "1080p", w: 1920, h: 1080 },
];
const QUALITIES = [
  { label: "Low", bitrate: 4_000_000 },
  { label: "Medium", bitrate: 8_000_000 },
  { label: "High", bitrate: 16_000_000 },
];

interface ExportDialogProps {
  canvas: HTMLCanvasElement | null;
  duration: number;
  fps: number;
  onClose: () => void;
  onDone?: (blob: Blob, mime: string) => void;
}

export default function ExportDialog({ canvas, duration, fps, onClose, onDone }: ExportDialogProps) {
  const [format, setFormat] = useState("mp4");
  const [res, setRes] = useState(1); // index into RESOLUTIONS
  const [quality, setQuality] = useState(1);
  const [progress, setProgress] = useState(0);
  const [eta, setEta] = useState("");
  const [done, setDone] = useState<{ url: string; mime: string } | null>(null);
  const [error, setError] = useState("");
  const [webcodecs, setWebcodecs] = useState(true);
  const exporting = useRef(false);

  useEffect(() => {
    setWebcodecs(typeof VideoEncoder !== "undefined" && typeof VideoDecoder !== "undefined");
  }, []);

  const q = QUALITIES[quality];
  // estimate: bitrate (bps) * duration / 8 = bytes; then MB
  const estMB = Math.max(1, Math.round((q.bitrate * duration) / 8 / 1024 / 1024));

  const startExport = async () => {
    if (!canvas || exporting.current) return;
    exporting.current = true;
    setError(""); setDone(null); setProgress(0);
    const t0 = Date.now();
    try {
      const blob = await recordCanvas(canvas, duration, fps, null, (pct: number) => {
        setProgress(pct);
        const elapsed = (Date.now() - t0) / 1000;
        if (pct > 0) setEta(`~${Math.round((elapsed / pct) * (100 - pct))}s remaining`);
      });
      setProgress(100);
      setEta("Done");
      const url = URL.createObjectURL(blob);
      setDone({ url, mime: blob.type });
      onDone?.(blob, blob.type);
    } catch (e: any) {
      setError(e?.message || "Export failed");
    } finally {
      exporting.current = false;
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-head">
          <h3>Export Video</h3>
          <button className="icon-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="grid-2" style={{ gap: 10 }}>
            <div className="field">
              <label>Format</label>
              <select className="select" value={format} onChange={(e) => setFormat(e.target.value)}>
                <option value="mp4">MP4</option>
                <option value="webm">WebM</option>
              </select>
            </div>
            <div className="field">
              <label>Resolution</label>
              <select className="select" value={res} onChange={(e) => setRes(+e.target.value)}>
                {RESOLUTIONS.map((x, i) => <option key={x.label} value={i}>{x.label} · {x.w}×{x.h}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Frame Rate</label>
              <select className="select" defaultValue={fps}>
                <option value={fps}>{fps} FPS</option>
                <option value={30}>30 FPS</option>
                <option value={60}>60 FPS</option>
              </select>
            </div>
            <div className="field">
              <label>Quality</label>
              <select className="select" value={quality} onChange={(e) => setQuality(+e.target.value)}>
                {QUALITIES.map((x, i) => <option key={x.label} value={i}>{x.label}</option>)}
              </select>
            </div>
          </div>

          <div className="hint" style={{ marginBottom: 12 }}>
            Estimated size: <strong>~{estMB} MB</strong> · {webcodecs ? "WebCodecs accelerated" : "compatibility mode (MediaRecorder)"}
          </div>

          <label className="checkbox-row">
            <input type="checkbox" defaultChecked /> Include captions
          </label>

          {progress > 0 && progress < 100 && (
            <div style={{ margin: "12px 0" }}>
              <div className="progress-bar" style={{ height: 8 }}>
                <div style={{ width: `${progress}%` }} />
              </div>
              <div className="hint" style={{ marginTop: 6 }}>Encoding {Math.round(progress)}% · {eta}</div>
            </div>
          )}
          {done && (
            <div className="success-box" style={{ marginTop: 12 }}>
              <div style={{ marginBottom: 8 }}>✅ Export ready ({done.mime})</div>
              <a className="btn btn-primary btn-sm" href={done.url} download={`vidforge-export.${format}`}>⬇ Download</a>
            </div>
          )}
          {error && <div className="error-box" style={{ marginTop: 12 }}>{error}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn btn-primary" onClick={startExport} disabled={exporting.current || progress >= 100}>
            {exporting.current ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
