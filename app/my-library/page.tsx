"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { directorBooks } from "@/lib/directorBooks";

// ── Local, read-only types mirroring Reader/Study Workspace/My Space data
// shapes. Not imported from those modules — this page only reads the same
// localStorage keys. ndl_my_library is the one key this page also writes
// to (removing a book from the shelf), preserved in whichever shape it
// was already stored in (see normalizeLibrary below — the key has been
// written by more than one place in this app over time, as plain title
// strings in older code and as {bookId, addedAt} objects in newer code). */
interface StoredHighlightLite { id: string; bookId: string; page: number; selectedText: string; createdAt: number; [k: string]: any; }
interface StoredNoteLite { id: string; bookId: string; page: number; note: string; createdAt: number; [k: string]: any; }
interface StoredBookmarkLite { id: string; bookId: string; page: number; createdAt: number; [k: string]: any; }
interface ReadingProgressEntry { bookId: string; currentPage: number; totalPages: number; lastReadAt: number; [k: string]: any; }
interface LearningActivityEntry { type: string; bookId: string; timestamp: number; [k: string]: any; }
type DirectorBook = {
  id: string; title: string; author?: string; language?: string;
  description?: string; pages?: number | string;
  /** Confirmed field in lib/directorBooks.ts — used by CoverThumb as a
   *  fallback source (first PDF page rendered as the cover) when no
   *  static cover image resolves. */
  pdf?: string;
  /** The confirmed field in lib/directorBooks.ts today — a public-folder
   *  path like "/director-books/nalanda-cover.jpg". The three below are
   *  checked defensively in case that ever changes or a second book
   *  source with different naming gets merged in. */
  cover?: string;
  coverUrl?: string;
  image?: string;
  thumbnail?: string;
  [k: string]: any;
};

function readArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function writeArray<T>(key: string, value: T[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}
function findBookById(id: string): DirectorBook | undefined {
  return (directorBooks as DirectorBook[]).find(b => b.id === id);
}
function findBookByTitle(title: string): DirectorBook | undefined {
  const q = title.trim().toLowerCase();
  return (directorBooks as DirectorBook[]).find(b => b.title?.trim().toLowerCase() === q);
}
function bookCover(book?: DirectorBook): string | undefined {
  // "cover" is the confirmed field lib/directorBooks.ts uses today. The
  // others are checked defensively (any future field rename, or a second
  // book source with different naming, still resolves correctly) without
  // needing another code change. First non-empty value wins.
  const candidate = book?.cover || book?.coverUrl || book?.image || book?.thumbnail;
  return candidate && candidate.trim() ? candidate : undefined;
}
function bookTotalPages(book?: DirectorBook): number {
  const n = Number(book?.pages);
  return Number.isFinite(n) && n > 0 ? n : 220;
}

// ── ndl_my_library can contain either plain title strings (older format)
// or {bookId, addedAt} objects (newer format) — read both, resolve each
// to a real directorBooks entry, and remember which RAW shape each came
// from so removal writes back without corrupting whatever else in the
// app still expects that key's original shape. ─────────────────────────
type RawLibraryEntry = string | { bookId?: string; title?: string; addedAt?: number };
interface ResolvedLibraryEntry { book: DirectorBook; raw: RawLibraryEntry }

function normalizeLibrary(raw: RawLibraryEntry[]): ResolvedLibraryEntry[] {
  const out: ResolvedLibraryEntry[] = [];
  for (const entry of raw) {
    let book: DirectorBook | undefined;
    if (typeof entry === "string") {
      book = findBookById(entry) ?? findBookByTitle(entry);
    } else if (entry && typeof entry === "object") {
      if (entry.bookId) book = findBookById(entry.bookId);
      if (!book && entry.title) book = findBookByTitle(entry.title);
    }
    if (book) out.push({ book, raw: entry });
  }
  return out;
}

// ── Renders the FIRST PAGE of a book's own PDF as its cover image.
// Used only when no real cover/coverUrl/image/thumbnail field resolves —
// this turns the PDF itself (an existing public asset, per
// lib/directorBooks.ts's own "pdf" field) into a real, book-specific
// cover instead of a fabricated placeholder. Entirely self-contained:
// does not import from or modify PdfBookSpread/the Reader in any way,
// it just uses the same public pdfjs-dist worker file the Reader already
// relies on (/pdf.worker.min.mjs). ──────────────────────────────────────
function PdfFirstPageCover({ pdfPath, onFail }: { pdfPath: string; onFail: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const pdf = await pdfjsLib.getDocument(pdfPath).promise;
        const page = await pdf.getPage(1);
        const baseViewport = page.getViewport({ scale: 1 });
        const targetWidth = 400; // plenty for a shelf/grid thumbnail
        const scale = targetWidth / baseViewport.width;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        await page.render({ canvasContext: ctx, viewport, canvas }).promise;
        if (!cancelled) setRendered(true);
      } catch {
        if (!cancelled) onFail();
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfPath]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: rendered ? "block" : "none" }}
    />
  );
}

