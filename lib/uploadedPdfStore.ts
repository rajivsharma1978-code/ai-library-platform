// ── Uploaded PDF payload store (IndexedDB) ─────────────────────────────
// sessionStorage has a small per-origin quota (roughly 5-10MB depending
// on the browser), and a base64 data URL runs about 33% larger than the
// source file — so uploading anything past a few MB threw
// QuotaExceededError on `sessionStorage.setItem`. IndexedDB's practical
// quota is a share of free disk space (typically hundreds of MB+) and,
// like sessionStorage, survives client-side navigation AND a full page
// reload — this is a drop-in replacement for the PDF *payload* only.
// The small pointer fields (upload id / file name / page count) still
// live in sessionStorage since they're tiny and something needs to be
// readable synchronously on first render (see PremiumReaderPreviewContent).

const DB_NAME = "ndl-uploads";
const DB_VERSION = 1;
const STORE_NAME = "pdfs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

/** Stores one uploaded PDF's base64 data URL, keyed by upload id. */
export async function saveUploadedPdf(id: string, dataUrl: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ id, dataUrl, savedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Failed to save uploaded PDF"));
    });
  } finally {
    db.close();
  }
}

/** Returns the stored data URL for an upload id, or null if not found. */
export async function getUploadedPdf(id: string): Promise<string | null> {
  const db = await openDb();
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result?.dataUrl ?? null);
      req.onerror = () => reject(req.error ?? new Error("Failed to read uploaded PDF"));
    });
  } finally {
    db.close();
  }
}
