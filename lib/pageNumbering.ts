// ── Page-number mapping model ───────────────────────────────────────────
// A PDF's page index (1-based, always what pdf.js/PdfBookSpread render and
// navigate by) is frequently NOT the same number printed on the page —
// covers, title pages, tables of contents, and prefaces all consume PDF
// pages before printed numbering ("1", "2", ...) actually begins. This
// module is the ONE place that maps between the two:
//
//   pdfPage  — the real PDF page index. Stable, always exists, always
//              1-based. Every internal system (rendering, navigation,
//              highlights/notes/bookmarks storage) keys off this and
//              ONLY this — it never changes based on book metadata.
//   bookPage — the printed page number visible on the physical page, if
//              any. May be null (front matter has no printed number).
//              Only ever used for DISPLAY and as the default meaning of
//              user-facing page input (Go to Page, voice commands).
//
// No OCR — mapping is explicit metadata (offset or, for irregular books, a
// literal per-page map), attached to a book via DirectorBook.pageNumbering
// / AdminBookOverride.pageNumbering. Absent entirely on a book, every
// function below degrades to treating bookPage === pdfPage (today's
// behavior, unchanged) — so books with no metadata are never affected.

export type PageNumberingConfig = {
  /** "offset": a single linear offset — printed numbering starts at
   *  startPdfPage and counts up from startBookPage. Covers the vast
   *  majority of real books (cover/title/contents/preface, then plain
   *  sequential numbering) with two numbers.
   *  "map": an explicit pdfPage -> bookPage table (pageMap) for books
   *  whose printed numbering isn't a simple linear run (e.g. roman-
   *  numeral front matter mixed with arabic body numbering, inserts,
   *  renumbered sections). Not used by the demo catalog yet, but
   *  supported so admin/config data can express it later without this
   *  module's shape changing. */
  type: "offset" | "map";
  /** offset: the PDF page (1-based) where printed numbering begins. */
  startPdfPage?: number;
  /** offset: the printed number that appears on startPdfPage (usually 1). */
  startBookPage?: number;
  /** map: explicit pdfPage -> printed bookPage for irregular numbering. */
  pageMap?: Record<number, number>;
  /** Front-matter / special-page labels, keyed by pdfPage — shown INSTEAD
   *  of a printed number for pages that don't have one (e.g. {1: "Cover",
   *  2: "Title Page", 3: "Contents"}). Works with either type. */
  labels?: Record<number, string>;
};

/** pdfPage -> printed book page, or null if this PDF page has no printed
 *  number (front matter) or falls outside a "map" config's table. Returns
 *  the pdfPage itself, unchanged, when no config is given at all — the
 *  book has no page-numbering concept, so bookPage === pdfPage by
 *  definition (today's behavior). */
export function pdfPageToBookPage(pdfPage: number, config?: PageNumberingConfig | null): number | null {
  if (!config) return pdfPage;
  if (config.type === "map") {
    return config.pageMap?.[pdfPage] ?? null;
  }
  const startPdf = config.startPdfPage ?? 1;
  const startBook = config.startBookPage ?? 1;
  if (pdfPage < startPdf) return null;
  return startBook + (pdfPage - startPdf);
}

/** Inverse of pdfPageToBookPage — printed book page -> pdfPage, or null if
 *  that printed page number doesn't exist in this book's mapping. Same
 *  identity fallback when no config is given. */
export function bookPageToPdfPage(bookPage: number, config?: PageNumberingConfig | null): number | null {
  if (!config) return bookPage;
  if (config.type === "map") {
    for (const key of Object.keys(config.pageMap ?? {})) {
      if (config.pageMap![Number(key)] === bookPage) return Number(key);
    }
    return null;
  }
  const startPdf = config.startPdfPage ?? 1;
  const startBook = config.startBookPage ?? 1;
  const pdfPage = startPdf + (bookPage - startBook);
  return pdfPage >= startPdf ? pdfPage : null;
}

/** Human-facing label for a given PDF page:
 *   - an explicit front-matter label ("Cover", "Title Page", ...) if set
 *   - "Book page N" if it maps to a printed number
 *   - "Front matter" if it's before printed numbering starts with no
 *     explicit label
 *   - null if this book has no pageNumbering config at all — caller
 *     should just show the plain PDF page number, unchanged from before
 *     this feature existed. */
export function getBookPageLabel(pdfPage: number, config?: PageNumberingConfig | null): string | null {
  if (!config) return null;
  const explicit = config.labels?.[pdfPage];
  if (explicit) return explicit;
  const bookPage = pdfPageToBookPage(pdfPage, config);
  return bookPage !== null ? `Book page ${bookPage}` : "Front matter";
}

/** Structured display info for a single PDF page — what the reader header
 *  / study lists need to render "Book page 6 · PDF 12 of 32" (or, for a
 *  book with no mapping, just fall back to the plain PDF page). */
export type PageDisplay = {
  bookLabel: string | null;
  isFrontMatter: boolean;
  pdfPage: number;
  total: number;
};
export function getPageDisplay(pdfPage: number, total: number, config?: PageNumberingConfig | null): PageDisplay {
  const bookLabel = getBookPageLabel(pdfPage, config);
  const isFrontMatter = !!config && pdfPageToBookPage(pdfPage, config) === null;
  return { bookLabel, isFrontMatter, pdfPage, total };
}

/** The phrase used inside AI prompts/content so the model always knows
 *  the difference and is never told the wrong number:
 *    "printed book page 10 (PDF page 16)"
 *    "Cover (PDF page 1)"
 *    "PDF page 16 (front matter, no printed page number)"
 *    "page 16"                                    — no config at all */
export function describePageForAI(pdfPage: number, config?: PageNumberingConfig | null): string {
  if (!config) return `page ${pdfPage}`;
  const explicit = config.labels?.[pdfPage];
  if (explicit) return `${explicit} (PDF page ${pdfPage})`;
  const bookPage = pdfPageToBookPage(pdfPage, config);
  if (bookPage !== null) return `printed book page ${bookPage} (PDF page ${pdfPage})`;
  return `PDF page ${pdfPage} (front matter, no printed page number)`;
}

/** Resolves a user-typed/spoken page number to an actual pdfPage to
 *  navigate to. Input is treated as a PRINTED book page by default (the
 *  required behavior for Go to Page and voice "go to page N"):
 *   - no config at all -> input IS the pdfPage (unchanged legacy
 *     behavior; usedFallback is false — there is nothing to fall back
 *     from, this book simply has no book/pdf distinction).
 *   - config exists and the book page resolves -> that pdfPage,
 *     usedFallback false.
 *   - config exists but the requested book page doesn't resolve (out of
 *     range, or lands in front matter with no printed number) -> the raw
 *     input is used AS a pdfPage instead, usedFallback true, so the
 *     caller can tell the user their input was reinterpreted. */
export function resolveBookPageInput(
  input: number,
  config: PageNumberingConfig | null | undefined,
  totalPdfPages: number
): { pdfPage: number; usedFallback: boolean } {
  const clamp = (n: number) => Math.min(Math.max(1, n), Math.max(1, totalPdfPages));
  if (!config) return { pdfPage: clamp(input), usedFallback: false };
  const mapped = bookPageToPdfPage(input, config);
  if (mapped !== null && mapped >= 1 && mapped <= totalPdfPages) {
    return { pdfPage: mapped, usedFallback: false };
  }
  return { pdfPage: clamp(input), usedFallback: true };
}
