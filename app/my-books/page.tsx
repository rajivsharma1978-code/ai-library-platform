"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { directorBooks } from "@/lib/directorBooks";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import InfoCard from "@/components/ui/InfoCard";
import SearchBar from "@/components/ui/SearchBar";
import FilterBar from "@/components/ui/FilterBar";
import AppButton from "@/components/ui/AppButton";
import QuickLinks from "@/components/ui/QuickLinks";

// ── Local, read-only types mirroring Reader/Study Workspace/My Space/My
// Library data shapes. This page is self-contained on purpose — it does
// not import from app/my-library or any Reader/Study Workspace module,
// it only reads the same localStorage keys. ndl_my_library is the only
// key this page ever writes back to (nothing here adds/removes books
// directly, so in practice it's read-only too). ────────────────────────
interface StoredHighlightLite { id: string; bookId: string; page: number; selectedText: string; createdAt: number; [k: string]: any; }
interface StoredNoteLite { id: string; bookId: string; page: number; note: string; createdAt: number; [k: string]: any; }
interface StoredBookmarkLite { id: string; bookId: string; page: number; createdAt: number; [k: string]: any; }
interface ReadingProgressEntry { bookId: string; currentPage: number; totalPages: number; lastReadAt: number; [k: string]: any; }
type DirectorBook = {
  id: string; title: string; author?: string; language?: string;
  description?: string; pages?: number | string; pdf?: string;
  cover?: string; coverUrl?: string; image?: string; thumbnail?: string;
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
function findBookById(id: string): DirectorBook | undefined {
  return (directorBooks as DirectorBook[]).find(b => b.id === id);
}
function findBookByTitle(title: string): DirectorBook | undefined {
  const q = title.trim().toLowerCase();
  return (directorBooks as DirectorBook[]).find(b => b.title?.trim().toLowerCase() === q);
}
function bookTotalPages(book?: DirectorBook): number {
  const n = Number(book?.pages);
  return Number.isFinite(n) && n > 0 ? n : 220;
}
function bookCover(book?: DirectorBook): string | undefined {
  const c = book?.cover || book?.coverUrl || book?.image || book?.thumbnail;
  return c && c.trim() ? c : undefined;
}

// ── ndl_my_library can contain plain title strings (older format) or
// {bookId, addedAt} objects (newer format) — same defensive handling as
// app/my-library/page.tsx, kept independent here on purpose. ───────────
type RawLibraryEntry = string | { bookId?: string; title?: string; addedAt?: number };
function resolveLibraryBook(entry: RawLibraryEntry): DirectorBook | undefined {
  if (typeof entry === "string") return findBookById(entry) ?? findBookByTitle(entry);
  if (entry.bookId) { const b = findBookById(entry.bookId); if (b) return b; }
  if (entry.title) { const b = findBookByTitle(entry.title); if (b) return b; }
  return undefined;
}

// ── Cover: real image field → first PDF page rendered as cover → gradient
// + initials as the true last resort. Same technique as My Library. ─────
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
        const baseVp = page.getViewport({ scale: 1 });
        const scale = 400 / baseVp.width;
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
  return <canvas ref={canvasRef} style={{ width: "100%", height: "100%", objectFit: "cover", display: rendered ? "block" : "none" }} />;
}

function CoverThumb({ book, className = "" }: { book?: DirectorBook; className?: string }) {
  const staticCover = bookCover(book);
  const [staticFailed, setStaticFailed] = useState(false);
  const [pdfFailed, setPdfFailed] = useState(false);
  useEffect(() => { setStaticFailed(false); setPdfFailed(false); }, [book?.id]);
  const initials = (book?.title ?? "?").split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

  const canUseStatic = !!staticCover && !staticFailed;
  const canUsePdf = !canUseStatic && !!book?.pdf && !pdfFailed;

  if (canUseStatic) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={staticCover} alt={book?.title ? `Cover of ${book.title}` : "Book cover"} className={`object-cover ${className}`} onError={() => setStaticFailed(true)} />;
  }
  if (canUsePdf) {
    return (
      <div role="img" aria-label={book?.title ? `Cover of ${book.title}` : "Book cover"} className={`overflow-hidden bg-slate-100 ${className}`}>
        <PdfFirstPageCover pdfPath={book!.pdf as string} onFail={() => setPdfFailed(true)} />
      </div>
    );
  }
  return (
    <div role="img" aria-label={book?.title ? `Cover of ${book.title}` : "Book cover placeholder"} className={`flex items-center justify-center bg-[linear-gradient(135deg,#f4d58d_0%,#c18a3f_60%,#8a5a24_100%)] text-white font-black ${className}`}>
      <span style={{ fontSize: "1.3em" }}>{initials || "📖"}</span>
    </div>
  );
}

