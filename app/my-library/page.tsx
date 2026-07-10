"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { usePublicCatalog } from "@/lib/catalog";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import InfoCard from "@/components/ui/InfoCard";
import SearchBar from "@/components/ui/SearchBar";
import FilterBar from "@/components/ui/FilterBar";
import AppButton from "@/components/ui/AppButton";

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
  pdf?: string;
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
function findBookById(books: DirectorBook[], id: string): DirectorBook | undefined {
  return books.find(b => b.id === id);
}
function findBookByTitle(books: DirectorBook[], title: string): DirectorBook | undefined {
  const q = title.trim().toLowerCase();
  return books.find(b => b.title?.trim().toLowerCase() === q);
}
function bookCover(book?: DirectorBook): string | undefined {
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

function normalizeLibrary(raw: RawLibraryEntry[], books: DirectorBook[]): ResolvedLibraryEntry[] {
  const out: ResolvedLibraryEntry[] = [];
  for (const entry of raw) {
    let book: DirectorBook | undefined;
    if (typeof entry === "string") {
      book = findBookById(books, entry) ?? findBookByTitle(books, entry);
    } else if (entry && typeof entry === "object") {
      if (entry.bookId) book = findBookById(books, entry.bookId);
      if (!book && entry.title) book = findBookByTitle(books, entry.title);
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
        const targetWidth = 400;
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

  const [mounted, setMounted] = useState(false);
  const [rawLibrary, setRawLibrary] = useState<RawLibraryEntry[]>([]);
  const [highlights, setHighlights] = useState<StoredHighlightLite[]>([]);
  const [notes, setNotes] = useState<StoredNoteLite[]>([]);
  const [bookmarks, setBookmarks] = useState<StoredBookmarkLite[]>([]);
  const [progress, setProgress] = useState<ReadingProgressEntry[]>([]);
  const [activity, setActivity] = useState<LearningActivityEntry[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const catalogBooks = usePublicCatalog();

  useEffect(() => {
    setRawLibrary(readArray<RawLibraryEntry>("ndl_my_library"));
    setHighlights(readArray<StoredHighlightLite>("ndl_highlights"));
    setNotes(readArray<StoredNoteLite>("ndl_notes"));
    setBookmarks(readArray<StoredBookmarkLite>("ndl_bookmarks"));
    setProgress(readArray<ReadingProgressEntry>("ndl_reading_progress"));
    setActivity(readArray<LearningActivityEntry>("ndl_learning_activity"));
    setMounted(true);
  }, []);

  const resolvedLibrary = useMemo(() => normalizeLibrary(rawLibrary, catalogBooks), [rawLibrary, catalogBooks]);
  const usingDemoShelf = resolvedLibrary.length === 0;
  const shelfBooks: DirectorBook[] = usingDemoShelf
    ? catalogBooks
    : resolvedLibrary.map(r => r.book);

  function removeBook(bookId: string) {
    if (usingDemoShelf) return;
    function resolveId(entry: RawLibraryEntry): string | undefined {
      if (typeof entry === "string") return (findBookById(catalogBooks, entry) ?? findBookByTitle(catalogBooks, entry))?.id;
      if (entry.bookId) { const b = findBookById(catalogBooks, entry.bookId); if (b) return b.id; }
      if (entry.title) { const b = findBookByTitle(catalogBooks, entry.title); if (b) return b.id; }
      return undefined;
    }
    const next = rawLibrary.filter(entry => resolveId(entry) !== bookId);
    setRawLibrary(next);
    writeArray("ndl_my_library", next);
  }

  function progressFor(bookId: string) {
    const p = progress.find(x => x.bookId === bookId);
    if (!p) return null;
    const total = p.totalPages || bookTotalPages(findBookById(catalogBooks, bookId));
    return { currentPage: p.currentPage, totalPages: total, pct: Math.min(100, Math.round((p.currentPage / Math.max(1, total)) * 100)), lastReadAt: p.lastReadAt };
  }
  function hasNotes(bookId: string) { return notes.some(n => n.bookId === bookId); }
  function hasHighlights(bookId: string) { return highlights.some(h => h.bookId === bookId); }
  function hasBookmark(bookId: string) { return bookmarks.some(b => b.bookId === bookId); }

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

  const continueReadingList = useMemo(() => {
    const real = progress
      .map(p => ({ book: findBookById(catalogBooks, p.bookId), progress: p }))
      .filter((x): x is { book: DirectorBook; progress: ReadingProgressEntry } => !!x.book)
      .sort((a, b) => b.progress.lastReadAt - a.progress.lastReadAt)
      .slice(0, 3);
    if (real.length > 0) return real;
    return catalogBooks.slice(0, 2).map((b, i) => {
      const total = bookTotalPages(b);
      const pct = [58, 30][i] ?? 40;
      return {
        book: b,
        progress: { bookId: b.id, currentPage: Math.round((pct / 100) * total), totalPages: total, lastReadAt: Date.now() - i * 1000 * 60 * 60 * 12 },
      };
    });
  }, [progress, catalogBooks]);
  const usingDemoContinueReading = progress.length === 0;

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

  const filterOptions = [
    { key: "all" as FilterKey, label: t.myLibraryFilterAll },
    { key: "continue" as FilterKey, label: t.myLibraryFilterContinue },
    { key: "completed" as FilterKey, label: t.myLibraryFilterCompleted },
    { key: "bookmarked" as FilterKey, label: `🔖 ${t.myLibraryFilterBookmarked}` },
    { key: "notes" as FilterKey, label: `📝 ${t.myLibraryFilterHasNotes}` },
    { key: "highlights" as FilterKey, label: `⭐ ${t.myLibraryFilterHasHighlights}` },
  ];

  if (!mounted) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] p-6">
        <div className="mx-auto max-w-6xl animate-pulse text-sm font-semibold text-slate-400">
          {t.commonLoading}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] p-6">
      <div className="mx-auto max-w-6xl">

        <PageHeader title={t.myLibraryTitle} subtitle={t.myLibrarySubtitle} homeLabel={t.commonHome} />

        {usingDemoShelf && (
          <InfoCard tone="amber" className="mb-6 py-3 text-sm font-semibold">
            📌 {t.myLibraryEmptyBanner}
          </InfoCard>
        )}

        {/* 1. Library overview cards — equal-height grid, StatCard keeps
            every card the same shape regardless of label length. */}
        <div className="grid gap-6 md:grid-cols-5 mb-8">
          <StatCard icon="📚" label={t.myLibraryBooksSaved} value={stats.booksSaved} />
          <StatCard icon="📖" label={t.continueReading} value={stats.continueReading} />
          <StatCard icon="⭐" label={t.myLibraryHighlights} value={stats.highlights} />
          <StatCard icon="📝" label={t.navNotes} value={stats.notes} />
          <StatCard icon="🔖" label={t.myLibraryBookmarks} value={stats.bookmarks} />
        </div>

        {/* 2. Continue Reading */}
        <InfoCard className="mb-10">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl font-black text-slate-950">{t.continueReading}</h2>
            {usingDemoContinueReading && <span className="rounded-full bg-amber-100 px-3 py-1 text-[10px] font-bold uppercase text-amber-700">{t.commonDemo}</span>}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {continueReadingList.map(({ book, progress: p }) => {
              const total = p.totalPages || bookTotalPages(book);
              const pct = Math.min(100, Math.round((p.currentPage / Math.max(1, total)) * 100));
              return (
                <div key={book.id} className="flex h-full gap-4 rounded-2xl border border-slate-100 p-4 hover:shadow-md">
                  <div className="h-28 w-20 flex-shrink-0 overflow-hidden rounded-xl shadow">
                    <CoverThumb book={book} className="h-full w-full" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="truncate font-bold text-slate-900">{book.title}</p>
                    {book.author && <p className="truncate text-xs text-slate-500">{book.author}</p>}
                    <p className="mt-1 text-xs text-slate-400">{t.commonPage} {p.currentPage} / {total}</p>
                    <div className="mt-2 h-2 rounded-full bg-slate-100">
                      <div className="h-2 rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-auto flex gap-2 pt-3">
                      <AppButton href={`/read?book=${book.id}`} variant="secondary" size="sm">
                        📖 {t.myLibraryNormal}
                      </AppButton>
                      <AppButton href={`/reader-premium?book=${book.id}`} variant="primary" size="sm">
                        🤖 {t.myLibraryContinueWithAi}
                      </AppButton>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </InfoCard>

        {/* Search */}
        <SearchBar value={search} onChange={setSearch} placeholder={t.myLibrarySearchPlaceholder} className="mb-4" />

        {/* 4. Filters */}
        <FilterBar options={filterOptions} active={filter} onChange={setFilter} className="mb-6" />

        {/* 3. My Bookshelf — equal-height cards, actions pinned to the
            bottom via mt-auto so every card's buttons line up regardless
            of title/author length. */}
        <InfoCard>
          <h2 className="mb-6 text-2xl font-black text-slate-950">📚 {t.myLibraryBookshelf}</h2>

          {visibleBooks.length === 0 ? (
            <p className="text-slate-600">{t.searchNoResults}</p>
          ) : (
            <div className="grid gap-5 md:grid-cols-3 lg:grid-cols-4">
              {visibleBooks.map((book) => {
                const p = progressFor(book.id);
                const pct = p?.pct ?? 0;
                return (
                  <div key={book.id} className="flex h-full flex-col rounded-2xl border p-4 hover:shadow-lg">
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
                      {hasNotes(book.id) && <span className="rounded-full bg-blue-100 px-2 py-0.5 font-bold text-blue-700">📝</span>}
                      {hasBookmark(book.id) && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-600">🔖</span>}
                    </div>

                    {p && (
                      <div className="mt-2 h-2 rounded-full bg-slate-100">
                        <div className="h-2 rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                      </div>
                    )}

                    <div className="mt-auto flex flex-col gap-2 pt-4">
                      <div className="flex gap-2">
                        <AppButton href={`/read?book=${book.id}`} variant="secondary" size="sm" fullWidth>
                          📖 {t.myLibraryNormal}
                        </AppButton>
                        <AppButton href={`/reader-premium?book=${book.id}`} variant="primary" size="sm" fullWidth>
                          🤖 {t.myLibraryAiTutor}
                        </AppButton>
                      </div>
                      {!usingDemoShelf && (
                        <button
                          onClick={() => removeBook(book.id)}
                          className="rounded-xl bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100"
                        >
                          {t.commonRemove}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </InfoCard>
      </div>
    </main>
  );
}
