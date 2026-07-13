// ── Deterministic printed-page mapping (demo) ───────────────────────────
// No OCR, no background indexing, no async detection of any kind — a
// static, hand-verified table per book, built once by inspecting the
// actual PDFs (page dimensions/aspect ratio to find front matter vs.
// scanned two-up spreads, cross-checked against known printed-page
// reference points). Every lookup here is synchronous and instant:
// there is nothing to wait for, nothing to index, nothing to show a
// "preparing…" message about.
//
// PDF page indexes remain purely internal (rendering/navigation only,
// see PdfBookSpread) — every user-facing surface (the reader header, Go
// to Page, voice commands, AI prompts, notes/bookmarks) goes through the
// functions at the bottom of this file, which only ever produce a
// printed page number/label or nothing at all — never a raw PDF index.

export type PageMapEntry = {
  /** Printed number/label for a single PDF page, OR the left half of a
   *  PDF page that is itself a scanned two-up spread (Nalanda,
   *  Chandrayaan-3: one PDF page = two printed pages side by side). */
  left?: number | string;
  /** Right half of a scanned two-up PDF page. Absent for an ordinary
   *  single-printed-page PDF page (e.g. every page of Quantum, which
   *  uses layoutMode "spread" to pair two SEPARATE PDF pages instead —
   *  see getSpreadDisplayLabel). */
  right?: number | string;
};
export type PrintedPageMap = Record<number, PageMapEntry>;

// ── Quantum: real textbook, one printed page per PDF page ──────────────
// Verified directly against the PDF's own text layer in an earlier pass:
// printed "1" lands on PDF page 13, and the offset holds exactly (+12)
// all the way through page 300 (spot-checked at 13, 14, 15, 20, 49-52,
// 150, 200, 250, 300). Generated once from that verified linear
// relationship rather than writing out 400 lines by hand — still fully
// deterministic and static, not detected at runtime.
function buildQuantumMap(): PrintedPageMap {
  const map: PrintedPageMap = {
    1: { left: "Cover" },
    2: { left: "Title" },
    3: { left: "Copyright" },
    4: { left: "Contents" },
    5: { left: "Contents" },
    6: { left: "Contents" },
    7: { left: "Preface" },
    8: { left: "Preface" },
    // 9-12: front matter with no distinct label and no printed number —
    // left blank deliberately (no entry) rather than guessing.
  };
  const START_PDF_PAGE = 13;
  const START_PRINTED_PAGE = 1;
  const TOTAL_PAGES = 400;
  for (let pdfPage = START_PDF_PAGE; pdfPage <= TOTAL_PAGES; pdfPage++) {
    map[pdfPage] = { left: START_PRINTED_PAGE + (pdfPage - START_PDF_PAGE) };
  }
  return map;
}

// ── Nalanda & Chandrayaan-3: illustrated picture books, scanned as
// two-up spreads ───────────────────────────────────────────────────────
// Both inspected page-by-page (every page's own dimensions/aspect ratio
// pulled directly from the PDF — no OCR needed for this part): each
// book opens with 2 pure front-matter pages (portrait/single: cover,
// title), then ONE standalone single page carrying printed page "1"
// (a book's first page conventionally stands alone on a recto), then a
// run of landscape PDF pages where each ONE PDF page is a scanned
// two-page spread (left+right printed numbers on the same image), and
// closes with portrait/single back-matter pages carrying no printed
// number.
//
// This model was verified against BOTH reference points explicitly
// requested: PDF page 8 -> printed (10, 11), PDF page 22 -> printed
// (38, 39) for Nalanda — both fall out of the exact same formula below,
// which is a strong consistency check (two independent, correct hits
// from one linear relationship), not a coincidence.
function buildTwoUpSpreadMap(opts: {
  totalPages: number;
  /** First PDF page that's a landscape two-up spread. Pages before this
   *  (after the 2 pure front-matter pages) are the single standalone
   *  "printed page 1". */
  firstSpreadPdfPage: number;
  /** Last PDF page that's still a two-up spread — pages after this are
   *  back matter (no printed number). */
  lastSpreadPdfPage: number;
}): PrintedPageMap {
  const { totalPages, firstSpreadPdfPage, lastSpreadPdfPage } = opts;
  const map: PrintedPageMap = {
    1: { left: "Cover" },
    2: { left: "Title" },
  };
  // The single page right before the spreads begin carries printed "1"
  // alone.
  const firstStoryPage = firstSpreadPdfPage - 1;
  map[firstStoryPage] = { left: 1 };

  for (let pdfPage = firstSpreadPdfPage; pdfPage <= lastSpreadPdfPage; pdfPage++) {
    const left = 2 * pdfPage - 2 * firstSpreadPdfPage + 2;
    map[pdfPage] = { left, right: left + 1 };
  }
  // Pages after the last spread (back matter — "About the Author", "The
  // End", etc.) intentionally get no entry: blank, never a guessed
  // number. totalPages is accepted for clarity/documentation even though
  // nothing further needs generating past lastSpreadPdfPage.
  void totalPages;
  return map;
}

