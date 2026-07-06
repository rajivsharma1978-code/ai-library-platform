// ── Phase 2 shared types ───────────────────────────────────────────────
// No logic here — just the shapes used across storage.ts, constants.ts,
// and every Study Workspace component.

export type HighlightColor = "yellow" | "green" | "blue" | "pink";

// Fractional (0..1) rectangle relative to the page canvas's own bounding
// box at the moment it was captured. Storing fractions (not absolute
// pixels) means the highlight/note indicator re-projects correctly at any
// zoom level or window size later — we just multiply by the CURRENT
// canvas rect when rendering, we never re-derive text positions.
export type RectPct = { left: number; top: number; width: number; height: number };

export interface StoredHighlight {
  id: string;
  bookId: string;
  page: number;
  selectedText: string;
  color: HighlightColor;
  createdAt: number;
  /** Internal — used only to re-draw the highlight in the right spot. */
  rectsPct: RectPct[];
}

export interface StoredNote {
  id: string;
  bookId: string;
  page: number;
  selectedText: string;
  note: string;
  createdAt: number;
  /** Internal — used only to place the small note indicator icon. */
  rectPct?: RectPct;
  /** Set true if the note text currently on file was produced by "Improve with AI". */
  aiImproved?: boolean;
}

export interface StoredBookmark {
  id: string;
  bookId: string;
  page: number;
  title?: string;
  createdAt: number;
}