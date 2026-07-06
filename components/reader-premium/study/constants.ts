import { HighlightColor } from "./types";

// ── Highlight color swatches ────────────────────────────────────────────
export const HIGHLIGHT_COLOR_HEX: Record<HighlightColor, { fill: string; border: string; label: string }> = {
  yellow: { fill: "rgba(250,204,21,0.45)",  border: "rgba(202,138,4,0.9)",  label: "🟡 Yellow" },
  green:  { fill: "rgba(74,222,128,0.40)",  border: "rgba(21,128,61,0.9)",  label: "🟢 Green" },
  blue:   { fill: "rgba(96,165,250,0.40)",  border: "rgba(29,78,216,0.9)",  label: "🔵 Blue" },
  pink:   { fill: "rgba(244,114,182,0.40)", border: "rgba(190,24,93,0.9)",  label: "🩷 Pink" },
};

// ── localStorage keys ────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  highlights: "ndl_highlights",
  notes: "ndl_notes",
  bookmarks: "ndl_bookmarks",
} as const;