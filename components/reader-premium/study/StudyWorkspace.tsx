"use client";

import { useMemo, useState } from "react";
import { StoredHighlight, StoredNote, StoredBookmark, HIGHLIGHT_COLOR_HEX } from "./studyData";

type StudySubTab = "highlights" | "notes" | "bookmarks" | "search";
export type RevisionAction = "flashcards" | "quiz" | "mcqs" | "revision";

export default function StudyWorkspace({
  highlights, notes, bookmarks,
  onJumpToPage, onDeleteHighlight, onDeleteNote, onDeleteBookmark,
  onGenerateFromHighlight, generatingId,
}: {
  highlights: StoredHighlight[];
  notes: StoredNote[];
  bookmarks: StoredBookmark[];
  onJumpToPage: (page: number, flashId?: string) => void;
  onDeleteHighlight: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onDeleteBookmark: (id: string) => void;
  onGenerateFromHighlight: (highlight: StoredHighlight, action: RevisionAction) => void;
  generatingId: string | null;
}) {
  const [subTab, setSubTab] = useState<StudySubTab>("highlights");
  const [query, setQuery] = useState("");

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

  const REVISION_ACTIONS: { action: RevisionAction; label: string }[] = [
    { action: "flashcards", label: "🎴 Flashcards" },
    { action: "quiz",       label: "❓ Quiz" },
    { action: "mcqs",       label: "☑️ MCQs" },
    { action: "revision",   label: "📚 Revision" },
  ];

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
          <div key={h.id} style={{ background: "#0f172a", borderRadius: 14, padding: 10 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
              <span style={{
                width: 12, height: 12, borderRadius: "50%", flexShrink: 0, marginTop: 3,
                background: HIGHLIGHT_COLOR_HEX[h.color].fill,
                border: `2px solid ${HIGHLIGHT_COLOR_HEX[h.color].border}`,
              }} />
              <button
                onClick={() => onJumpToPage(h.page, h.id)}
                style={{ flex: 1, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
                <p style={{ fontSize: 12, color: "#e2e8f0", lineHeight: 1.5 }}>
                  “{h.selectedText.slice(0, 110)}{h.selectedText.length > 110 ? "…" : ""}”
                </p>
                <p style={{ fontSize: 10, color: "#64748b", marginTop: 4, fontWeight: 700 }}>Page {h.page} · tap to jump</p>
              </button>
              <button onClick={() => onDeleteHighlight(h.id)}
                style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 13, flexShrink: 0 }}>
                🗑️
              </button>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
              {REVISION_ACTIONS.map(({ action, label }) => (
                <button
                  key={action}
                  disabled={generatingId === h.id}
                  onClick={() => onGenerateFromHighlight(h, action)}
                  style={{
                    background: "#1e293b", color: "#cbd5e1", border: "none",
                    borderRadius: 8, padding: "4px 8px", fontSize: 10, fontWeight: 700,
                    cursor: generatingId === h.id ? "default" : "pointer",
                    opacity: generatingId === h.id ? 0.5 : 1,
                  }}
                >
                  {generatingId === h.id ? "…" : label}
                </button>
              ))}
            </div>
          </div>
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
                Page {n.page} · tap to jump{n.aiImproved ? " · ✨ AI-improved" : ""}
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
                🔖 {b.title?.trim() ? b.title : `Page ${b.page}`}
              </p>
              <p style={{ fontSize: 10, color: "#64748b", marginTop: 2, fontWeight: 700 }}>Page {b.page} · tap to jump</p>
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
