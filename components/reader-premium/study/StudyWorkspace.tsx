"use client";

import { useMemo, useState } from "react";
import { StoredHighlight, StoredNote, StoredBookmark, HIGHLIGHT_COLOR_HEX } from "./studyData";
import { getDisplayLabel, type PrintedPageMap } from "@/lib/printedPageMap";

type StudySubTab = "highlights" | "notes" | "bookmarks" | "search";
// Kept for prop-compatibility with AICompanion's existing pass-through —
// no longer used to render anything (see note below).
export type RevisionAction = "flashcards" | "quiz" | "mcqs" | "revision";

// Calm, card-based empty state — matches AICompanion's own amber-tinted
// card language (Phase D theme unification) instead of the old bare
// centered gray text on a dark background.
function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-amber-50/40 px-4 py-8 text-center text-xs font-semibold text-slate-400">
      {children}
    </div>
  );
}

// Shared button treatments — matches AICompanion's response-action pills
// (Copy/Read AI Response) so Ask AI ⇄ Study feels like one panel. Delete
// stays visually distinct (light red) but no louder than it needs to be.
const SECONDARY_ACTION_CLASS =
  "ndl-press whitespace-nowrap rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-amber-100";
const DELETE_ACTION_CLASS =
  "ndl-press whitespace-nowrap rounded-lg bg-red-50 px-2.5 py-1.5 text-[11px] font-bold text-red-600 hover:bg-red-100";
const DELETE_ICON_ONLY_CLASS =
  "ndl-press flex-shrink-0 rounded-lg px-2 py-1 text-[13px] text-slate-400 hover:bg-red-50 hover:text-red-600";