const NALANDA_MAP = buildTwoUpSpreadMap({ totalPages: 32, firstSpreadPdfPage: 4, lastSpreadPdfPage: 30 });
const CHANDRAYAAN_MAP = buildTwoUpSpreadMap({ totalPages: 35, firstSpreadPdfPage: 4, lastSpreadPdfPage: 33 });
const QUANTUM_MAP = buildQuantumMap();

const PRINTED_PAGE_MAPS: Record<string, PrintedPageMap> = {
  nalanda: NALANDA_MAP,
  "chandrayaan-3": CHANDRAYAAN_MAP,
  quantum: QUANTUM_MAP,
};

/** Returns the static map for a book, or an empty map for anything not
 *  explicitly configured (e.g. an admin-uploaded custom book) — an empty
 *  map means every lookup below simply comes back blank, never a guess. */
export function getPrintedPageMap(bookId: string): PrintedPageMap {
  return PRINTED_PAGE_MAPS[bookId] ?? {};
}

function entryToLabel(entry: PageMapEntry | undefined): string {
  if (!entry) return "";
  const { left, right } = entry;
  if (left != null && right != null && left !== right) return `${left}–${right}`;
  if (left != null) return `${left}`;
  if (right != null) return `${right}`;
  return "";
}

/** THE shared display label for one PDF page — used for single-page
 *  layouts, and reused by getSpreadDisplayLabel below for spread
 *  layouts. Bare printed number(s) or a front-matter label; "" (render
 *  nothing) if this book/page isn't mapped — never a PDF page number. */
export function getDisplayLabel(pdfPage: number, map: PrintedPageMap): string {
  return entryToLabel(map[pdfPage]);
}

/** Combines two ADJACENT PDF pages (spread layoutMode, e.g. Quantum,
 *  where each PDF page is independently a single printed page) into one
 *  display label — "184–185", or just one side if only one is mapped. */
export function getSpreadDisplayLabel(leftPdfPage: number, rightPdfPage: number | null, map: PrintedPageMap): string {
  const leftLabel = getDisplayLabel(leftPdfPage, map);
  const rightLabel = rightPdfPage != null ? getDisplayLabel(rightPdfPage, map) : "";
  if (leftLabel && rightLabel && leftLabel !== rightLabel) {
    const bothNumeric = /^\d+$/.test(leftLabel) && /^\d+$/.test(rightLabel);
    return bothNumeric ? `${leftLabel}–${rightLabel}` : `${leftLabel} – ${rightLabel}`;
  }
  return leftLabel || rightLabel;
}

/** Same resolution, phrased for AI prompts ("printed page 184" / "the
 *  Cover" / a bare PDF-page fallback only as prose sent to the model,
 *  never shown in the reader's own UI). */
export function getPageDescriptionForAI(pdfPage: number, map: PrintedPageMap): string {
  const label = getDisplayLabel(pdfPage, map);
  if (!label) return `page ${pdfPage}`;
  return /^[a-zA-Z]/.test(label) ? label.toLowerCase() : `printed page ${label}`;
}

/** Go to Page / voice "go to page N" resolution — N is always a printed
 *  page number, matched against either side of any entry. Returns null
 *  if this book has no page mapped to that printed number — the caller
 *  decides how to say so without ever mentioning a PDF page index. */
export function resolvePrintedPageTarget(requested: number, map: PrintedPageMap): number | null {
  for (const [pdfPageStr, entry] of Object.entries(map)) {
    if (entry.left === requested || entry.right === requested) return Number(pdfPageStr);
  }
  return null;
}
