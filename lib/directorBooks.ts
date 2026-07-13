import type { PageNumberingConfig } from "@/lib/pageNumbering";

export type DirectorBook = {
  id: string;
  title: string;
  author: string;
  description: string;
  language: string;
  cover: string;
  pdf: string;
  pages: number;
  /** 'single' = one page at a time.
   *  'spread' = show two pages side-by-side (page 1 is solo cover, then 2-3, 4-5...) */
  layout?: "single" | "spread";
  /** Same field/convention as AdminBookOverride.category (components/admin/adminData.ts)
   *  — the public catalog groups by this on /library. */
  category: string;
  /** Optional printed-page mapping (see lib/pageNumbering.ts). Absent on a
   *  book means "no mapping" — every reader falls back to today's
   *  behavior (PDF page IS the displayed page number), so adding this
   *  field never breaks a book that doesn't set it. */
  pageNumbering?: PageNumberingConfig;
};

export const directorBooks: DirectorBook[] = [
  {
    id: "nalanda",
    title: "Nalanda: The Untold Story",
    author: "Yuvraj Malik",
    description:
      "A richly illustrated story that brings the legacy of Nalanda to life for young readers through history, culture, imagination, and learning.",
    language: "English",
    // Same audit finding as Chandrayaan below: no static cover asset was
    // ever added for this book either — "" lets the PDF first-page
    // fallback take over immediately instead of a doomed 404 first.
    cover: "",
    pdf: "/director-books/nalanda.pdf",
    pages: 32,
    layout: "single",
    category: "History & Culture",
    // No numeric offset guess: this book mixes single portrait pages with
    // landscape two-up spreads (verified against the real PDF — pages
    // alternate aspect ratio, not a consistent single-page layout), so a
    // linear "PDF page N -> printed page N-2" formula would be wrong more
    // often than right. Real per-page detection (text layer / OCR
    // corners — lib/printedPageDetection.ts) is the only reliable source
    // for the actual printed number(s); this config supplies just the
    // front-matter labels detection can never produce on its own.
    pageNumbering: {
      type: "map",
      pageMap: {},
      labels: { 1: "Cover", 2: "Title Page" },
    },
  },
  {
    id: "chandrayaan-3",
    title: "Chandrayaan 3: Tiranga Flies on the Moon",
    author: "Yuvraj Malik",
    description:
      "An inspiring illustrated book on India's Chandrayaan 3 mission, space exploration, science, curiosity, and national achievement.",
    language: "English",
    // The original path here (chandrayaan-3-cover.jpg) never existed —
    // see the audit in this same commit. The PDF first-page fallback
    // tier was tried as the fix, but this book's cover page hangs
    // indefinitely in pdf.js's renderer regardless of timeout/font-data
    // fixes (root cause not fully isolated — see BookCover.tsx's
    // comment). A real designed cover (same approach already used for
    // "quantum" below) is the reliable fix: an actual asset that always
    // resolves, instead of depending on a renderer that doesn't.
    cover: "/director-books/chandrayaan-3-cover.svg",
    pdf: "/director-books/chandrayaan-3.pdf",
    pages: 35,
    layout: "single",
    category: "Space & Astronomy",
    // Same mixed single/two-up structure as Nalanda (verified against the
    // real PDF: pages 1-3 are portrait singles, page 4 onward switches to
    // landscape two-up spreads) — no numeric offset guess for the same
    // reason; real detection resolves the actual printed number(s).
    pageNumbering: {
      type: "map",
      pageMap: {},
      labels: { 1: "Cover", 2: "Title Page" },
    },
  },
  {
    id: "quantum",
    title: "Introduction to Classical and Quantum Computing",
    author: "Thomas G. Wong",
    description:
      "A comprehensive textbook introducing the mathematical foundations of both classical and quantum computing, written for students with a basic background in linear algebra.",
    language: "English",
    // Real cover asset (was pointing to a non-existent .jpg — the book's
    // PDF opens on a plain academic title page, so a designed SVG cover
    // was added instead of relying on the PDF-first-page fallback).
    cover: "/director-books/quantum-cover.svg",
    pdf: "/director-books/quantum-computing.pdf",
    pages: 400,
    layout: "spread",
    category: "Computing",
    // Fallback only now — real detection (lib/printedPageDetection.ts) is
    // primary. Verified against the actual PDF text layer: printed "1"
    // lands on PDF page 13, confirmed consistent (offset of exactly 12)
    // all the way through page 300. Front matter (cover through preface)
    // runs PDF pages 1-12.
    pageNumbering: {
      type: "offset",
      startPdfPage: 13,
      startBookPage: 1,
      labels: {
        1: "Cover", 2: "Title Page", 3: "Copyright",
        4: "Contents", 5: "Contents", 6: "Contents",
        7: "Preface", 8: "Preface",
      },
    },
  },
];