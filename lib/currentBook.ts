// ── Shared "current book" pointer (Phase G-2B) ───────────────────────────
// A single, small record of the last book/page the user was reading, used
// only to power "Return to Book" links from Notes/Revision/Flashcards/
// Quiz/Analytics. Deliberately separate from every existing reading-state
// key in the app:
//   - Normal Reader's own keys (aiReaderPage, readingHistory,
//     ndl_continue_reading, aiBookmarks, ndl_ai_notes, ...) are untouched.
//   - ndl_reading_progress (read by My Library/My Books/Analytics/
//     Recommendations) is an ARRAY of per-book progress entries with no
//     writer anywhere in the app today — repurposing it here would both
//     change its shape (array -> single pointer) and start feeding real
//     data into four read-only consumers that currently only ever show
//     polished demo fallbacks. That's a behavior change outside this
//     batch's scope, so a dedicated key is used instead, exactly as
//     recommended when no existing key already serves this purpose.
//
// Route is always restricted to a small allow-list (never taken verbatim
// from storage), so a corrupted or tampered record can never produce a
// link outside the two known Reader routes.

export type ReaderRoute = "/reader" | "/reader-premium" | "/read";
export type CurrentBookSource = "catalog" | "upload" | "demo";

export interface CurrentBookRecord {
  v: 1;
  route: ReaderRoute;
  bookId: string;
  title: string;
  page: number;
  source?: CurrentBookSource;
  updatedAt: number;
}

const STORAGE_KEY = "ndl_current_book";
const ALLOWED_ROUTES: readonly ReaderRoute[] = ["/reader", "/reader-premium", "/read"];
const ALLOWED_SOURCES: readonly CurrentBookSource[] = ["catalog", "upload", "demo"];

function isWindowAvailable(): boolean {
  return typeof window !== "undefined";
}

function isAllowedRoute(value: unknown): value is ReaderRoute {
  return typeof value === "string" && (ALLOWED_ROUTES as readonly string[]).includes(value);
}

function isAllowedSource(value: unknown): value is CurrentBookSource {
  return typeof value === "string" && (ALLOWED_SOURCES as readonly string[]).includes(value);
}

/** Normalizes to a positive integer page number, or null if invalid. */
function normalizePage(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const int = Math.floor(n);
  return int >= 1 ? int : null;
}

function normalizeText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/** Validates and normalizes a raw parsed object into a CurrentBookRecord,
 * or returns null for anything malformed — never throws. */
function toRecord(raw: unknown): CurrentBookRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.v !== 1) return null;
  if (!isAllowedRoute(obj.route)) return null;
  const bookId = typeof obj.bookId === "string" ? obj.bookId.trim() : "";
  if (!bookId) return null;
  const page = normalizePage(obj.page);
  if (page === null) return null;
  const title = normalizeText(obj.title, bookId);
  const updatedAt = typeof obj.updatedAt === "number" && Number.isFinite(obj.updatedAt) ? obj.updatedAt : 0;
  const source = isAllowedSource(obj.source) ? obj.source : undefined;
  return { v: 1, route: obj.route, bookId, title, page, source, updatedAt };
}

/** Saves/updates the current-book pointer. Silently does nothing if the
 * input is invalid or window/localStorage is unavailable — never throws. */
export function saveCurrentBook(input: {
  route: ReaderRoute;
  bookId: string;
  title?: string;
  page: number | string;
  source?: CurrentBookSource;
}): void {
  if (!isWindowAvailable()) return;
  const record = toRecord({
    v: 1,
    route: input.route,
    bookId: input.bookId,
    title: input.title,
    page: input.page,
    source: input.source,
    updatedAt: Date.now(),
  });
  if (!record) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  } catch {
    // ignore quota/serialization errors — this is best-effort state only
  }
}

/** Reads the current-book pointer. Returns null if absent, malformed, or
 * window is unavailable — never throws. */
export function getCurrentBook(): CurrentBookRecord | null {
  if (!isWindowAvailable()) return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return toRecord(parsed);
}

/** True only if a currently-stored record is present and valid. */
export function hasValidCurrentBook(): boolean {
  return getCurrentBook() !== null;
}

export function clearCurrentBook(): void {
  if (!isWindowAvailable()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Builds a same-origin, relative URL back into the exact reader route,
 * book, and page — route is always one of the two literal templates
 * below, never taken from storage, so this can never produce an
 * open-redirect or an unsupported destination. */
export function buildCurrentBookUrl(record: CurrentBookRecord): string {
  const page = normalizePage(record.page) ?? 1;

  if (record.route === "/reader") {
    const params = new URLSearchParams({ book: record.bookId, page: String(page) });
    if (record.source === "demo") params.set("demo", "true");
    return `/reader?${params.toString()}`;
  }

  if (record.route === "/read") {
    const params = new URLSearchParams({ book: record.bookId, page: String(page) });
    return `/read?${params.toString()}`;
  }

  const params = new URLSearchParams({ page: String(page) });
  if (record.source === "upload") {
    params.set("source", "upload");
  } else {
    params.set("book", record.bookId);
  }
  return `/reader-premium?${params.toString()}`;
}
