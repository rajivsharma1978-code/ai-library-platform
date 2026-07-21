// ── Canonical two-page-spread pairing/navigation ────────────────────────
// The ONE place that turns a book's `layout: "spread"` field (see
// DirectorBook in lib/directorBooks.ts) plus a "current page" cursor into
// left/right PDF pages, and decides how that cursor moves. Both readers —
// Premium Reader (components/reader-premium/PremiumReaderPreviewContent.tsx)
// and the Normal Reader (app/read/page.tsx) — call these same functions
// instead of each re-deriving the pairing math independently, so a given
// book behaves identically regardless of which reader opens it.
//
// Convention (matches PdfBookSpread's existing render-side math exactly):
// the "current page" cursor always holds the LEFT page of a spread. Page 1
// is always shown alone (the cover), even for a "spread" book; spreads
// start at PDF page 2 and pair (2,3), (4,5), (6,7)...
//
// "single" layout books (Nalanda, Chandrayaan-3) never pair pages here —
// their PDFs are pre-scanned two-up spread images, one PDF page already IS
// a full spread, so every function below is a plain single-page identity
// for them.

export type ReaderLayout = "single" | "spread" | undefined;

/** True if `page` should render as a two-page spread (left+right) rather
 *  than a single page. */
export function isSpreadPage(page: number, layout: ReaderLayout): boolean {
  return layout === "spread" && page > 1;
}

/** The right-hand PDF page for a spread, or null when this page isn't a
 *  spread (single layout, or the solo cover page). */
export function getSpreadRightPage(page: number, layout: ReaderLayout): number | null {
  return isSpreadPage(page, layout) ? page + 1 : null;
}

/** Snaps an already-clamped page number onto a valid spread cursor — for
 *  "spread" books every cursor past the cover must be the LEFT (even)
 *  page of its pair; a value landing on the right-hand page steps back
 *  one. No-op for "single" books or the solo cover page. Used for direct
 *  links (?page=), Go to Page, and jump-to-highlight targets. */
export function snapSpreadCursor(page: number, layout: ReaderLayout): number {
  return layout === "spread" && page > 1 ? (page % 2 === 0 ? page : page - 1) : page;
}

/** Next cursor for the "next page/spread" control. Returns `page`
 *  unchanged when already at the end (caller decides whether that means a
 *  disabled button). */
export function getNextSpreadCursor(page: number, totalPages: number, layout: ReaderLayout): number {
  if (layout !== "spread") return Math.min(totalPages, page + 1);
  if (page === 1) return totalPages >= 2 ? 2 : page;
  const next = page + 2;
  return next <= totalPages ? next : page;
}

/** Previous cursor for the "previous page/spread" control. */
export function getPrevSpreadCursor(page: number, layout: ReaderLayout): number {
  if (layout !== "spread") return Math.max(1, page - 1);
  if (page <= 2) return 1;
  return Math.max(1, page - 2);
}
