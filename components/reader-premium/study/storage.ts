import { StoredHighlight, StoredNote, StoredBookmark } from "./types";
import { STORAGE_KEYS } from "./constants";

function readArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArray<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage can throw (quota, private mode) — fail silently, this
    // is demo-grade persistence, not critical data.
  }
}

export function loadHighlights(): StoredHighlight[] { return readArray<StoredHighlight>(STORAGE_KEYS.highlights); }
export function saveHighlights(list: StoredHighlight[]) { writeArray(STORAGE_KEYS.highlights, list); }

export function loadNotes(): StoredNote[] { return readArray<StoredNote>(STORAGE_KEYS.notes); }
export function saveNotes(list: StoredNote[]) { writeArray(STORAGE_KEYS.notes, list); }

export function loadBookmarks(): StoredBookmark[] { return readArray<StoredBookmark>(STORAGE_KEYS.bookmarks); }
export function saveBookmarks(list: StoredBookmark[]) { writeArray(STORAGE_KEYS.bookmarks, list); }

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}