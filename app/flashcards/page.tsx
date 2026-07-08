"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { directorBooks } from "@/lib/directorBooks";

// ── Local, read-only types mirroring Reader/Study Workspace data shapes.
// Not imported from those modules — this page only reads the same
// localStorage keys, and never writes to any of them. ─────────────────
interface StoredHighlightLite { id: string; bookId: string; page: number; selectedText: string; createdAt: number; [k: string]: any; }
interface StoredNoteLite { id: string; bookId: string; page: number; selectedText: string; note: string; createdAt: number; [k: string]: any; }
// Legacy shape from the pre-Reader notes system (still used by app/quiz
// today) — merged in as a fallback, never replacing the new keys.
interface LegacyNote { id: string; bookTitle: string; chapter?: string; text: string; createdAt: string; }
type DirectorBook = { id: string; title: string; [k: string]: any };

type CardSource = "highlight" | "note" | "legacy" | "demo";
type Card = {
  id: string;
  front: string;
  back: string;
  bookTitle: string;
  page?: number;
  source: CardSource;
  createdAt: number;
};

const SOURCE_META: Record<CardSource, { label: string; classes: string }> = {
  highlight: { label: "Highlight",   classes: "bg-amber-100 text-amber-700" },
  note:      { label: "Note",        classes: "bg-purple-100 text-purple-700" },
  legacy:    { label: "Legacy Note", classes: "bg-slate-200 text-slate-600" },
  demo:      { label: "Demo",        classes: "bg-blue-100 text-blue-700" },
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
function findBookTitle(bookId: string): string {
  return (directorBooks as DirectorBook[]).find(b => b.id === bookId)?.title ?? bookId;
}
function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n).trimEnd() + "…" : s;
}

const DEMO_CARDS: Card[] = [
  { id: "demo-1", front: "What is a qubit?", back: "A quantum bit — unlike a classical bit, it can exist in a superposition of |0⟩ and |1⟩ simultaneously.", bookTitle: "Quantum Computing", page: 42, source: "demo", createdAt: Date.now() - 1000 * 60 * 60 * 5 },
  { id: "demo-2", front: "What made Nalanda historically significant?", back: "It was one of the world's first residential universities, attracting scholars from across Asia.", bookTitle: "Nalanda: The Untold Story", page: 12, source: "demo", createdAt: Date.now() - 1000 * 60 * 60 * 30 },
  { id: "demo-3", front: "How did Chandrayaan-3's lander detect hazards during descent?", back: "Using a combination of laser and camera-based hazard detection.", bookTitle: "Chandrayaan 3", page: 8, source: "demo", createdAt: Date.now() - 1000 * 60 * 60 * 72 },
];

type SourceFilter = "all" | CardSource;

