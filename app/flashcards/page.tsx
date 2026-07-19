"use client";

import { useEffect, useMemo, useState } from "react";
import { UI_TEXT } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { directorBooks } from "@/lib/directorBooks";
import PageHeader from "@/components/ui/PageHeader";
import LearningNav from "@/components/learning/LearningNav";
import ReturnToBook from "@/components/learning/ReturnToBook";
import InfoCard from "@/components/ui/InfoCard";
import SearchBar from "@/components/ui/SearchBar";
import FilterBar from "@/components/ui/FilterBar";
import AccessibilityToolbar from "@/components/ui/AccessibilityToolbar";

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

// `label` is resolved from UI_TEXT inside the component (see
// `sourceMeta` below) — this map now only holds the language-independent
// `classes` styling.
const SOURCE_META: Record<CardSource, { classes: string }> = {
  highlight: { classes: "bg-amber-100 text-amber-700" },
  note:      { classes: "bg-blue-100 text-blue-700" },
  legacy:    { classes: "bg-slate-200 text-slate-600" },
  demo:      { classes: "bg-amber-100 text-amber-700" },
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
  const sourceLabels: Record<CardSource, string> = {
    highlight: t.flashcardsSourceHighlight, note: t.flashcardsSourceNote,
    legacy: t.flashcardsSourceLegacyNote, demo: t.commonDemo,
  };

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
      front: t.flashcardsFrontHighlightPrompt,
      back: h.selectedText,
      bookTitle: findBookTitle(h.bookId),
      page: h.page,
      source: "highlight",
      createdAt: h.createdAt,
    }));

    const fromNotes: Card[] = notes.map(n => ({
      id: `n-${n.id}`,
      front: `“${truncate(n.selectedText, 90)}”`,
      back: n.note,
      bookTitle: findBookTitle(n.bookId),
      page: n.page,
      source: "note",
      createdAt: n.createdAt,
    }));

    const fromLegacy: Card[] = legacyNotes.map(n => ({
      id: `legacy-${n.id}`,
      front: t.flashcardsFrontLegacyPrompt.replace("{topic}", n.chapter || n.bookTitle),
      back: n.text,
      bookTitle: n.bookTitle,
      source: "legacy",
      createdAt: new Date(n.createdAt).getTime() || 0,
    }));

    const merged = [...fromHighlights, ...fromNotes, ...fromLegacy].sort((a, b) => b.createdAt - a.createdAt);
    return merged.length > 0 ? merged : DEMO_CARDS;
  }, [highlights, notes, legacyNotes, t]);

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
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] p-6">
        <div className="mx-auto max-w-4xl animate-pulse text-sm font-semibold text-slate-400">
          {t.flashcardsLoading}
        </div>
      </main>
    );
  }

  const sourceOptions: { key: SourceFilter; label: string }[] = [
    { key: "all", label: t.flashcardsAllSources },
    { key: "highlight", label: "⭐ " + sourceLabels.highlight },
    { key: "note", label: "📝 " + sourceLabels.note },
    { key: "legacy", label: "🗂 " + sourceLabels.legacy },
    { key: "demo", label: "✨ " + sourceLabels.demo },
  ];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#fff8e8_0%,#f3e6c8_45%,#eaddc0_100%)] p-6">
      <div className="mx-auto max-w-4xl">
        <PageHeader
          title={t.commonFlashcards}
          subtitle={t.flashcardsPageSubtitle}
          homeLabel={t.commonHome}
        />

        <LearningNav />
        <ReturnToBook />

        {usingDemo && (
          <InfoCard tone="amber" className="mb-6 py-3 text-sm font-semibold">
            {t.flashcardsDemoBanner}
          </InfoCard>
        )}

        {/* Search */}
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder={t.flashcardsSearchPlaceholder}
          className="mb-4"
        />

        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <FilterBar options={sourceOptions} active={sourceFilter} onChange={setSourceFilter} />
          {uniqueBooks.length > 1 && (
            <select
              value={bookFilter}
              onChange={(e) => setBookFilter(e.target.value)}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="">{t.flashcardsAllBooks}</option>
              {uniqueBooks.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
        </div>

        {/* Study card */}
        {!current ? (
          <InfoCard className="p-10 text-center">
            <p className="text-slate-600">{t.searchNoResults}</p>
          </InfoCard>
        ) : (
          <>
            <div className="mb-3 flex items-center justify-between text-xs font-bold text-slate-400">
              <span>{cursor + 1} {t.commonOf} {visibleCards.length}</span>
              <span className={`rounded-full px-2.5 py-1 ${SOURCE_META[current.source].classes}`}>
                {sourceLabels[current.source]}
              </span>
            </div>

            <button
              onClick={() => setFlipped(f => !f)}
              className="min-h-64 w-full rounded-3xl bg-white p-8 text-left shadow-[0_20px_60px_rgba(75,45,12,0.10)] ring-1 ring-black/5 hover:shadow-[0_20px_60px_rgba(75,45,12,0.16)] transition-shadow"
            >
              <p className="text-xs font-semibold text-slate-400">
                📖 {current.bookTitle}{current.page ? ` · ${t.commonPage} ${current.page}` : ""}
              </p>

              {!flipped ? (
                <>
                  <h2 className="mt-4 text-xl font-bold text-slate-900">{current.front}</h2>
                  <p className="mt-6 text-sm text-slate-400">
                    {t.flashcardsTapToReveal}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-4 text-xs font-bold uppercase tracking-wide text-emerald-600">
                    {t.flashcardsAnswerLabel}
                  </p>
                  <p className="mt-2 text-lg leading-7 text-slate-800">{current.back}</p>
                  <p className="mt-6 text-sm text-slate-400">
                    {t.flashcardsTapToFlipBack}
                  </p>
                </>
              )}
            </button>

            <div className="mt-5 flex items-center justify-between">
              <button
                onClick={goPrev}
                disabled={cursor === 0}
                className="rounded-full bg-slate-950 px-6 py-2.5 text-sm font-bold text-white disabled:opacity-30"
              >
                ← {t.commonPrevious}
              </button>
              <button
                onClick={goNext}
                disabled={cursor >= visibleCards.length - 1}
                className="rounded-full bg-slate-950 px-6 py-2.5 text-sm font-bold text-white disabled:opacity-30"
              >
                {t.commonNext} →
              </button>
            </div>
          </>
        )}
      </div>
      <AccessibilityToolbar />
    </main>
  );
}