function CoverThumb({ book, className = "" }: { book?: DirectorBook; className?: string }) {
  const staticCover = bookCover(book);
  const [staticFailed, setStaticFailed] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  const initials = (book?.title ?? "?").split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

  // Reset per-book so switching between books (e.g. filtered grid re-render)
  // doesn't get stuck on a previous book's failure state.
  useEffect(() => { setStaticFailed(false); setPdfFailed(false); }, [book?.id]);

  const canUseStatic = !!staticCover && !staticFailed;
  const canUsePdf = !canUseStatic && !!book?.pdf && !pdfFailed;

  if (canUseStatic) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={staticCover}
        alt={book?.title ? `Cover of ${book.title}` : "Book cover"}
        className={`object-cover ${className}`}
        onError={() => setStaticFailed(true)}
      />
    );
  }

  if (canUsePdf) {
    return (
      <div role="img" aria-label={book?.title ? `Cover of ${book.title}` : "Book cover"} className={`overflow-hidden bg-slate-100 ${className}`}>
        <PdfFirstPageCover pdfPath={book!.pdf as string} onFail={() => setPdfFailed(true)} />
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={book?.title ? `Cover of ${book.title}` : "Book cover placeholder"}
      className={`flex items-center justify-center bg-[linear-gradient(135deg,#f4d58d_0%,#c18a3f_60%,#8a5a24_100%)] text-white font-black ${className}`}
    >
      <span style={{ fontSize: "1.3em" }}>{initials || "📖"}</span>
    </div>
  );
}

type FilterKey = "all" | "continue" | "completed" | "bookmarked" | "notes" | "highlights";

