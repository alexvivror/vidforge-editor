"use client";

// ---------- Auto-save: debounced IndexedDB persistence of the project ----------
import { useEffect, useRef } from "react";
import { useEditor } from "@/stores/useStore";
import { idbSaveProject } from "@/lib/indexeddb/db";
import type { Project } from "@/types";

const DEBOUNCE_MS = 800;

export function useAutoSave() {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = useEditor.subscribe((state, prev) => {
      if (state.project === prev.project) return;
      if (state.project.updatedAt === prev.project.updatedAt) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void idbSaveProject(state.project as Project);
      }, DEBOUNCE_MS);
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      unsub();
    };
  }, []);
}
