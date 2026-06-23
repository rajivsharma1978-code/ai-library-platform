/**
 * Minimal notes storage helper for "Save as Note" on selected text.
 *
 * This uses the SAME localStorage key/shape convention already used
 * elsewhere in the app for saved notes (an array of note objects under
 * a single key), so notes saved here show up alongside any other
 * notes already stored by the existing notes system. If your project
 * has a different existing notes store/key, update STORAGE_KEY below
 * to match it — the shape (id, bookTitle, pageLabel, text, createdAt)
 * is intentionally generic and additive, not a replacement for any
 * existing note shape.
 */

const STORAGE_KEY = "ndl_premium_reader_notes";

export interface SavedNote {
  id: string;
  bookTitle: string;
  pageLabel: string;
  text: string;
  createdAt: string;
}

export function saveNote(note: Omit<SavedNote, "id" | "createdAt">): SavedNote {
  const fullNote: SavedNote = {
    ...note,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };

  if (typeof window === "undefined") return fullNote;

  try {
    const existingRaw = window.localStorage.getItem(STORAGE_KEY);
    const existing: SavedNote[] = existingRaw ? JSON.parse(existingRaw) : [];
    existing.push(fullNote);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
  } catch (err) {
    console.error("[notesStore] Failed to save note:", err);
  }

  return fullNote;
}

export function getAllNotes(): SavedNote[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("[notesStore] Failed to read notes:", err);
    return [];
  }
}