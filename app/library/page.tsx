"use client";

import { useEffect, useMemo, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { usePublicCatalog, type CatalogBook } from "@/lib/catalog";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import InfoCard from "@/components/ui/InfoCard";
import SearchBar from "@/components/ui/SearchBar";
import FilterBar from "@/components/ui/FilterBar";
import AppButton from "@/components/ui/AppButton";
import BookCover from "@/components/ui/BookCover";
import AccessibilityToolbar from "@/components/ui/AccessibilityToolbar";

// ══════════════════════════════════════════════════════════════════════
// /library — the PUBLIC catalog. Browsing only: every book here comes
// from the shared merged catalog (lib/catalog.ts's usePublicCatalog,
// directorBooks.ts + admin overrides, filtered to Published), so admin
// edits/publishing show up here exactly like everywhere else in the app.
//
// This page must NEVER read a personal-data localStorage key (reading
// history, notes, bookmarks, a saved-books list) — that's /my-library's
// job (app/my-library/page.tsx, entirely unchanged by this pass). The
// only localStorage this page touches is a WRITE, via "Save to My
// Library", into the same ndl_my_library key /my-library already reads
// — so saving here shows up there, instead of this page inventing a
// second, disconnected "saved books" concept.
// ══════════════════════════════════════════════════════════════════════

const CATEGORY_ORDER = [
  "History & Culture",
  "Science & Technology",
  "Computing",
  "Space & Astronomy",
  "Literature",
  "General Knowledge",
];

type RawLibraryEntry = string | { bookId?: string; title?: string; addedAt?: number };

function readMyLibrary(): RawLibraryEntry[] {
  try {
    const raw = localStorage.getItem("ndl_my_library");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function isBookInMyLibrary(entries: RawLibraryEntry[], bookId: string): boolean {
  return entries.some(e => (typeof e === "string" ? e === bookId : e?.bookId === bookId));
}
function addBookToMyLibrary(bookId: string) {
  const entries = readMyLibrary();
  if (isBookInMyLibrary(entries, bookId)) return;
  entries.push({ bookId, addedAt: Date.now() });
  try { localStorage.setItem("ndl_my_library", JSON.stringify(entries)); } catch {}
}

function bookFormat(book: CatalogBook): string {
  return book.pdf ? "PDF" : "—";
}

export default function LibraryPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const catalog = usePublicCatalog();

  const [mounted, setMounted] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [languageFilter, setLanguageFilter] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");
  const [formatFilter, setFormatFilter] = useState("");

  useEffect(() => {
    setSavedIds(new Set(readMyLibrary().map(e => (typeof e === "string" ? e : e?.bookId)).filter(Boolean) as string[]));
    setMounted(true);
  }, []);

  function saveToMyLibrary(book: CatalogBook) {
    addBookToMyLibrary(book.id);
    setSavedIds(prev => new Set(prev).add(book.id));
  }

  // ── Catalog-level facets — computed from real books, never from user data ──
  const categories = useMemo(() => {
    const present = new Set(catalog.map(b => b.category).filter(Boolean));
    const ordered = CATEGORY_ORDER.filter(c => present.has(c));
    const extra = [...present].filter(c => !CATEGORY_ORDER.includes(c)).sort();
    return [...ordered, ...extra];
  }, [catalog]);
  const languages = useMemo(() => [...new Set(catalog.map(b => b.language).filter(Boolean))].sort(), [catalog]);
  const authors = useMemo(() => [...new Set(catalog.map(b => b.author).filter(Boolean))].sort(), [catalog]);
  const formats = useMemo(() => [...new Set(catalog.map(bookFormat))], [catalog]);

  const featured = useMemo(() => catalog.slice(0, 4), [catalog]);

  const hasActiveQuery = Boolean(search.trim() || categoryFilter !== "all" || languageFilter || authorFilter || formatFilter);

  const visibleBooks = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalog.filter(b => {
      if (categoryFilter !== "all" && b.category !== categoryFilter) return false;
      if (languageFilter && b.language !== languageFilter) return false;
      if (authorFilter && b.author !== authorFilter) return false;
      if (formatFilter && bookFormat(b) !== formatFilter) return false;
      if (q) {
        const hay = `${b.title} ${b.author} ${b.category} ${b.language}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [catalog, search, categoryFilter, languageFilter, authorFilter, formatFilter]);

  // On the default (no search/filter) view, books already shown in
  // Featured are left out of the category sections below — otherwise
  // every book's cover renders twice on the same page (once per
  // BookCover instance), which doubles concurrent PDF-thumbnail work for
  // no benefit. The moment the user searches or filters, every match is
  // shown regardless of overlap with Featured — a filtered result should
  // never silently disappear because it happened to be featured.
  const sections = useMemo(() => {
    const featuredIds = new Set(featured.map(b => b.id));
    const source = hasActiveQuery ? visibleBooks : visibleBooks.filter(b => !featuredIds.has(b.id));
    const byCategory = new Map<string, CatalogBook[]>();
    for (const book of source) {
      const list = byCategory.get(book.category) ?? [];
      list.push(book);
      byCategory.set(book.category, list);
    }
    const ordered = CATEGORY_ORDER.filter(c => byCategory.has(c));
    const extra = [...byCategory.keys()].filter(c => !CATEGORY_ORDER.includes(c)).sort();
    return [...ordered, ...extra].map(category => ({ category, books: byCategory.get(category)! }));
  }, [visibleBooks, featured, hasActiveQuery]);

  const categoryFilterOptions = [
    { key: "all", label: t.catalogAllCategories },
    ...categories.map(c => ({ key: c, label: c })),
  ];

  function BookCard({ book }: { book: CatalogBook }) {
    const saved = savedIds.has(book.id);
    return (
      <div className="flex h-full min-w-0 flex-col rounded-2xl border border-slate-100 p-4 hover:shadow-lg transition">
        <div className="h-52 w-full overflow-hidden rounded-xl shadow">
          <BookCover book={book} className="h-full w-full" />
        </div>
        <h3 className="mt-3 truncate font-bold text-slate-900">{book.title}</h3>
        {book.author && <p className="truncate text-xs text-slate-500">{book.author}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide">
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">{book.category}</span>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-blue-700">{book.language}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">{bookFormat(book)}</span>
        </div>
        {!!book.pages && <p className="mt-1.5 text-[11px] text-slate-400">{book.pages} {t.catalogPages}</p>}

        <div className="mt-auto flex flex-col gap-2 pt-4">
          <div className="flex gap-2">
            <AppButton href={`/read?book=${book.id}`} variant="secondary" size="sm" fullWidth>
              📖 {t.readerReadNormally}
            </AppButton>
            <AppButton href={`/reader-premium?book=${book.id}`} variant="primary" size="sm" fullWidth>
              🤖 {t.readerReadWithAi}
            </AppButton>
          </div>
          <button
            onClick={() => saveToMyLibrary(book)}
            disabled={saved}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
              saved ? "bg-amber-50 text-amber-700" : "bg-orange-50 text-orange-700 hover:bg-orange-100"
            }`}
          >
            {saved ? `✓ ${t.catalogSavedToLibrary}` : `+ ${t.catalogSaveToLibrary}`}
          </button>
        </div>
      </div>
    );
  }

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
        <PageHeader title={t.footerLibraryCatalog} subtitle={t.catalogSubtitle} homeLabel={t.commonHome} />

        {/* Catalog-level indicators — never user-specific */}
        <div className="mb-8 grid gap-6 md:grid-cols-4">
          <StatCard icon="📚" label={t.statPublishedBooks} value={catalog.length} />
          <StatCard icon="🌐" label={t.statLanguages} value={languages.length} />
          <StatCard icon="🗂️" label={t.statCategories} value={categories.length} />
          <StatCard icon="✨" label={t.statNewArrivals} value={featured.length} valueClassName="text-amber-600" />
        </div>

        {/* Featured Books — real catalog books only */}
        {featured.length > 0 && (
          <InfoCard className="mb-8">
            <h2 className="mb-5 text-2xl font-black text-slate-950">✨ {t.catalogFeaturedTitle}</h2>
            <div className="grid gap-5 md:grid-cols-3 lg:grid-cols-4">
              {featured.map(book => <BookCard key={book.id} book={book} />)}
            </div>
          </InfoCard>
        )}

        {/* Search + facet filters */}
        <SearchBar value={search} onChange={setSearch} placeholder={t.myLibrarySearchPlaceholder} className="mb-4" />
        <FilterBar options={categoryFilterOptions} active={categoryFilter} onChange={setCategoryFilter} className="mb-4" />
        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">{t.commonAllLanguages}</option>
            {languages.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select
            value={authorFilter}
            onChange={(e) => setAuthorFilter(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-amber-400"
          >
            <option value="">{t.catalogAllAuthors}</option>
            {authors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {formats.length > 1 && (
            <select
              value={formatFilter}
              onChange={(e) => setFormatFilter(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm shadow-sm outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">{t.catalogAllFormats}</option>
              {formats.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
        </div>

        {/* Catalog, grouped by category — only categories with matches render.
            An empty `sections` on the default (no search/filter) view just
            means every book is already shown above in Featured — that's
            not an empty-catalog state, so the "no matches" message is only
            shown once a search/filter is actually active. */}
        {sections.length === 0 && (hasActiveQuery || catalog.length === 0) ? (
          <InfoCard className="text-center">
            <p className="text-lg font-black text-slate-950">{t.catalogEmptyTitle}</p>
            <p className="mt-2 text-sm text-slate-500">{t.catalogEmptyDesc}</p>
          </InfoCard>
        ) : (
          sections.map(({ category, books }) => (
            <InfoCard key={category} className="mb-8">
              <h2 className="mb-5 text-2xl font-black text-slate-950">{category}</h2>
              <div className="grid gap-5 md:grid-cols-3 lg:grid-cols-4">
                {books.map(book => <BookCard key={book.id} book={book} />)}
              </div>
            </InfoCard>
          ))
        )}
      </div>
      <AccessibilityToolbar />
    </main>
  );
}
