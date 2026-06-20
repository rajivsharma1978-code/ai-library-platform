export type PageOrientation = "portrait" | "landscape";

export type LayoutType =
  | "cover"
  | "double-spread-left"
  | "double-spread-right"
  | "single";

export type ReadingDirection = "ltr" | "rtl";

export type PreferredView = "auto" | "single" | "double";

export interface BookPageMeta {
  pageNumber: number;
  /** Fallback width in points. Real viewport from pdfjs always takes priority. */
  width?: number;
  /** Fallback height in points. Real viewport from pdfjs always takes priority. */
  height?: number;
  orientation?: PageOrientation;
  layoutType?: LayoutType;
  aspectRatio?: number;
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
  /** Optional metadata only — used as a fallback before real PDF viewport is known. */
  pages?: BookPageMeta[];
}

/**
 * Returns metadata for a given page number if present in the profile.
 * This is a FALLBACK ONLY. Real rendering always re-derives orientation
 * and dimensions from the actual pdfjs viewport once the page loads
 * (see pdfLayoutAnalyzer.ts). Nothing here should be trusted for layout
 * decisions once real data is available.
 */
export function getPageMeta(
  profile: BookProfile,
  pageNumber: number
): BookPageMeta | undefined {
  return profile.pages?.find((p) => p.pageNumber === pageNumber);
}

export function isCoverPage(profile: BookProfile, pageNumber: number): boolean {
  if (!profile.hasCover) return false;
  return pageNumber === 1;
}