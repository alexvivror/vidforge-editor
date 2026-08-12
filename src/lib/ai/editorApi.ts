"use client";

// editorApi.ts — Concrete EditorCommandApi backed by the Zustand editor store.
// The AI layer (added later) drives the editor through this object only.

import type { Clip, Project } from "@/types";
import { useEditor } from "@/stores/useStore";
import { useHistory } from "@/stores/history";
import type { CommandExecutor, EditorCommand, EditorCommandApi, EditorEvent } from "./aiCommands";

const listeners = new Set<(e: EditorEvent) => void>();

function emit(e: EditorEvent) {
  listeners.forEach((fn) => {
    try { fn(e); } catch { /* listener errors are non-fatal */ }
  });
}

/** Wrap every command in a single undoable transaction. */
function withTransaction(fn: () => void) {
  const { project } = useEditor.getState();
  useHistory.getState().push(project);
  fn();
  emit({ type: "project.changed", project: useEditor.getState().project });
}

export const executeCommand: CommandExecutor = (command: EditorCommand) => {
  const store = useEditor.getState();
  const project = () => useEditor.getState().project;
  const findClip = (clipId: string) =>
    useEditor.getState().project.tracks.flatMap((t) => t.clips).find((c) => c.id === clipId);

  switch (command.type) {
    case "project.create": {
      const { project, currentTime, selectedClipId } = store;
      void import("@/lib/indexeddb/db");
      store.setProject({
        name: command.name,
        width: command.width,
        height: command.height,
        fps: command.fps,
        format: command.format,
      });
      emit({ type: "playhead.moved", time: currentTime });
      break;
    }

    case "project.rename":
      withTransaction(() => store.setProject({ name: command.name }));
      break;

    case "project.setResolution":
      withTransaction(() => store.setProject({ width: command.width, height: command.height }));
      break;

    case "track.add": {
      withTransaction(() => {
        const trackId = Math.random().toString(36).slice(2, 10);
        const track = {
          id: trackId,
          name: command.name || command.kind,
          kind: command.kind,
          clips: [] as Clip[],
        };
        store.addTrack(track);
      });
      break;
    }

    case "track.remove":
      withTransaction(() => store.removeTrack(command.trackId));
      break;

    case "track.rename":
      withTransaction(() => store.renameTrack(command.trackId, command.name));
      break;

    case "track.setMuted":
      withTransaction(() => store.setTrackMuted(command.trackId, command.muted));
      break;

    case "track.setLocked":
      withTransaction(() => store.setTrackLocked(command.trackId, command.locked));
      break;

    case "track.setVisible":
      withTransaction(() => store.setTrackVisible(command.trackId, command.visible));
      break;

    case "clip.add": {
      withTransaction(() => {
        const project = store.project;
        const trackIdx = project.tracks.findIndex((t) => t.id === command.trackId);
        if (trackIdx < 0) return;
        const id = Math.random().toString(36).slice(2, 10);
        store.addClip(trackIdx, { id, ...command.clip } as Partial<Clip>);
        emit({ type: "clip.added", clipId: id, trackId: command.trackId });
      });
      break;
    }

    case "clip.remove":
      withTransaction(() => {
        store.removeClip(command.clipId);
        emit({ type: "clip.removed", clipId: command.clipId });
      });
      break;

    case "clip.update":
      withTransaction(() => {
        store.updateClip(command.clipId, command.changes);
        emit({ type: "clip.updated", clipId: command.clipId });
      });
      break;

    case "clip.move":
      withTransaction(() => {
        store.updateClip(command.clipId, { position: command.position });
        if (command.trackId) {
          // move across tracks: remove from current, add to target
          const project = store.project;
          const from = project.tracks.findIndex((t) => t.clips.some((c) => c.id === command.clipId));
          const to = project.tracks.findIndex((t) => t.id === command.trackId);
          if (from >= 0 && to >= 0 && from !== to) {
            const clip = project.tracks[from].clips.find((c) => c.id === command.clipId);
            if (clip) {
              store.removeClip(command.clipId);
              store.addClip(to, { ...clip, position: command.position } as Partial<Clip>);
            }
          }
        }
      });
      break;

    case "clip.trim":
      withTransaction(() => {
        const clip = findClip(command.clipId);
        if (!clip) return;
        store.updateClip(command.clipId, {
          position: command.start,
          duration: command.duration,
          start: (clip.start || 0) + (command.start - clip.position),
          end: (clip.start || 0) + (command.start - clip.position) + command.duration,
        });
      });
      break;

    case "clip.split": {
      withTransaction(() => {
        const project = store.project;
        const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === command.clipId);
        if (!clip) return;
        const local = command.at - clip.position;
        if (local < 0.1 || local > clip.duration - 0.1) return;
        const trackIdx = project.tracks.findIndex((t) => t.clips.some((c) => c.id === clip.id));
        if (trackIdx < 0) return;
        store.addClip(trackIdx, {
          ...clip,
          id: Math.random().toString(36).slice(2, 10),
          position: command.at,
          duration: clip.duration - local,
          start: (clip.start || 0) + local,
        } as Partial<Clip>);
        store.updateClip(clip.id, { duration: local });
      });
      break;
    }

    case "clip.duplicate": {
      withTransaction(() => {
        const clip = findClip(command.clipId);
        if (!clip) return;
        const trackIdx = project().tracks.findIndex((t) => t.clips.some((c) => c.id === command.clipId));
        if (trackIdx < 0) return;
        const id = Math.random().toString(36).slice(2, 10);
        store.addClip(trackIdx, { ...clip, id, position: clip.position + clip.duration } as Partial<Clip>);
        emit({ type: "clip.added", clipId: id, trackId: project().tracks[trackIdx].id });
      });
      break;
    }

    case "clip.setTransform":
      withTransaction(() => {
        const project = store.project;
        const clip = project.tracks.flatMap((t) => t.clips).find((c) => c.id === command.clipId);
        if (!clip) return;
        store.updateClip(command.clipId, { transform: { ...clip.transform, ...command.transform } as Clip["transform"] });
      });
      break;

    case "clip.setVolume":
      withTransaction(() => store.updateClip(command.clipId, { volume: command.volume }));
      break;

    case "clip.setSpeed":
      withTransaction(() => store.updateClip(command.clipId, { speed: command.speed }));
      break;

    case "clip.setText":
      withTransaction(() => store.updateClip(command.clipId, { text: command.text }));
      break;

    case "clip.setEffect":
      withTransaction(() => store.updateClip(command.clipId, { effects: [command.effect] }));
      break;

    case "timeline.seek":
      store.setCurrentTime(command.time);
      emit({ type: "playhead.moved", time: command.time });
      break;

    case "timeline.play":
      store.setPlaying(true);
      emit({ type: "playback.started" });
      break;

    case "timeline.pause":
      store.setPlaying(false);
      emit({ type: "playback.stopped" });
      break;

    case "timeline.setDuration":
      withTransaction(() => store.setProject({ duration: command.duration }));
      break;

    case "project.save":
      void import("@/lib/indexeddb/db").then((m) => m.idbSaveProject(store.project));
      break;

    case "export.start":
      // Export is UI-driven (ExportDialog); AI can request it, the UI opens the dialog.
      emit({ type: "export.completed", url: "", mime: "" });
      break;

    case "project.load":
      store.setProject(command.project as Partial<Project>);
      emit({ type: "project.changed", project: command.project });
      break;

    default: {
      const exhaustive: never = command;
      console.warn("Unknown command", exhaustive);
    }
  }
};

export const editorApi: EditorCommandApi = {
  execute: executeCommand,
  onEvent: (handler) => {
    listeners.add(handler);
    return () => listeners.delete(handler);
  },
  getProject: () => useEditor.getState().project,
  isBusy: () => useEditor.getState().aiRunning,
};

/** Convenience: expose the API on window for the future AI layer / console debugging. */
if (typeof window !== "undefined") {
  (window as unknown as { vidforge?: EditorCommandApi }).vidforge = editorApi;
}
