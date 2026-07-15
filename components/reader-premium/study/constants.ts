import { HighlightColor } from "./types";

// ── Highlight color swatches ────────────────────────────────────────────
// `label` is resolved from UI_TEXT inside HighlightColorPicker (the only
// consumer of it) — this map now only holds language-independent hex values.
export const HIGHLIGHT_COLOR_HEX: Record<HighlightColor, { fill: string; border: string }> = {
  yellow: { fill: "rgba(255,230,80,0.45)",  border: "rgba(202,138,4,0.9)" },
  green:  { fill: "rgba(120,255,120,0.40)", border: "rgba(21,128,61,0.9)" },
  blue:   { fill: "rgba(100,180,255,0.40)", border: "rgba(29,78,216,0.9)" },
  pink:   { fill: "rgba(255,150,220,0.35)", border: "rgba(190,24,93,0.9)" },
};

// ── localStorage keys ────────────────────────────────────────────────────
export const STORAGE_KEYS = {
  highlights: "ndl_highlights",
  notes: "ndl_notes",
  bookmarks: "ndl_bookmarks",
} as const;