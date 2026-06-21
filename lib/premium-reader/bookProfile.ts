export type PageOrientation = "portrait" | "landscape";

export type PageRole = "cover" | "front-matter" | "content";

export type ReadingDirection = "ltr" | "rtl";

export type PreferredView = "auto" | "single" | "double";

/**
 * Determines how PDF pages map to on-screen pages:
 *
 *  - "single-pages": one PDF page = one printed book page. Two
 *    consecutive PDF pages may be paired side-by-side into a visual
 *    spread (the original architecture).
 *
 *  - "prebuilt-spreads": each PDF page is ALREADY a complete spread
 *    (or a complete standalone page) as authored — e.g. a single PDF
 *    page contains both printed page 02 and 03 side by side. In this
 *    mode, NO pairing ever happens: one PDF page is always shown
 *    alone, full width, exactly as designed in the source file.
 *
 * Defaults to "single-pages" for backward compatibility with books
 * that don't set this field.
 */
export type PdfPageMode = "single-pages" | "prebuilt-spreads";

export interface PageMapEntry {
  pdfPage: number;
  /** Printed label visible on the page itself, e.g. "02–03", "Cover". */
  printedPageLabel?: string;
  /** Detected via OCR/heuristic in future — separate from manual label. */
  detectedPrintedNumber?: string;
  role?: PageRole;
}

export interface BookProfile {
  bookId: string;
  title: string;
  pdfPath: string;
  totalPages: number;
  readingDirection: ReadingDirection;
  hasCover: boolean;
  preferredView: PreferredView;
  version: string;
  createdAt: string;

  /**
   * How PDF pages map to on-screen pages. See PdfPageMode above.
   * Defaults to "single-pages" if omitted.
   */
  pdfPageMode?: PdfPageMode;

  /**
   * Only meaningful when pdfPageMode is "single-pages" (or omitted).
   * Number of pages at the START of the book that are always shown
   * standalone (never paired into a spread) — typically the cover,
   * credits page, and title page. Ignored entirely in
   * "prebuilt-spreads" mode, since nothing is ever paired in that mode.
   */
  frontMatterPages?: number;

  /**
   * Optional explicit per-page metadata/override, used in BOTH modes
   * for display labels (e.g. "02–03", "Cover", "Credits") and role
   * tagging. Pages not listed fall back to automatic detection or a
   * raw PDF page number.
   */
  pageMap?: PageMapEntry[];
}

export function getPageMapEntry(
  profile: BookProfile,
  pageNumber: number
): PageMapEntry | undefined {
  return profile.pageMap?.find((p) => p.pdfPage === pageNumber);
}

export function getExplicitPageRole(
  profile: BookProfile,
  pageNumber: number
): PageRole | undefined {
  return getPageMapEntry(profile, pageNumber)?.role;
}

/**
 * Returns the best available display label for a PDF page: explicit
 * printedPageLabel from pageMap, then detectedPrintedNumber, then
 * falls back to the raw PDF page number as a string.
 */
export function getDisplayLabel(
  profile: BookProfile,
  pdfPageNumber: number
): string {
  const entry = getPageMapEntry(profile, pdfPageNumber);
  if (entry?.printedPageLabel) return entry.printedPageLabel;
  if (entry?.detectedPrintedNumber) return entry.detectedPrintedNumber;
  return String(pdfPageNumber);
}

export function getPdfPageMode(profile: BookProfile): PdfPageMode {
  return profile.pdfPageMode ?? "single-pages";
}