export default function FlashcardsPage() {
  const { language } = useLanguage();
  const t = UI_TEXT[language];
  const isEn = t.navLibrary === "Library";

  const [mounted, setMounted] = useState(false);
  const [highlights, setHighlights] = useState<StoredHighlightLite[]>([]);
  const [notes, setNotes] = useState<StoredNoteLite[]>([]);
  const [legacyNotes, setLegacyNotes] = useState<LegacyNote[]>([]);

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [bookFilter, setBookFilter] = useState("");
  const [cursor, setCursor] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setHighlights(readArray<StoredHighlightLite>("ndl_highlights"));
    setNotes(readArray<StoredNoteLite>("ndl_notes"));
    setLegacyNotes(readArray<LegacyNote>("ndl_ai_notes"));
    setMounted(true);
  }, []);

  // ── Build flashcards from real study data — highlights, notes, and the
  // legacy ndl_ai_notes format — most recent first. Demo fallback ONLY
  // when all three are genuinely empty. ─────────────────────────────────
  const allCards: Card[] = useMemo(() => {
    const fromHighlights: Card[] = highlights.map(h => ({
      id: `h-${h.id}`,
      front: isEn ? `What does this highlighted passage explain?` : `यह हाइलाइट किया गया अंश क्या बताता है?`,
      back: h.selectedText,
      bookTitle: findBookTitle(h.bookId),
      page: h.page,
      source: "highlight",
      createdAt: h.createdAt,
    }));

    const fromNotes: Card[] = notes.map(n => ({
      id: `n-${n.id}`,
      front: isEn ? `“${truncate(n.selectedText, 90)}”` : `"${truncate(n.selectedText, 90)}"`,
      back: n.note,
      bookTitle: findBookTitle(n.bookId),
      page: n.page,
      source: "note",
      createdAt: n.createdAt,
    }));

    const fromLegacy: Card[] = legacyNotes.map(n => ({
      id: `legacy-${n.id}`,
      front: isEn ? `What is the key idea from ${n.chapter || n.bookTitle}?` : `${n.chapter || n.bookTitle} का मुख्य विचार क्या है?`,
      back: n.text,
      bookTitle: n.bookTitle,
      source: "legacy",
      createdAt: new Date(n.createdAt).getTime() || 0,
    }));

    const merged = [...fromHighlights, ...fromNotes, ...fromLegacy].sort((a, b) => b.createdAt - a.createdAt);
    return merged.length > 0 ? merged : DEMO_CARDS;
  }, [highlights, notes, legacyNotes, isEn]);

  const usingDemo = allCards === DEMO_CARDS;

  const uniqueBooks = useMemo(
    () => Array.from(new Set(allCards.map(c => c.bookTitle))),
    [allCards]
  );

  // ── Search + filters ───────────────────────────────────────────────
  const visibleCards = useMemo(() => {
    let list = allCards;
    if (sourceFilter !== "all") list = list.filter(c => c.source === sourceFilter);
    if (bookFilter) list = list.filter(c => c.bookTitle === bookFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(c =>
        c.front.toLowerCase().includes(q) ||
        c.back.toLowerCase().includes(q) ||
        c.bookTitle.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allCards, sourceFilter, bookFilter, search]);

  // Keep the cursor in range whenever the filtered set shrinks/changes,
  // and always land on an unflipped card when the set changes.
  useEffect(() => {
    setCursor(0);
    setFlipped(false);
  }, [sourceFilter, bookFilter, search]);
  useEffect(() => {
    if (cursor >= visibleCards.length) setCursor(Math.max(0, visibleCards.length - 1));
  }, [visibleCards, cursor]);

  const current = visibleCards[cursor];

  function goPrev() {
    setFlipped(false);
    setCursor(c => Math.max(0, c - 1));
  }
  function goNext() {
    setFlipped(false);
    setCursor(c => Math.min(visibleCards.length - 1, c + 1));
  }

  if (!mounted) {
    return (
      <main className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-4xl animate-pulse text-sm font-semibold text-slate-400">
          {isEn ? "Loading flashcards…" : "फ्लैशकार्ड लोड हो रहे हैं…"}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold text-slate-900">{isEn ? "Flashcards" : "फ्लैशकार्ड"}</h1>
            <p className="mt-2 text-slate-600">
              {isEn ? "Click a card to reveal the answer." : "उत्तर देखने के लिए कार्ड पर क्लिक करें।"}
            </p>
          </div>
          <Link href="/" className="rounded-xl bg-black px-4 py-2 text-white">{isEn ? "← Home" : "← होम"}</Link>
        </div>

        {usingDemo && (
          <div className="mb-6 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
            {isEn
              ? "📌 Showing demo flashcards — highlight text or add notes in the Reader to generate your own."
              : "📌 डेमो फ्लैशकार्ड दिखाए जा रहे हैं — अपने खुद के बनाने के लिए रीडर में टेक्स्ट हाइलाइट करें या नोट्स जोड़ें।"}
          </div>
        )}

        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isEn ? "Search flashcards, book title…" : "फ्लैशकार्ड, पुस्तक शीर्षक खोजें…"}
          className="mb-4 w-full rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm outline-none focus:border-slate-400"
        />

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {([
            ["all", isEn ? "All Sources" : "सभी स्रोत"],
            ["highlight", "⭐ " + SOURCE_META.highlight.label],
            ["note", "📝 " + SOURCE_META.note.label],
            ["legacy", "🗂 " + SOURCE_META.legacy.label],
            ["demo", "✨ " + SOURCE_META.demo.label],
          ] as [SourceFilter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSourceFilter(key)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${
                sourceFilter === key ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"
              }`}
            >
              {label}
            </button>
          ))}
          {uniqueBooks.length > 1 && (
            <select
              value={bookFilter}
              onChange={(e) => setBookFilter(e.target.value)}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm outline-none"
            >
              <option value="">{isEn ? "All Books" : "सभी किताबें"}</option>
              {uniqueBooks.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
        </div>

        {/* Study card */}
        {!current ? (
          <div className="rounded-3xl bg-white p-10 text-center shadow-sm ring-1 ring-black/5">
            <p className="text-slate-600">{t.searchNoResults}</p>
          </div>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between text-xs font-bold text-slate-400">
              <span>{isEn ? "Card" : "कार्ड"} {cursor + 1} {isEn ? "of" : "में से"} {visibleCards.length}</span>
              <span className={`rounded-full px-2.5 py-1 ${SOURCE_META[current.source].classes}`}>
                {SOURCE_META[current.source].label}
              </span>
            </div>

            <button
              onClick={() => setFlipped(f => !f)}
              className="min-h-64 w-full rounded-3xl bg-white p-8 text-left shadow-lg ring-1 ring-black/5 hover:shadow-xl transition-shadow"
            >
              <p className="text-xs font-semibold text-slate-400">
                📖 {current.bookTitle}{current.page ? ` · ${isEn ? "Page" : "पृष्ठ"} ${current.page}` : ""}
              </p>

              {!flipped ? (
                <>
                  <h2 className="mt-4 text-xl font-bold text-slate-900">{current.front}</h2>
                  <p className="mt-6 text-sm text-slate-400">
                    {isEn ? "Tap to reveal answer" : "उत्तर देखने के लिए टैप करें"}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-4 text-xs font-bold uppercase tracking-wide text-emerald-600">
                    {isEn ? "Answer" : "उत्तर"}
                  </p>
                  <p className="mt-2 text-lg leading-7 text-slate-800">{current.back}</p>
                  <p className="mt-6 text-sm text-slate-400">
                    {isEn ? "Tap to flip back" : "वापस पलटने के लिए टैप करें"}
                  </p>
                </>
              )}
            </button>

            <div className="mt-5 flex items-center justify-between">
              <button
                onClick={goPrev}
                disabled={cursor === 0}
                className="rounded-full bg-slate-900 px-6 py-2.5 text-sm font-bold text-white disabled:opacity-30"
              >
                ← {isEn ? "Previous" : "पिछला"}
              </button>
              <button
                onClick={goNext}
                disabled={cursor >= visibleCards.length - 1}
                className="rounded-full bg-slate-900 px-6 py-2.5 text-sm font-bold text-white disabled:opacity-30"
              >
                {isEn ? "Next" : "अगला"} →
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
