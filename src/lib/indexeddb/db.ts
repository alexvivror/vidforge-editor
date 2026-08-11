// ---------- IndexedDB storage abstraction for projects ----------
// Media blobs (videos/images/audio) are stored as records keyed by id;
// project metadata references them. All access goes through this module so
// the implementation can be swapped later without touching the editor.

const DB_NAME = "vidforge-editor-db";
const DB_VER = 2;
const STORES = ["projects", "media", "thumbs"] as const;

let _db: IDBDatabase | null = null;
let _openPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_openPromise) return _openPromise;
  _openPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      _db = req.result;
      _db.onversionchange = () => { _db?.close(); _db = null; };
      resolve(_db);
    };
    req.onerror = () => reject(req.error);
  });
  return _openPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function txAll<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return tx(store, mode, fn);
}

// ---------------- projects ----------------

export interface ProjectMeta {
  id: string;
  name: string;
  duration: number;
  width: number;
  height: number;
  format: string;
  updatedAt: number;
  thumb?: string; // data-url or object url id
}

export async function idbSaveProject(project: unknown): Promise<void> {
  await txAll("projects", "readwrite", (s) => s.put(project));
}

export async function idbLoadProject(id: string): Promise<unknown | undefined> {
  return txAll("projects", "readonly", (s) => s.get(id));
}

export async function idbListProjects(): Promise<unknown[]> {
  return txAll("projects", "readonly", (s) => s.getAll());
}

export async function idbDeleteProject(id: string): Promise<void> {
  await txAll("projects", "readwrite", (s) => s.delete(id));
}

// ---------------- media blobs ----------------

export async function idbPutMedia(id: string, blob: Blob, kind: string): Promise<void> {
  await txAll("media", "readwrite", (s) => s.put({ id, blob, kind }));
}

export async function idbGetMedia(id: string): Promise<Blob | undefined> {
  const rec = await txAll<{ blob: Blob } | undefined>("media", "readonly", (s) => s.get(id));
  return rec?.blob;
}

export async function idbDeleteMedia(id: string): Promise<void> {
  await txAll("media", "readwrite", (s) => s.delete(id));
}

// ---------------- thumbnails ----------------

export async function idbPutThumb(id: string, dataUrl: string): Promise<void> {
  await txAll("thumbs", "readwrite", (s) => s.put({ id, dataUrl }));
}

export async function idbGetThumb(id: string): Promise<string | undefined> {
  const rec = await txAll<{ dataUrl: string } | undefined>("thumbs", "readonly", (s) => s.get(id));
  return rec?.dataUrl;
}

// ---------------- storage usage ----------------

export async function idbStorageUsage(): Promise<{ bytes: number; count: number }> {
  if (!navigator.storage?.estimate) return { bytes: 0, count: 0 };
  try {
    const est = await navigator.storage.estimate();
    return { bytes: est.usage || 0, count: 0 };
  } catch {
    return { bytes: 0, count: 0 };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export async function idbClearAll(): Promise<void> {
  const db = await openDB();
  await Promise.all(STORES.map((s) => new Promise<void>((resolve, reject) => {
    const t = db.transaction(s, "readwrite");
    t.objectStore(s).clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  })));
}
