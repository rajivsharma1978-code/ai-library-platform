"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { usePublicCatalog } from "@/lib/catalog";
import PageHeader from "@/components/ui/PageHeader";
import LearningNav from "@/components/learning/LearningNav";
import StatCard from "@/components/ui/StatCard";
import InfoCard from "@/components/ui/InfoCard";
import SearchBar from "@/components/ui/SearchBar";
import FilterBar from "@/components/ui/FilterBar";
import AppButton from "@/components/ui/AppButton";
import QuickLinks from "@/components/ui/QuickLinks";
import AccessibilityToolbar from "@/components/ui/AccessibilityToolbar";
import CoverThumb from "@/components/ui/BookCover";
import { listUploadedBooks, type UploadedBookMeta } from "@/lib/uploadedPdfStore";

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
function findBookById(books: DirectorBook[], id: string): DirectorBook | undefined {
  return books.find(b => b.id === id);
}
function findBookByTitle(books: DirectorBook[], title: string): DirectorBook | undefined {
  const q = title.trim().toLowerCase();
  return books.find(b => b.title?.trim().toLowerCase() === q);
}
function bookTotalPages(book?: DirectorBook): number {
  const n = Number(book?.pages);
  return Number.isFinite(n) && n > 0 ? n : 220;
}
// ── ndl_my_library can contain plain title strings (older format) or
// {bookId, addedAt} objects (newer format) — same defensive handling as
// app/my-library/page.tsx, kept independent here on purpose. ───────────
type RawLibraryEntry = string | { bookId?: string; title?: string; addedAt?: number };
function resolveLibraryBook(entry: RawLibraryEntry, books: DirectorBook[]): DirectorBook | undefined {
  if (typeof entry === "string") return findBookById(books, entry) ?? findBookByTitle(books, entry);
  if (entry.bookId) { const b = findBookById(books, entry.bookId); if (b) return b; }
  if (entry.title) { const b = findBookByTitle(books, entry.title); if (b) return b; }
  return undefined;
}

// CoverThumb is now the shared components/ui/BookCover.tsx (imported
// above) — see that file for the three-tier fallback + PDF-render
// timeout that used to be duplicated here.

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
  const catalogBooks = usePublicCatalog();

  const [uploadedBooks, setUploadedBooks] = useState<UploadedBookMeta[]>([]);

  useEffect(() => {
    setRawLibrary(readArray<RawLibraryEntry>("ndl_my_library"));
    setProgress(readArray<ReadingProgressEntry>("ndl_reading_progress"));
    setHighlights(readArray<StoredHighlightLite>("ndl_highlights"));
    setNotes(readArray<StoredNoteLite>("ndl_notes"));
    setBookmarks(readArray<StoredBookmarkLite>("ndl_bookmarks"));
    setUploadedBooks(listUploadedBooks());
    setMounted(true);
  }, []);

  const resolvedShelf = useMemo(
    () => rawLibrary.map(e => resolveLibraryBook(e, catalogBooks)).filter((b): b is DirectorBook => !!b),
    [rawLibrary, catalogBooks]
  );
  const usingDemoShelf = resolvedShelf.length === 0;
  const allBooks: DirectorBook[] = usingDemoShelf ? catalogBooks : resolvedShelf;

  function progressFor(bookId: string) {
    const p = progress.find(x => x.bookId === bookId);
    if (!p) return null;
    const total = p.totalPages || bookTotalPages(findBookById(catalogBooks, bookId));
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

        <PageHeader title={t.myBooksTitle} subtitle={t.myBooksSubtitle} homeLabel={t.commonHome} />

        <LearningNav />

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
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:border-transparent focus:ring-2 focus:ring-amber-400"
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
              <div className="grid gap-5 md:grid-cols-3 lg:grid-cols-4">
                {uploadedBooks.map(u => (
                  <div key={u.id} className="flex h-full min-w-0 flex-col rounded-2xl border p-4 hover:shadow-lg">
                    <div className="flex h-52 w-full items-center justify-center rounded-xl bg-gradient-to-br from-amber-200 via-orange-300 to-slate-700 text-white shadow">
                      <span style={{ fontSize: "2.6em" }}>📄</span>
                    </div>
                    <h3 className="mt-3 truncate font-bold text-slate-900">{u.name}</h3>
                    <p className="mt-0.5 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {u.pages} {t.readerPages}
                    </p>
                    <div className="mt-auto flex gap-2 pt-4">
                      <AppButton href={`/read?source=upload&id=${u.id}`} variant="secondary" size="sm" fullWidth>
                        📖 {t.myLibraryNormal}
                      </AppButton>
                      <AppButton href={`/reader-premium?source=upload&id=${u.id}`} variant="primary" size="sm" fullWidth>
                        🤖 {t.myLibraryAiTutor}
                      </AppButton>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : visibleBooks.length === 0 ? (
            <p className="text-slate-600">{t.searchNoResults}</p>
          ) : (
            <div className="grid gap-5 md:grid-cols-3 lg:grid-cols-4">
              {visibleBooks.map(book => {
                const p = progressFor(book.id);
                const counts = countsFor(book.id);
                return (
                  <div key={book.id} className="flex h-full min-w-0 flex-col rounded-2xl border p-4 hover:shadow-lg">
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
                          <div className="h-2 rounded-full bg-amber-500" style={{ width: `${p.pct}%` }} />
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
      <AccessibilityToolbar />
    </main>
  );
}
