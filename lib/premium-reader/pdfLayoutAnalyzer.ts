import type { PDFDocumentProxy } from "pdfjs-dist";
import type { PageOrientation, ReadingDirection, BookProfile, PageRole } from "./bookProfile";
import { getExplicitPageRole, getPdfPageMode } from "./bookProfile";

export interface RealPageDims {
  pageNumber: number;
  width: number;
  height: number;
  orientation: PageOrientation;
  aspectRatio: number;
}

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
 * Only relevant in "single-pages" mode. Estimates how many pages at
 * the start of the book are standalone front matter before real
 * left-right pairing begins. Ignored entirely in "prebuilt-spreads"
 * mode, where nothing is ever paired.
 */
export function resolveFrontMatterCount(
  pageDims: Map<number, RealPageDims>,
  totalPages: number
): number {
  const MAX_SCAN = Math.min(6, totalPages);

  const first = pageDims.get(1);
  if (!first) return 1;

  let frontMatterCount = 1;

  for (let p = 2; p <= MAX_SCAN; p++) {
    const current = pageDims.get(p);
    const next = pageDims.get(p + 1);

    if (!current) break;

    if (!next) {
      frontMatterCount = p;
      continue;
    }

    if (current.orientation === next.orientation) {
      frontMatterCount = p - 1;
      break;
    }

    frontMatterCount = p;
  }

  return Math.max(1, frontMatterCount);
}

export function resolveFrontMatterPages(
  profile: BookProfile,
  pageDims: Map<number, RealPageDims>
): number {
  if (typeof profile.frontMatterPages === "number") {
    return Math.max(0, profile.frontMatterPages);
  }
  return resolveFrontMatterCount(pageDims, profile.totalPages);
}

export function resolvePageRole(
  profile: BookProfile,
  pageNumber: number,
  frontMatterPages: number
): PageRole {
  const explicit = getExplicitPageRole(profile, pageNumber);
  if (explicit) return explicit;

  // In prebuilt-spreads mode there is no pairing concept — every page
  // is simply "content" unless explicitly tagged otherwise in pageMap.
  if (getPdfPageMode(profile) === "prebuilt-spreads") {
    return pageNumber === 1 ? "cover" : "content";
  }

  if (pageNumber === 1) return "cover";
  if (pageNumber <= frontMatterPages) return "front-matter";
  return "content";
}

export interface SpreadPlan {
  mode: "single" | "double";
  pageNumbers: number[];
}

/**
 * Only used in "single-pages" mode. In "prebuilt-spreads" mode, every
 * page is always single (the PDF page itself IS the full spread), so
 * this function is never called for such books.
 */
export function planSpread(
  pageNumber: number,
  totalPages: number,
  frontMatterPages: number,
  orientationOf: (pageNumber: number) => PageOrientation,
  readingDirection: ReadingDirection = "ltr"
): SpreadPlan {
  if (pageNumber <= frontMatterPages) {
    return { mode: "single", pageNumbers: [pageNumber] };
  }

  const orientation = orientationOf(pageNumber);
  if (orientation === "landscape") {
    return { mode: "single", pageNumbers: [pageNumber] };
  }

  const firstContentPage = frontMatterPages + 1;
  const offset = pageNumber - firstContentPage;
  const isLeftOfPair = offset % 2 === 0;

  const partner = isLeftOfPair ? pageNumber + 1 : pageNumber - 1;
  const partnerValid = partner >= firstContentPage && partner <= totalPages;

  if (!partnerValid) {
    return { mode: "single", pageNumbers: [pageNumber] };
  }

  const partnerOrientation = orientationOf(partner);
  if (partnerOrientation !== "portrait") {
    return { mode: "single", pageNumbers: [pageNumber] };
  }

  const left = isLeftOfPair ? pageNumber : partner;
  const right = isLeftOfPair ? partner : pageNumber;

  const ordered = readingDirection === "rtl" ? [right, left] : [left, right];
  return { mode: "double", pageNumbers: ordered };
}

export async function detectPrintedPageLabel(
  pdf: PDFDocumentProxy,
  pdfPage: number
): Promise<string | null> {
  // Phase 2: OCR-based detection of the printed page number circle.
  // Not implemented for the current demo scope — pageMap metadata is
  // used instead. Always returns null; callers must treat this as
  // "unknown" and fall back to pageMap or the raw PDF page number.
  return null;
}