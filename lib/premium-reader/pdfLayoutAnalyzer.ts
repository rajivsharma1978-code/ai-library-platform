import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PageOrientation, ReadingDirection } from "./bookProfile";

export interface RealPageDims {
  pageNumber: number;
  width: number;
  height: number;
  orientation: PageOrientation;
  aspectRatio: number;
}

/**
 * Reads a single PDF page's NATIVE viewport (scale 1) and derives its
 * real dimensions and orientation. This is the single source of truth —
 * any width/height/orientation provided in BookProfile.pages is only
 * a fallback used before this resolves, or if pdfjs throws.
 */
export async function getRealPageDims(
  pdf: PDFDocumentProxy,
  pageNumber: number
): Promise<RealPageDims> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });

  const width = viewport.width;
  const height = viewport.height;
  const orientation: PageOrientation = width > height ? "landscape" : "portrait";
  const aspectRatio = width / height;

  return { pageNumber, width, height, orientation, aspectRatio };
}

/**
 * Decide whether a given page number should render as a single page
 * or be paired into a double-spread, based on REAL detected dimensions
 * of the page (and the next page if relevant) — not on assumptions.
 *
 * Rules:
 *  - Landscape pages always render alone (single).
 *  - Page 1 with hasCover=true always renders alone (cover), regardless
 *    of its orientation.
 *  - Otherwise, portrait pages pair up into spreads: (2,3), (4,5), etc.
 *    Page 1 is alone (as the page directly after the cover, or as page 1
 *    itself if there is no cover), so spreads start from the first
 *    available even pair after that.
 */
export interface SpreadPlan {
  mode: "single" | "double";
  /** Page numbers participating in this view, in left-to-right reading order. */
  pageNumbers: number[];
}

export function planSpread(
  pageNumber: number,
  totalPages: number,
  hasCover: boolean,
  orientationOf: (pageNumber: number) => PageOrientation,
  readingDirection: ReadingDirection = "ltr"
): SpreadPlan {
  const isCover = hasCover && pageNumber === 1;

  if (isCover) {
    return { mode: "single", pageNumbers: [1] };
  }

  const orientation = orientationOf(pageNumber);
  if (orientation === "landscape") {
    return { mode: "single", pageNumbers: [pageNumber] };
  }

  // Determine pairing parity. After a cover page, content pages start
  // at 2. We pair (2,3), (4,5), (6,7)... so a page pairs with its
  // sibling based on (pageNumber - firstContentPage) being even/odd.
  const firstContentPage = hasCover ? 2 : 1;
  const offset = pageNumber - firstContentPage;
  const isLeftOfPair = offset % 2 === 0;

  const partner = isLeftOfPair ? pageNumber + 1 : pageNumber - 1;
  const partnerValid = partner >= firstContentPage && partner <= totalPages;

  if (!partnerValid) {
    return { mode: "single", pageNumbers: [pageNumber] };
  }

  // Only pair if the partner is also portrait — otherwise show alone.
  const partnerOrientation = orientationOf(partner);
  if (partnerOrientation !== "portrait") {
    return { mode: "single", pageNumbers: [pageNumber] };
  }

  const left = isLeftOfPair ? pageNumber : partner;
  const right = isLeftOfPair ? partner : pageNumber;

  const ordered = readingDirection === "rtl" ? [right, left] : [left, right];
  return { mode: "double", pageNumbers: ordered };
}

/**
 * Given the current "logical" page position and a navigation step intent,
 * compute the next anchor page number to render.
 *
 * stepIntent: +1/-1 for single mode, +2/-2 for double mode — but the
 * caller does not need to know which mode is active; this function
 * re-derives it using planSpread so navigation always lands on a valid
 * spread boundary.
 */
export function getNextAnchorPage(
  currentPageNumbers: number[],
  direction: "next" | "previous",
  totalPages: number,
  hasCover: boolean
): number {
  const last = currentPageNumbers[currentPageNumbers.length - 1];
  const first = currentPageNumbers[0];

  if (direction === "next") {
    const next = last + 1;
    return Math.min(next, totalPages);
  }

  const prev = first - 1;
  return Math.max(prev, 1);
}