export default function StudyWorkspace({
  bookTitle,
  highlights, notes, bookmarks,
  printedPageMap,
  onJumpToPage, onDeleteHighlight, onDeleteNote, onDeleteBookmark,
  onGenerateFromHighlight, generatingId,
}: {
  /** Current book's display title, shown on each highlight card. */
  bookTitle?: string;
  highlights: StoredHighlight[];
  notes: StoredNote[];
  bookmarks: StoredBookmark[];
  /** Static per-book printed-page map (lib/printedPageMap.ts).
   *  highlight.page/note.page/bookmark.page stay the stable internal
   *  pdfPage key regardless — this is display-only. */
  printedPageMap?: PrintedPageMap;
  onJumpToPage: (page: number, flashId?: string) => void;
  onDeleteHighlight: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onDeleteBookmark: (id: string) => void;
  /**
   * No longer called from anywhere in this component — Flashcards/Quiz/
   * MCQs/Revision were removed from highlight cards (they duplicated AI
   * Companion and didn't respond in the demo). Kept as an accepted prop
   * purely so AICompanion's existing pass-through doesn't need editing;
   * safe to delete from both places whenever that cleanup happens.
   */
  onGenerateFromHighlight?: (highlight: StoredHighlight, action: RevisionAction) => void;
  generatingId?: string | null;
}) {
  const [subTab, setSubTab] = useState<StudySubTab>("highlights");
  const [query, setQuery] = useState("");

  // Printed page number only (e.g. "184", or "38–39" for a scanned
  // two-up spread) — the internal PDF page index is never shown, even as
  // a fallback. pdfPage (the stable key highlights/notes/bookmarks are
  // stored under) never changes regardless of what's shown here; a plain
  // placeholder covers the rare case this book/page isn't mapped, so the
  // card never renders a blank line.
  function pageLabelText(pdfPage: number): string {
    return getDisplayLabel(pdfPage, printedPageMap ?? {}) || "Page —";
  }

  const filteredHighlights = useMemo(() => {
    const list = [...highlights].sort((a, b) => b.createdAt - a.createdAt);
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(h => h.selectedText.toLowerCase().includes(q));
  }, [highlights, query]);

  const filteredNotes = useMemo(() => {
    const list = [...notes].sort((a, b) => b.createdAt - a.createdAt);
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(n => n.note.toLowerCase().includes(q) || n.selectedText.toLowerCase().includes(q));
  }, [notes, query]);

  const filteredBookmarks = useMemo(() => {
    const list = [...bookmarks].sort((a, b) => b.createdAt - a.createdAt);
    if (!query.trim()) return list;
    const q = query.toLowerCase();
    return list.filter(b => (b.title || "").toLowerCase().includes(q) || String(b.page).includes(q));
  }, [bookmarks, query]);

  // A highlight and a note don't carry an explicit cross-reference in the
  // data model — the best available signal that a note "belongs to" a
  // highlight is the same page + identical selected text (both are
  // captured from the same activeSelection at creation time).
  function findNoteForHighlight(h: StoredHighlight): StoredNote | undefined {
    return notes.find(n => n.page === h.page && n.selectedText === h.selectedText);
  }

  // Same pill-switcher pattern as AICompanion's own Ask AI / Study tabs
  // (bg-amber-50 track, bg-orange-600 active pill) so the transition
  // between the two outer tabs feels like one continuous panel.
  const tabBtn = (tab: StudySubTab, label: string) => (
    <button
      onClick={() => setSubTab(tab)}
      className={`ndl-press flex-1 rounded-full px-2 py-1.5 text-[11px] font-bold transition-colors ${
        subTab === tab ? "bg-orange-600 text-white" : "text-slate-500 hover:text-slate-800"}`}
    >
      {label}
    </button>
  );

  // ── Simplified highlight card ────────────────────────────────────────
  // ONLY: highlighted text (2-3 lines, ellipsis), book title, page number,
  // color indicator, note indicator (if any). Actions: Open Page,
  // Edit Note (only if a note exists), Delete. Nothing else — no
  // Flashcards/Quiz/MCQs/Revision here; that generation lives in AI
  // Companion now.
  function HighlightCard({ h }: { h: StoredHighlight }) {
    const note = findNoteForHighlight(h);
    return (
      <div className="rounded-2xl bg-white p-3.5 shadow-[0_2px_10px_rgba(75,45,12,0.06)] ring-1 ring-amber-100/70">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ background: HIGHLIGHT_COLOR_HEX[h.color].fill, border: `2px solid ${HIGHLIGHT_COLOR_HEX[h.color].border}` }}
          />
          <span className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">
            📖 {bookTitle?.trim() ? bookTitle : "This book"}
          </span>
          {note && (
            <span title="Note attached" className="ml-auto flex-shrink-0 text-xs">📝</span>
          )}
        </div>

        <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-slate-700">
          “{h.selectedText}”
        </p>

        <p className="mt-1.5 text-[10px] font-bold text-slate-400">
          {pageLabelText(h.page)}
        </p>

        <div className="mt-2.5 flex items-center gap-1.5">
          <button onClick={() => onJumpToPage(h.page, h.id)} className={SECONDARY_ACTION_CLASS}>
            📖 Open Page
          </button>
          {note && (
            <button onClick={() => onJumpToPage(h.page, note.id)} className={SECONDARY_ACTION_CLASS}>
              ✏️ Edit Note
            </button>
          )}
          <button onClick={() => onDeleteHighlight(h.id)} className={`${DELETE_ACTION_CLASS} ml-auto`}>
            🗑 Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 gap-1 rounded-full bg-amber-50 p-1">
        {tabBtn("highlights", "Highlights")}
        {tabBtn("notes", "Notes")}
        {tabBtn("bookmarks", "Bookmarks")}
        {tabBtn("search", "Search")}
      </div>

      {subTab === "search" && (
        <div className="mt-2.5 flex-shrink-0">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search highlights, notes, bookmarks…"
            className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-2.5 text-[13px] text-slate-900 outline-none transition-shadow focus:ring-2 focus:ring-orange-400"
          />
        </div>
      )}

      <div className="mt-3 flex flex-1 flex-col gap-2.5 overflow-y-auto">
        {(subTab === "highlights" || subTab === "search") && filteredHighlights.map(h => (
          <HighlightCard key={h.id} h={h} />
        ))}
        {subTab === "highlights" && filteredHighlights.length === 0 && (
          <EmptyState>No highlights yet. Select text on the page and tap ⭐ Highlight.</EmptyState>
        )}

        {(subTab === "notes" || subTab === "search") && filteredNotes.map(n => (
          <div key={n.id} className="rounded-2xl bg-white p-3 shadow-[0_2px_10px_rgba(75,45,12,0.06)] ring-1 ring-amber-100/70">
            <button
              onClick={() => onJumpToPage(n.page, n.id)}
              className="block w-full text-left"
            >
              <p className="text-[11px] italic text-slate-400">
                “{n.selectedText.slice(0, 70)}{n.selectedText.length > 70 ? "…" : ""}”
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-slate-700">
                📝 {n.note}
              </p>
              <p className="mt-1.5 text-[10px] font-bold text-slate-400">
                {pageLabelText(n.page)} · tap to jump{n.aiImproved ? " · ✨ AI-improved" : ""}
              </p>
            </button>
            <div className="mt-1.5 text-right">
              <button onClick={() => onDeleteNote(n.id)} className={DELETE_ICON_ONLY_CLASS}>
                🗑️
              </button>
            </div>
          </div>
        ))}
        {subTab === "notes" && filteredNotes.length === 0 && (
          <EmptyState>No notes yet. Select text and tap 📝 Add Note.</EmptyState>
        )}

        {(subTab === "bookmarks" || subTab === "search") && filteredBookmarks.map(b => (
          <div key={b.id} className="flex items-center gap-2 rounded-2xl bg-white p-3 shadow-[0_2px_10px_rgba(75,45,12,0.06)] ring-1 ring-amber-100/70">
            <button
              onClick={() => onJumpToPage(b.page)}
              className="flex-1 text-left"
            >
              <p className="text-[12px] font-bold text-slate-700">
                🔖 {b.title?.trim() ? b.title : pageLabelText(b.page)}
              </p>
              <p className="mt-0.5 text-[10px] font-bold text-slate-400">{pageLabelText(b.page)} · tap to jump</p>
            </button>
            <button onClick={() => onDeleteBookmark(b.id)} className={DELETE_ICON_ONLY_CLASS}>
              🗑️
            </button>
          </div>
        ))}
        {subTab === "bookmarks" && filteredBookmarks.length === 0 && (
          <EmptyState>No bookmarks yet. Tap 🔖 Bookmark in the toolbar.</EmptyState>
        )}

        {subTab === "search" && query.trim() && filteredHighlights.length === 0 && filteredNotes.length === 0 && filteredBookmarks.length === 0 && (
          <EmptyState>No matches for “{query}”.</EmptyState>
        )}
      </div>
    </div>
  );
}
