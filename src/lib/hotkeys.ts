"use client";

// ---------- Keyboard shortcuts (desktop) ----------
// Space: play/pause · Ctrl/Cmd+Z: undo · Ctrl/Cmd+Y / Ctrl+Shift+Z: redo
// S: split · Delete: remove clip · Ctrl/Cmd+S: save · Escape: close panels
import { useEffect } from "react";
import { useEditor } from "@/stores/useStore";
import { useHistory } from "@/stores/history";

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName);
      const mod = e.ctrlKey || e.metaKey;

      // Save
      if (mod && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        const { project } = useEditor.getState();
        void import("@/lib/indexeddb/db").then((m) => m.idbSaveProject(project));
        return;
      }
      // Undo / Redo
      if (mod && e.key === "z") {
        e.preventDefault();
        if (e.shiftKey) doRedo();
        else doUndo();
        return;
      }
      if (mod && e.key === "y") { e.preventDefault(); doRedo(); return; }
      if (typing) return;

      // Play / pause
      if (e.code === "Space") {
        e.preventDefault();
        const { playing, setPlaying } = useEditor.getState();
        setPlaying(!playing);
        return;
      }
      // Delete selected clip
      if (e.key === "Delete" || e.key === "Backspace") {
        const { selectedClipId, removeClip, setSelectedClip } = useEditor.getState();
        if (selectedClipId) {
          e.preventDefault();
          removeClip(selectedClipId);
          setSelectedClip(null);
        }
        return;
      }
      // Split at playhead (simple: duplicate clip at position)
      if (e.key === "s" || e.key === "S") {
        const { project, selectedClipId, addClip, updateClip, currentTime } = useEditor.getState();
        const trackIdx = project.tracks.findIndex((t) => t.clips.some((c) => c.id === selectedClipId));
        const clip = trackIdx >= 0
          ? (project.tracks[trackIdx].clips as { id: string; duration: number; position: number; start?: number }[]).find((c) => c.id === selectedClipId)
          : undefined;
        if (clip) {
          const local = currentTime - clip.position;
          if (local > 0.1 && local < clip.duration - 0.1) {
            addClip(trackIdx, { ...clip, id: undefined, position: currentTime, duration: clip.duration - local, start: (clip.start || 0) + local });
            updateClip(clip.id, { duration: local });
          }
        }
        return;
      }
      // Escape closes panels
      if (e.key === "Escape") {
        const { setPanel } = useEditor.getState();
        setPanel(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function doUndo() {
  const { project, setProject } = useEditor.getState();
  const prev = useHistory.getState().undo(project);
  if (prev) setProject(prev as never);
}
function doRedo() {
  const { project, setProject } = useEditor.getState();
  const next = useHistory.getState().redo(project);
  if (next) setProject(next as never);
}