type Collection = "all" | "continue" | "completed" | "favorites" | "uploaded";

export default function MyBooksPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];

  const [mounted, setMounted] = useState(false);
  const [rawLibrary, setRawLibrary] = useState<RawLibraryEntry[]>([]);
  const [progress, setProgress] = useState<ReadingProgressEntry[]>([]);
  const [highlights, setHighlights] = useState<StoredHighlightLite[]>([]);
  const [notes, setNotes] = useState<StoredNoteLite[]>([]);
  const [bookmarks, setBookmarks] = useState<StoredBookmarkLite[]>([]);
  const [search, setSearch] = useState("");
  const [languageFilter, setLanguageFilter] = useState("");
  const [collection, setCollection] = useState<Collection>("all");

  useEffect(() => {
    setRawLibrary(readArray<RawLibraryEntry>("ndl_my_library"));
    setProgress(readArray<ReadingProgressEntry>("ndl_reading_progress"));
    setHighlights(readArray<StoredHighlightLite>("ndl_highlights"));
    setNotes(readArray<StoredNoteLite>("ndl_notes"));
    setBookmarks(readArray<StoredBookmarkLite>("ndl_bookmarks"));
    setMounted(true);
  }, []);

  const resolvedShelf = useMemo(
    () => rawLibrary.map(e => resolveLibraryBook(e)).filter((b): b is DirectorBook => !!b),
    [rawLibrary]
  );
  const usingDemoShelf = resolvedShelf.length === 0;
  const allBooks: DirectorBook[] = usingDemoShelf ? (directorBooks as DirectorBook[]) : resolvedShelf;

  // "Uploaded Books" = entries in ndl_my_library that don't resolve to any
  // catalog book at all (i.e. not in lib/directorBooks.ts). There's no
  // separate upload-tracking key in this app yet, so this collection is
  // structurally correct but will usually be empty today.
  const uploadedBooks = useMemo(
    () => rawLibrary.filter(e => !resolveLibraryBook(e)),
    [rawLibrary]
  );

  function progressFor(bookId: string) {
    const p = progress.find(x => x.bookId === bookId);
    if (!p) return null;
    const total = p.totalPages || bookTotalPages(findBookById(bookId));
    return { currentPage: p.currentPage, totalPages: total, pct: Math.min(100, Math.round((p.currentPage / Math.max(1, total)) * 100)) };
  }
  function countsFor(bookId: string) {
    return {
      highlights: highlights.filter(h => h.bookId === bookId).length,
      notes: notes.filter(n => n.bookId === bookId).length,
      bookmarks: bookmarks.filter(b => b.bookId === bookId).length,
    };
  }

  const stats = useMemo(() => {
    const inProgress = allBooks.filter(b => { const p = progressFor(b.id); return p && p.pct > 0 && p.pct < 100; }).length;
    const completed = allBooks.filter(b => { const p = progressFor(b.id); return p && p.pct >= 100; }).length;
    const withNotes = allBooks.filter(b => countsFor(b.id).notes > 0).length;
    const withBookmarks = allBooks.filter(b => countsFor(b.id).bookmarks > 0).length;
    return {
      saved: usingDemoShelf ? allBooks.length : resolvedShelf.length,
      inProgress, completed, withNotes, withBookmarks,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allBooks, progress, notes, bookmarks]);

  const uniqueLanguages = useMemo(
    () => Array.from(new Set(allBooks.map(b => b.language).filter(Boolean))) as string[],
    [allBooks]
  );

  const visibleBooks = useMemo(() => {
    let list = allBooks;
    if (collection === "continue") list = list.filter(b => { const p = progressFor(b.id); return p && p.pct > 0 && p.pct < 100; });
    else if (collection === "completed") list = list.filter(b => { const p = progressFor(b.id); return p && p.pct >= 100; });
    else if (collection === "favorites") list = list.filter(b => countsFor(b.id).bookmarks > 0);
    else if (collection === "uploaded") list = [];

    if (languageFilter) list = list.filter(b => b.language === languageFilter);

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
  }, [allBooks, collection, languageFilter, search, progress, bookmarks]);

  const collectionOptions = [
    { key: "all" as Collection, label: t.myBooksCollectionAll },
    { key: "continue" as Collection, label: t.myBooksCollectionContinue },
    { key: "completed" as Collection, label: t.myBooksCollectionCompleted },
    { key: "favorites" as Collection, label: `⭐ ${t.myBooksCollectionFavorites}` },
    { key: "uploaded" as Collection, label: t.myBooksCollectionUploaded },
  ];

  const quickLinks = [
    { href: "/reader-premium", icon: "📖", label: t.navReader },
    { href: "/library", icon: "🏛️", label: t.navLibrary },
    { href: "/my-library", icon: "📚", label: t.myLibraryTitle },
    { href: "/notes", icon: "📝", label: t.navNotes },
    { href: "/revision", icon: "🧠", label: t.navRevision },
  ];

  if (!mounted) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-6xl animate-pulse text-sm font-semibold text-slate-400">
          {t.commonLoading}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">

        <PageHeader title={t.myBooksTitle} subtitle={t.myBooksSubtitle} homeLabel={t.commonHome} />

        {usingDemoShelf && (
          <InfoCard tone="amber" className="mb-6 py-3 text-sm font-semibold">
            📌 {t.myBooksEmptyBanner}
          </InfoCard>
        )}

        {/* 2. Overview cards — equal-height, consistent StatCard grid */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard icon="📚" label={t.myBooksSaved} value={stats.saved} />
          <StatCard icon="📖" label={t.myBooksInProgress} value={stats.inProgress} />
          <StatCard icon="✅" label={t.myBooksCompleted} value={stats.completed} />
          <StatCard icon="📝" label={t.myBooksWithNotes} value={stats.withNotes} />
          <StatCard icon="🔖" label={t.myBooksWithBookmarks} value={stats.withBookmarks} />
        </div>

        {/* 3. Collections */}
        <FilterBar options={collectionOptions} active={collection} onChange={setCollection} className="mb-6" />

        {/* 5. Search + filters */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row">
          <SearchBar value={search} onChange={setSearch} placeholder={t.myLibrarySearchPlaceholder} className="flex-1" />
          {uniqueLanguages.length > 0 && (
            <select
              value={languageFilter}
              onChange={(e) => setLanguageFilter(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-700 shadow-sm outline-none"
            >
              <option value="">{t.commonAllLanguages}</option>
              {uniqueLanguages.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          )}
        </div>

        {/* 4. Book cards — equal-height, actions pinned to the bottom via
            mt-auto so buttons line up regardless of title/author length. */}
        <InfoCard>
          {collection === "uploaded" ? (
            uploadedBooks.length === 0 ? (
              <p className="text-slate-600">{t.myBooksNoUploads}</p>
            ) : (
              <p className="text-slate-600">{t.myBooksUploadedMatchFailed.replace("{count}", String(uploadedBooks.length))}</p>
            )
          ) : visibleBooks.length === 0 ? (
            <p className="text-slate-600">{t.searchNoResults}</p>
          ) : (
            <div className="grid gap-5 md:grid-cols-3 lg:grid-cols-4">
              {visibleBooks.map(book => {
                const p = progressFor(book.id);
                const counts = countsFor(book.id);
                return (
                  <div key={book.id} className="flex h-full flex-col rounded-2xl border p-4 hover:shadow-lg">
                    <div className="h-52 w-full overflow-hidden rounded-xl shadow">
                      <CoverThumb book={book} className="h-full w-full" />
                    </div>
                    <h3 className="mt-3 truncate font-bold text-slate-900">{book.title}</h3>
                    {book.author && <p className="truncate text-xs text-slate-500">{book.author}</p>}
                    <p className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">{book.language ?? ""}</p>

                    {p && (
                      <div className="mt-2">
                        <div className="mb-1 flex justify-between text-[11px] font-semibold text-slate-400">
                          <span>{t.progress}</span><span>{p.pct}%</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100">
                          <div className="h-2 rounded-full bg-blue-600" style={{ width: `${p.pct}%` }} />
                        </div>
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-3 text-xs font-semibold text-slate-500">
                      <span>⭐ {counts.highlights}</span>
                      <span>📝 {counts.notes}</span>
                      <span>🔖 {counts.bookmarks}</span>
                    </div>

                    <div className="mt-auto flex gap-2 pt-4">
                      <AppButton href={`/read?book=${book.id}`} variant="secondary" size="sm" fullWidth>
                        📖 {t.myLibraryNormal}
                      </AppButton>
                      <AppButton href={`/reader-premium?book=${book.id}`} variant="primary" size="sm" fullWidth>
                        🤖 {t.myLibraryAiTutor}
                      </AppButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </InfoCard>

        {/* Quick links */}
        <QuickLinks title={t.myBooksQuickLinks} links={quickLinks} className="mt-10" />
      </div>
    </main>
  );
}
