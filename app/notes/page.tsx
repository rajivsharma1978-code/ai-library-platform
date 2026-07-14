"use client";

import { useEffect, useMemo, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { directorBooks } from "@/lib/directorBooks";
import PageHeader from "@/components/ui/PageHeader";
import StatCard from "@/components/ui/StatCard";
import InfoCard from "@/components/ui/InfoCard";
import SearchBar from "@/components/ui/SearchBar";
import FilterBar from "@/components/ui/FilterBar";
import AppButton from "@/components/ui/AppButton";
import AccessibilityToolbar from "@/components/ui/AccessibilityToolbar";

// ── Local, read-only types mirroring the Reader's Study Workspace data
// shapes (ndl_notes / ndl_highlights / ndl_bookmarks). Deliberately NOT
// imported from the Reader/Study Workspace modules — this page only reads
// the same localStorage keys, it never depends on their component code,
// and it never writes to ndl_highlights or ndl_bookmarks (read-only).
// Index signatures preserve any fields we don't know about (like a
// highlight/note's rectPct) so editing a note here can never silently
// drop data the Reader relies on to draw its overlays. ────────────────
interface StoredNoteLite {
  id: string;
  bookId: string;
  page: number;
  selectedText: string;
  note: string;
  createdAt: number;
  aiImproved?: boolean;
  [key: string]: any;
}
interface StoredHighlightLite {
  id: string;
  bookId: string;
  page: number;
  selectedText: string;
  color: string;
  createdAt: number;
  [key: string]: any;
}
interface StoredBookmarkLite {
  id: string;
  bookId: string;
  page: number;
  title?: string;
  createdAt: number;
  [key: string]: any;
}
type DirectorBook = { id: string; title: string; author?: string; [key: string]: any };

const NOTES_KEY = "ndl_notes";
const HIGHLIGHTS_KEY = "ndl_highlights";
const BOOKMARKS_KEY = "ndl_bookmarks";
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function findBook(bookId: string): DirectorBook | undefined {
  return (directorBooks as DirectorBook[]).find(b => b.id === bookId);
}

// ── Polished demo fallback — shown only when ndl_notes is genuinely empty.
const DEMO_NOTES: StoredNoteLite[] = [
  {
    id: "demo-1", bookId: "quantum", page: 42,
    selectedText: "A qubit can exist in a superposition of the |0⟩ and |1⟩ states simultaneously, unlike a classical bit.",
    note: "Remember: superposition ≠ being in both states at once in the classical sense — it's a probability amplitude until measured.",
    createdAt: Date.now() - 1000 * 60 * 60 * 5, aiImproved: true,
  },
  {
    id: "demo-2", bookId: "nalanda", page: 12,
    selectedText: "Nalanda was one of the world's first residential universities, attracting scholars from across Asia.",
    note: "Good exam point — mention alongside Takshashila as an example of ancient Indian higher education.",
    createdAt: Date.now() - 1000 * 60 * 60 * 30,
  },
  {
    id: "demo-3", bookId: "chandrayaan-3", page: 8,
    selectedText: "The lander module used a combination of laser and camera-based hazard detection during descent.",
    note: "Compare this to Chandrayaan-2's descent approach for the next revision session.",
    createdAt: Date.now() - 1000 * 60 * 60 * 72,
  },
];

type FilterTab = "all" | "ai" | "book" | "recent";

export default function NotesPage() {
  const { language } = useLanguage();

  const [mounted, setMounted] = useState(false);
  // isHydrated is false during SSR and the client's first (hydration) render,
  // so t always resolves to English then — matching the server markup exactly.
  // It only flips true in a useEffect, strictly after hydration completes.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  const t = UI_TEXT[hydrated ? language : "en"];
  const [notes, setNotes] = useState<StoredNoteLite[]>([]);
  const [highlights, setHighlights] = useState<StoredHighlightLite[]>([]);
  const [bookmarks, setBookmarks] = useState<StoredBookmarkLite[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");
  const [bookFilter, setBookFilter] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  useEffect(() => {
    setNotes(readArray<StoredNoteLite>(NOTES_KEY));
    setHighlights(readArray<StoredHighlightLite>(HIGHLIGHTS_KEY));
    setBookmarks(readArray<StoredBookmarkLite>(BOOKMARKS_KEY));
    setMounted(true);
  }, []);

  const usingDemo = notes.length === 0;
  const sourceNotes = usingDemo ? DEMO_NOTES : notes;

  function persistNotes(next: StoredNoteLite[]) {
    setNotes(next);
    writeArray(NOTES_KEY, next);
  }

  function deleteNote(id: string) {
    if (usingDemo) return; // demo cards aren't real data — nothing to delete
    persistNotes(notes.filter(n => n.id !== id));
    if (editingId === id) setEditingId(null);
  }

  function startEdit(n: StoredNoteLite) {
    if (usingDemo) return;
    setEditingId(n.id);
    setEditDraft(n.note);
  }
  function saveEdit(id: string) {
    // Only the `note` text field is touched — every other field (rectPct,
    // aiImproved, createdAt, etc.) is preserved exactly as-is, so this can
    // never corrupt what the Reader's highlight/note overlays depend on.
    persistNotes(notes.map(n => n.id === id ? { ...n, note: editDraft } : n));
    setEditingId(null);
  }

  // ── Cross-reference helpers (read-only) ────────────────────────────
  function hasMatchingHighlight(n: StoredNoteLite): StoredHighlightLite | undefined {
    return highlights.find(h => h.bookId === n.bookId && h.page === n.page && h.selectedText === n.selectedText);
  }
  function isPageBookmarked(n: StoredNoteLite): boolean {
    return bookmarks.some(b => b.bookId === n.bookId && b.page === n.page);
  }

  // ── Overview stats ───────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = sourceNotes.length;
    const aiImproved = sourceNotes.filter(n => n.aiImproved).length;
    const booksWithNotes = new Set(sourceNotes.map(n => n.bookId)).size;
    const recent = sourceNotes.filter(n => Date.now() - n.createdAt <= WEEK_MS).length;
    return { total, aiImproved, booksWithNotes, recent };
  }, [sourceNotes]);

  const uniqueBooks = useMemo(() => {
    const ids = Array.from(new Set(sourceNotes.map(n => n.bookId)));
    return ids.map(id => ({ id, title: findBook(id)?.title ?? id }));
  }, [sourceNotes]);

  // ── Search + filter pipeline ─────────────────────────────────────────
  const visibleNotes = useMemo(() => {
    let list = [...sourceNotes].sort((a, b) => b.createdAt - a.createdAt);

    if (tab === "ai") list = list.filter(n => n.aiImproved);
    else if (tab === "recent") list = list.filter(n => Date.now() - n.createdAt <= WEEK_MS);
    else if (tab === "book" && bookFilter) list = list.filter(n => n.bookId === bookFilter);

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(n => {
        const title = (findBook(n.bookId)?.title ?? n.bookId).toLowerCase();
        return title.includes(q) || n.selectedText.toLowerCase().includes(q) || n.note.toLowerCase().includes(q);
      });
    }
    return list;
  }, [sourceNotes, tab, bookFilter, search]);

  if (!mounted) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] p-6">
        <div className="mx-auto max-w-6xl animate-pulse text-sm font-semibold text-slate-400">
          {t.commonLoading}
        </div>
      </main>
    );
  }

  const filterOptions: { key: FilterTab; label: string }[] = [
    { key: "all", label: t.notesFilterAll },
    { key: "ai", label: `✨ ${t.notesAiImproved}` },
    { key: "book", label: `📚 ${t.notesFilterByBook}` },
    { key: "recent", label: `🕐 ${t.notesFilterRecent}` },
  ];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] p-6">
      <div className="mx-auto max-w-6xl">

        <PageHeader
          title={t.notesPageTitle}
          subtitle={t.notesPageSubtitle}
          homeLabel={t.commonHome}
        />

        {usingDemo && (
          <InfoCard tone="amber" className="mb-6 py-3 text-sm font-semibold">
            {t.notesDemoBanner}
          </InfoCard>
        )}

        {/* 1. Notes overview cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label={t.notesStatTotal} value={stats.total} />
          <StatCard label={`✨ ${t.notesAiImproved}`} value={stats.aiImproved} />
          <StatCard label={`📚 ${t.notesStatBooksWithNotes}`} value={stats.booksWithNotes} />
          <StatCard label={`🕐 ${t.notesStatRecent}`} value={stats.recent} />
        </div>

        {/* 3. Search */}
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder={t.notesSearchPlaceholder}
          className="mb-4"
        />

        {/* 4. Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <FilterBar options={filterOptions} active={tab} onChange={setTab} />
          {tab === "book" && (
            <select
              value={bookFilter}
              onChange={(e) => setBookFilter(e.target.value)}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">{t.notesChooseBook}</option>
              {uniqueBooks.map(b => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>
          )}
        </div>

        {/* 2. Notes list */}
        {visibleNotes.length === 0 ? (
          <InfoCard className="p-10 text-center">
            <h2 className="text-xl font-semibold text-slate-800">{t.searchNoResults}</h2>
          </InfoCard>
        ) : (
          <div className="grid gap-4">
            {visibleNotes.map((n) => {
              const book = findBook(n.bookId);
              const linkedHighlight = hasMatchingHighlight(n);
              const bookmarked = isPageBookmarked(n);
              const isEditing = editingId === n.id;
              const isDemo = usingDemo;

              return (
                <InfoCard key={n.id} className="p-5">
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-slate-900">{book?.title ?? n.bookId}</h2>
                        {n.aiImproved && (
                          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
                            ✨ {t.notesAiImproved}
                          </span>
                        )}
                        {linkedHighlight && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">⭐</span>
                        )}
                        {bookmarked && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">🔖</span>
                        )}
                        {isDemo && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{t.commonDemo}</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">{t.commonPage} {n.page}</p>
                    </div>
                    <p className="text-xs text-slate-400">
                      {t.notesSavedOn} {new Date(n.createdAt).toLocaleDateString()}
                    </p>
                  </div>

                  <p className="mb-2 border-l-4 border-amber-200 pl-3 text-sm italic text-slate-500">
                    “{n.selectedText.length > 160 ? n.selectedText.slice(0, 160) + "…" : n.selectedText}”
                  </p>

                  {isEditing ? (
                    <div className="mt-2">
                      <textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={4}
                        className="w-full rounded-2xl border border-slate-300 p-3 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-amber-400"
                      />
                      <div className="mt-2 flex gap-2">
                        <AppButton onClick={() => saveEdit(n.id)} size="sm">
                          {t.commonSave}
                        </AppButton>
                        <AppButton onClick={() => setEditingId(null)} variant="secondary" size="sm">
                          {t.commonCancel}
                        </AppButton>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-line text-slate-700">📝 {n.note}</p>
                  )}

                  {!isEditing && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <AppButton href={`/reader-premium?book=${n.bookId}`} size="sm">
                        📖 {t.notesOpenPage}
                      </AppButton>
                      <AppButton
                        onClick={() => startEdit(n)}
                        disabled={isDemo}
                        title={isDemo ? t.notesDemoNoteNotEditable : undefined}
                        variant="secondary"
                        size="sm"
                      >
                        ✏️ {t.notesEditNote}
                      </AppButton>
                      <AppButton
                        onClick={() => deleteNote(n.id)}
                        disabled={isDemo}
                        title={isDemo ? t.notesDemoNoteNotDeletable : undefined}
                        variant="danger"
                        size="sm"
                      >
                        🗑 {t.notesDelete}
                      </AppButton>
                    </div>
                  )}
                </InfoCard>
              );
            })}
          </div>
        )}
      </div>
      <AccessibilityToolbar />
    </main>
  );
}
