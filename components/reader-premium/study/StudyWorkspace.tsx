"use client";

import { useMemo, useState } from "react";
import { StoredHighlight, StoredNote, StoredBookmark, HIGHLIGHT_COLOR_HEX } from "./studyData";
import { getDisplayLabel, type PrintedPageMap } from "@/lib/printedPageMap";

type StudySubTab = "highlights" | "notes" | "bookmarks" | "search";
// Kept for prop-compatibility with AICompanion's existing pass-through —
// no longer used to render anything (see note below).
export type RevisionAction = "flashcards" | "quiz" | "mcqs" | "revision";

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

  const tabBtn = (tab: StudySubTab, label: string) => (
    <button
      onClick={() => setSubTab(tab)}
      style={{
        flex: 1, padding: "6px 4px", fontSize: 11, fontWeight: 700,
        borderRadius: 10, border: "none", cursor: "pointer",
        background: subTab === tab ? "#2563eb" : "transparent",
        color: subTab === tab ? "#fff" : "#94a3b8",
      }}
    >
      {label}
    </button>
  );

  const actionBtnStyle: React.CSSProperties = {
    background: "#1e293b", color: "#cbd5e1", border: "none",
    borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700,
    cursor: "pointer", whiteSpace: "nowrap",
  };

  // ── Simplified highlight card ────────────────────────────────────────
  // ONLY: highlighted text (2-3 lines, ellipsis), book title, page number,
  // color indicator, note indicator (if any). Actions: Open Page,
  // Edit Note (only if a note exists), Delete. Nothing else — no
  // Flashcards/Quiz/MCQs/Revision here; that generation lives in AI
  // Companion now.
  function HighlightCard({ h }: { h: StoredHighlight }) {
    const note = findNoteForHighlight(h);
    return (
      <div style={{ background: "#0f172a", borderRadius: 14, padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            width: 10, height: 10, borderRadius: "50%", flexShrink: 0,
            background: HIGHLIGHT_COLOR_HEX[h.color].fill,
            border: `2px solid ${HIGHLIGHT_COLOR_HEX[h.color].border}`,
          }} />
          <span style={{
            fontSize: 10, fontWeight: 700, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: "0.04em",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            📖 {bookTitle?.trim() ? bookTitle : "This book"}
          </span>
          {note && (
            <span title="Note attached" style={{ marginLeft: "auto", fontSize: 12, flexShrink: 0 }}>📝</span>
          )}
        </div>

        <p style={{
          fontSize: 13, color: "#e2e8f0", lineHeight: 1.5, margin: "8px 0 0",
          display: "-webkit-box",
          WebkitLineClamp: 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          “{h.selectedText}”
        </p>

        <p style={{ fontSize: 10, color: "#64748b", marginTop: 6, fontWeight: 700 }}>
          {pageLabelText(h.page)}
        </p>

        <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
          <button onClick={() => onJumpToPage(h.page, h.id)} style={actionBtnStyle}>
            📖 Open Page
          </button>
          {note && (
            <button onClick={() => onJumpToPage(h.page, note.id)} style={actionBtnStyle}>
              ✏️ Edit Note
            </button>
          )}
          <button
            onClick={() => onDeleteHighlight(h.id)}
            style={{ ...actionBtnStyle, marginLeft: "auto", background: "#3f1d1d", color: "#fca5a5" }}
          >
            🗑 Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ display: "flex", gap: 4, background: "#0f172a", borderRadius: 12, padding: 4 }}>
        {tabBtn("highlights", "Highlights")}
        {tabBtn("notes", "Notes")}
        {tabBtn("bookmarks", "Bookmarks")}
        {tabBtn("search", "Search")}
      </div>

      {subTab === "search" && (
        <div style={{ marginTop: 10 }}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search highlights, notes, bookmarks…"
            style={{
              width: "100%", boxSizing: "border-box", borderRadius: 12,
              padding: "9px 12px", fontSize: 13, border: "none", outline: "none",
              background: "#fff", color: "#0f172a",
            }}
          />
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto", marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {(subTab === "highlights" || subTab === "search") && filteredHighlights.map(h => (
          <HighlightCard key={h.id} h={h} />
        ))}
        {subTab === "highlights" && filteredHighlights.length === 0 && (
          <p style={{ fontSize: 12, color: "#64748b", textAlign: "center", marginTop: 20 }}>
            No highlights yet. Select text on the page and tap ⭐ Highlight.
          </p>
        )}

        {(subTab === "notes" || subTab === "search") && filteredNotes.map(n => (
          <div key={n.id} style={{ background: "#0f172a", borderRadius: 14, padding: 10 }}>
            <button
              onClick={() => onJumpToPage(n.page, n.id)}
              style={{ width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              <p style={{ fontSize: 11, color: "#64748b", fontStyle: "italic" }}>
                “{n.selectedText.slice(0, 70)}{n.selectedText.length > 70 ? "…" : ""}”
              </p>
              <p style={{ fontSize: 12, color: "#e2e8f0", marginTop: 4, lineHeight: 1.5 }}>
                📝 {n.note}
              </p>
              <p style={{ fontSize: 10, color: "#64748b", marginTop: 4, fontWeight: 700 }}>
                {pageLabelText(n.page)} · tap to jump{n.aiImproved ? " · ✨ AI-improved" : ""}
              </p>
            </button>
            <div style={{ textAlign: "right", marginTop: 6 }}>
              <button onClick={() => onDeleteNote(n.id)}
                style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 13 }}>
                🗑️
              </button>
            </div>
          </div>
        ))}
        {subTab === "notes" && filteredNotes.length === 0 && (
          <p style={{ fontSize: 12, color: "#64748b", textAlign: "center", marginTop: 20 }}>
            No notes yet. Select text and tap 📝 Add Note.
          </p>
        )}

        {(subTab === "bookmarks" || subTab === "search") && filteredBookmarks.map(b => (
          <div key={b.id} style={{ background: "#0f172a", borderRadius: 14, padding: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => onJumpToPage(b.page)}
              style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}
            >
              <p style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 700 }}>
                🔖 {b.title?.trim() ? b.title : pageLabelText(b.page)}
              </p>
              <p style={{ fontSize: 10, color: "#64748b", marginTop: 2, fontWeight: 700 }}>{pageLabelText(b.page)} · tap to jump</p>
            </button>
            <button onClick={() => onDeleteBookmark(b.id)}
              style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>
              🗑️
            </button>
          </div>
        ))}
        {subTab === "bookmarks" && filteredBookmarks.length === 0 && (
          <p style={{ fontSize: 12, color: "#64748b", textAlign: "center", marginTop: 20 }}>
            No bookmarks yet. Tap 🔖 Bookmark in the toolbar.
          </p>
        )}

        {subTab === "search" && query.trim() && filteredHighlights.length === 0 && filteredNotes.length === 0 && filteredBookmarks.length === 0 && (
          <p style={{ fontSize: 12, color: "#64748b", textAlign: "center", marginTop: 20 }}>
            No matches for “{query}”.
          </p>
        )}
      </div>
    </div>
  );
}