export default function MyLibraryPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const isEn = t.navLibrary === "Library";

  const [mounted, setMounted] = useState(false);
  const [rawLibrary, setRawLibrary] = useState<RawLibraryEntry[]>([]);
  const [highlights, setHighlights] = useState<StoredHighlightLite[]>([]);
  const [notes, setNotes] = useState<StoredNoteLite[]>([]);
  const [bookmarks, setBookmarks] = useState<StoredBookmarkLite[]>([]);
  const [progress, setProgress] = useState<ReadingProgressEntry[]>([]);
  const [activity, setActivity] = useState<LearningActivityEntry[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");

  useEffect(() => {
    setRawLibrary(readArray<RawLibraryEntry>("ndl_my_library"));
    setHighlights(readArray<StoredHighlightLite>("ndl_highlights"));
    setNotes(readArray<StoredNoteLite>("ndl_notes"));
    setBookmarks(readArray<StoredBookmarkLite>("ndl_bookmarks"));
    setProgress(readArray<ReadingProgressEntry>("ndl_reading_progress"));
    setActivity(readArray<LearningActivityEntry>("ndl_learning_activity"));
    setMounted(true);
  }, []);

  const resolvedLibrary = useMemo(() => normalizeLibrary(rawLibrary), [rawLibrary]);
  const usingDemoShelf = resolvedLibrary.length === 0;
  const shelfBooks: DirectorBook[] = usingDemoShelf
    ? (directorBooks as DirectorBook[])
    : resolvedLibrary.map(r => r.book);

  function removeBook(bookId: string) {
    if (usingDemoShelf) return; // demo shelf isn't real saved data
    function resolveId(entry: RawLibraryEntry): string | undefined {
      if (typeof entry === "string") return (findBookById(entry) ?? findBookByTitle(entry))?.id;
      if (entry.bookId) { const b = findBookById(entry.bookId); if (b) return b.id; }
      if (entry.title) { const b = findBookByTitle(entry.title); if (b) return b.id; }
      return undefined;
    }
    const next = rawLibrary.filter(entry => resolveId(entry) !== bookId);
    setRawLibrary(next);
    writeArray("ndl_my_library", next);
  }

  function progressFor(bookId: string) {
    const p = progress.find(x => x.bookId === bookId);
    if (!p) return null;
    const total = p.totalPages || bookTotalPages(findBookById(bookId));
    return { currentPage: p.currentPage, totalPages: total, pct: Math.min(100, Math.round((p.currentPage / Math.max(1, total)) * 100)), lastReadAt: p.lastReadAt };
  }
  function hasNotes(bookId: string) { return notes.some(n => n.bookId === bookId); }
  function hasHighlights(bookId: string) { return highlights.some(h => h.bookId === bookId); }
  function hasBookmark(bookId: string) { return bookmarks.some(b => b.bookId === bookId); }

  // ── Overview cards ───────────────────────────────────────────────────
  const continueReadingCount = shelfBooks.filter(b => {
    const p = progressFor(b.id);
    return p && p.pct > 0 && p.pct < 100;
  }).length;

  const stats = {
    booksSaved: usingDemoShelf ? shelfBooks.length : resolvedLibrary.length,
    continueReading: continueReadingCount,
    highlights: highlights.length,
    notes: notes.length,
    bookmarks: bookmarks.length,
  };

  // ── Continue Reading section ─────────────────────────────────────────
  const continueReadingList = useMemo(() => {
    const real = progress
      .map(p => ({ book: findBookById(p.bookId), progress: p }))
      .filter((x): x is { book: DirectorBook; progress: ReadingProgressEntry } => !!x.book)
      .sort((a, b) => b.progress.lastReadAt - a.progress.lastReadAt)
      .slice(0, 3);
    if (real.length > 0) return real;
    // Demo fallback — first couple of catalog books with plausible progress.
    return (directorBooks as DirectorBook[]).slice(0, 2).map((b, i) => {
      const total = bookTotalPages(b);
      const pct = [58, 30][i] ?? 40;
      return {
        book: b,
        progress: { bookId: b.id, currentPage: Math.round((pct / 100) * total), totalPages: total, lastReadAt: Date.now() - i * 1000 * 60 * 60 * 12 },
      };
    });
  }, [progress]);
  const usingDemoContinueReading = progress.length === 0;

  // ── Filters + search ──────────────────────────────────────────────────
  const visibleBooks = useMemo(() => {
    let list = shelfBooks;
    if (filter === "continue") list = list.filter(b => { const p = progressFor(b.id); return p && p.pct > 0 && p.pct < 100; });
    else if (filter === "completed") list = list.filter(b => { const p = progressFor(b.id); return p && p.pct >= 100; });
    else if (filter === "bookmarked") list = list.filter(b => hasBookmark(b.id));
    else if (filter === "notes") list = list.filter(b => hasNotes(b.id));
    else if (filter === "highlights") list = list.filter(b => hasHighlights(b.id));

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(b =>
        b.title?.toLowerCase().includes(q) ||
        b.author?.toLowerCase().includes(q) ||
        b.language?.toLowerCase().includes(q)
      );
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelfBooks, filter, search, progress, notes, highlights, bookmarks]);

  if (!mounted) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-6xl animate-pulse text-sm font-semibold text-slate-400">
          {isEn ? "Loading your library…" : "आपकी लाइब्रेरी लोड हो रही है…"}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900">{isEn ? "My Library" : "मेरी लाइब्रेरी"}</h1>
            <p className="mt-2 text-slate-600">
              {isEn ? "Your personal bookshelf, connected to everything you've read and studied." : "आपकी व्यक्तिगत पुस्तक अलमारी, आपके सभी पठन और अध्ययन से जुड़ी हुई।"}
            </p>
          </div>
          <Link href="/" className="rounded-xl bg-black px-4 py-2 text-white">{isEn ? "← Home" : "← होम"}</Link>
        </div>

        {usingDemoShelf && (
          <div className="mb-6 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
            {isEn
              ? "📌 Your shelf is empty — showing demo recommendations from the library catalog. Add books to see your real shelf here."
              : "📌 आपकी अलमारी खाली है — लाइब्रेरी कैटलॉग से डेमो सिफारिशें दिखाई जा रही हैं। अपनी असली अलमारी देखने के लिए किताबें जोड़ें।"}
          </div>
        )}

        {/* 1. Library overview cards */}
        <div className="grid gap-6 md:grid-cols-5 mb-8">
          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-slate-500">📚 {isEn ? "Books Saved" : "सहेजी गई किताबें"}</p>
            <h2 className="mt-2 text-4xl font-bold">{stats.booksSaved}</h2>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-slate-500">📖 {isEn ? "Continue Reading" : "पढ़ना जारी रखें"}</p>
            <h2 className="mt-2 text-4xl font-bold">{stats.continueReading}</h2>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-slate-500">⭐ {isEn ? "Highlights" : "हाइलाइट्स"}</p>
            <h2 className="mt-2 text-4xl font-bold">{stats.highlights}</h2>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-slate-500">📝 {isEn ? "Notes" : "नोट्स"}</p>
            <h2 className="mt-2 text-4xl font-bold">{stats.notes}</h2>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow">
            <p className="text-slate-500">🔖 {isEn ? "Bookmarks" : "बुकमार्क"}</p>
            <h2 className="mt-2 text-4xl font-bold">{stats.bookmarks}</h2>
          </div>
        </div>

        {/* 2. Continue Reading */}
        <div className="mb-10 rounded-3xl bg-white p-6 shadow">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-bold">{isEn ? "Continue Reading" : "पढ़ना जारी रखें"}</h2>
            {usingDemoContinueReading && <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase text-amber-700">demo</span>}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {continueReadingList.map(({ book, progress: p }) => {
              const total = p.totalPages || bookTotalPages(book);
              const pct = Math.min(100, Math.round((p.currentPage / Math.max(1, total)) * 100));
              return (
                <div key={book.id} className="flex gap-4 rounded-2xl border border-slate-100 p-4 hover:shadow-md">
                  <div className="h-28 w-20 flex-shrink-0 overflow-hidden rounded-xl shadow">
                    <CoverThumb book={book} className="h-full w-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-900">{book.title}</p>
                    {book.author && <p className="truncate text-xs text-slate-500">{book.author}</p>}
                    <p className="mt-1 text-xs text-slate-400">{isEn ? "Page" : "पृष्ठ"} {p.currentPage} / {total}</p>
                    <div className="mt-2 h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                    </div>
                    <Link href={`/reader-premium?book=${book.id}`} className="mt-3 inline-block rounded-full bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-700">
                      {isEn ? "Continue Reading" : "पढ़ना जारी रखें"}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isEn ? "Search by title, author, or language…" : "शीर्षक, लेखक या भाषा से खोजें…"}
          className="mb-4 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm outline-none focus:border-slate-400"
        />

        {/* 4. Filters */}
        <div className="mb-6 flex flex-wrap gap-2">
          {([
            ["all", isEn ? "All" : "सभी"],
            ["continue", isEn ? "Continue Reading" : "पढ़ना जारी रखें"],
            ["completed", isEn ? "Completed" : "पूर्ण"],
            ["bookmarked", isEn ? "🔖 Bookmarked" : "🔖 बुकमार्क"],
            ["notes", isEn ? "📝 Has Notes" : "📝 नोट्स वाली"],
            ["highlights", isEn ? "⭐ Has Highlights" : "⭐ हाइलाइट वाली"],
          ] as [FilterKey, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                filter === key ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 3. My Bookshelf */}
        <div className="rounded-3xl bg-white p-6 shadow">
          <h2 className="mb-6 text-2xl font-bold">📚 {isEn ? "My Bookshelf" : "मेरी पुस्तक अलमारी"}</h2>

          {visibleBooks.length === 0 ? (
            <p className="text-slate-600">{t.searchNoResults}</p>
          ) : (
            <div className="grid gap-5 md:grid-cols-3 lg:grid-cols-4">
              {visibleBooks.map((book) => {
                const p = progressFor(book.id);
                const pct = p?.pct ?? 0;
                return (
                  <div key={book.id} className="rounded-2xl border p-4 hover:shadow-lg">
                    <div className="h-52 w-full overflow-hidden rounded-xl shadow">
                      <CoverThumb book={book} className="h-full w-full" />
                    </div>
                    <h3 className="mt-3 truncate font-bold text-slate-900">{book.title}</h3>
                    {book.author && <p className="truncate text-xs text-slate-500">{book.author}</p>}
                    <p className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {book.language ?? ""}
                    </p>

                    <div className="mt-2 flex items-center gap-1.5 text-xs">
                      {hasHighlights(book.id) && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700">⭐</span>}
                      {hasNotes(book.id) && <span className="rounded-full bg-purple-100 px-2 py-0.5 font-bold text-purple-700">📝</span>}
                      {hasBookmark(book.id) && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">🔖</span>}
                    </div>

                    {p && (
                      <div className="mt-2 h-2 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-blue-600" style={{ width: `${pct}%` }} />
                      </div>
                    )}

                    <div className="mt-4 flex gap-2">
                      <Link href={`/reader-premium?book=${book.id}`} className="flex-1 rounded-xl bg-black px-3 py-2 text-center text-sm font-semibold text-white hover:bg-slate-800">
                        {isEn ? "Read" : "पढ़ें"}
                      </Link>
                      {!usingDemoShelf && (
                        <button
                          onClick={() => removeBook(book.id)}
                          className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-100"
                        >
                          {isEn ? "Remove" : "हटाएं"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
