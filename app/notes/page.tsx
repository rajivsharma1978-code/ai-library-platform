"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { directorBooks } from "@/lib/directorBooks";

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
  const t = UI_TEXT[language];
  const isEn = t.navLibrary === "Library";

  const [mounted, setMounted] = useState(false);
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
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-6xl animate-pulse text-sm font-semibold text-slate-400">
          {isEn ? "Loading your notes…" : "आपके नोट्स लोड हो रहे हैं…"}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{t.aiF2Title}</h1>
            <p className="mt-1 text-slate-600">
              {isEn
                ? "Every note you've saved from the Reader, in one polished place."
                : "रीडर से सहेजे गए आपके सभी नोट्स, एक ही जगह पर।"}
            </p>
          </div>
          <Link href="/" className="rounded-xl bg-slate-900 px-4 py-2 text-white hover:bg-slate-700">
            {isEn ? "← Home" : "← होम"}
          </Link>
        </div>

        {usingDemo && (
          <div className="mb-6 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
            {isEn
              ? "📌 Showing polished demo notes — select text in the Reader and tap 📝 Add Note to create your own."
              : "📌 डेमो नोट्स दिखाए जा रहे हैं — रीडर में टेक्स्ट चुनें और अपना नोट बनाने के लिए 📝 पर टैप करें।"}
          </div>
        )}

        {/* 1. Notes overview cards */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-3xl bg-white p-6 shadow ring-1 ring-black/5">
            <p className="text-slate-500">{isEn ? "Total Notes" : "कुल नोट्स"}</p>
            <h2 className="mt-2 text-4xl font-bold text-slate-900">{stats.total}</h2>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow ring-1 ring-black/5">
            <p className="text-slate-500">{isEn ? "✨ AI-Improved" : "✨ एआई-सुधारित"}</p>
            <h2 className="mt-2 text-4xl font-bold text-slate-900">{stats.aiImproved}</h2>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow ring-1 ring-black/5">
            <p className="text-slate-500">{isEn ? "📚 Books with Notes" : "📚 नोट्स वाली किताबें"}</p>
            <h2 className="mt-2 text-4xl font-bold text-slate-900">{stats.booksWithNotes}</h2>
          </div>
          <div className="rounded-3xl bg-white p-6 shadow ring-1 ring-black/5">
            <p className="text-slate-500">{isEn ? "🕐 Recent (7 days)" : "🕐 हाल के (7 दिन)"}</p>
            <h2 className="mt-2 text-4xl font-bold text-slate-900">{stats.recent}</h2>
          </div>
        </div>

        {/* 3. Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isEn ? "Search by book, highlighted text, or your note…" : "किताब, हाइलाइट किए गए टेक्स्ट या नोट से खोजें…"}
          className="mb-4 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm outline-none focus:border-slate-400"
        />

        {/* 4. Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {([
            ["all", isEn ? "All Notes" : "सभी नोट्स"],
            ["ai", isEn ? "✨ AI-Improved" : "✨ एआई-सुधारित"],
            ["book", isEn ? "📚 By Book" : "📚 पुस्तक अनुसार"],
            ["recent", isEn ? "🕐 Recent" : "🕐 हाल के"],
          ] as [FilterTab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                tab === key ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
          {tab === "book" && (
            <select
              value={bookFilter}
              onChange={(e) => setBookFilter(e.target.value)}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200 outline-none"
            >
              <option value="">{isEn ? "Choose a book…" : "एक किताब चुनें…"}</option>
              {uniqueBooks.map(b => (
                <option key={b.id} value={b.id}>{b.title}</option>
              ))}
            </select>
          )}
        </div>

        {/* 2. Notes list */}
        {visibleNotes.length === 0 ? (
          <div className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-black/5">
            <h2 className="text-xl font-semibold text-slate-800">{t.searchNoResults}</h2>
          </div>
        ) : (
          <div className="grid gap-4">
            {visibleNotes.map((n) => {
              const book = findBook(n.bookId);
              const linkedHighlight = hasMatchingHighlight(n);
              const bookmarked = isPageBookmarked(n);
              const isEditing = editingId === n.id;
              const isDemo = usingDemo;

              return (
                <div key={n.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-slate-900">{book?.title ?? n.bookId}</h2>
                        {n.aiImproved && (
                          <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-[11px] font-bold text-purple-700">
                            ✨ {isEn ? "AI-Improved" : "एआई-सुधारित"}
                          </span>
                        )}
                        {linkedHighlight && (
                          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">⭐</span>
                        )}
                        {bookmarked && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-bold text-slate-600">🔖</span>
                        )}
                        {isDemo && (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">demo</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-500">{isEn ? "Page" : "पृष्ठ"} {n.page}</p>
                    </div>
                    <p className="text-xs text-slate-400">
                      {isEn ? "Saved on" : "सहेजा गया"} {new Date(n.createdAt).toLocaleDateString()}
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
                        className="w-full rounded-2xl border border-slate-300 p-3 text-sm outline-none focus:border-slate-500"
                      />
                      <div className="mt-2 flex gap-2">
                        <button
                          onClick={() => saveEdit(n.id)}
                          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700"
                        >
                          {isEn ? "Save" : "सहेजें"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200"
                        >
                          {isEn ? "Cancel" : "रद्द करें"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="whitespace-pre-line text-slate-700">📝 {n.note}</p>
                  )}

                  {!isEditing && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Link
                        href={`/reader-premium?book=${n.bookId}`}
                        className="rounded-xl bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                      >
                        📖 {isEn ? "Open Page" : "पेज खोलें"}
                      </Link>
                      <button
                        onClick={() => startEdit(n)}
                        disabled={isDemo}
                        title={isDemo ? (isEn ? "Demo note — not editable" : "डेमो नोट — संपादन योग्य नहीं") : undefined}
                        className="rounded-xl border px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        ✏️ {isEn ? "Edit Note" : "नोट संपादित करें"}
                      </button>
                      <button
                        onClick={() => deleteNote(n.id)}
                        disabled={isDemo}
                        title={isDemo ? (isEn ? "Demo note — not deletable" : "डेमो नोट — हटाने योग्य नहीं") : undefined}
                        className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        🗑 {isEn ? "Delete" : "हटाएं"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
