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
    // The book's own real cover — page 1 of nalanda.pdf, extracted once
    // via scripts/extract-covers.mjs and stored permanently here instead
    // of ever being re-rendered live in the browser (that path reliably
    // timed out on Home, since all three discovery rails render this
    // book at once and the 26MB PDF's first-page render couldn't finish
    // inside BookCover's 8s budget for all three simultaneously). Page 1
    // is actually the full front+spine+back wrap, so the extraction
    // script crops to just the front-cover portion.
    cover: "/book-covers/nalanda.jpg",
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
    // The book's own real cover — page 1 of chandrayaan-3.pdf, extracted
    // once via scripts/extract-covers.mjs. (A hand-illustrated SVG stood
    // in here for a while during earlier iteration; replaced with the
    // book's actual artwork now that extraction is reliable.)
    cover: "/book-covers/chandrayaan.jpg",
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
    // Replaces the earlier "quantum" (Introduction to Classical and
    // Quantum Computing) entry — see git history for that book's data
    // if it's ever needed again. quantum-computing.pdf itself is left
    // on disk: app/reader-premium-v2/page.tsx (a separate experimental
    // reader route, not part of the public catalogue) still references
    // it directly.
    id: "artificial-intelligence-technology",
    title: "Artificial Intelligence Technology",
    author: "Huawei Technologies Co., Ltd.",
    description:
      "An official Huawei ICT Academy textbook covering the foundations of artificial intelligence — machine learning, neural networks, and real-world AI applications — alongside Huawei's own AI development platforms and tools.",
    language: "English",
    // The book's own real cover — page 1 of
    // artificial-intelligence-technology.pdf, extracted once via
    // scripts/extract-covers.mjs. Verified against the PDF: a complete,
    // clean published cover with no scanner margins, nothing cropped.
    cover: "/book-covers/artificial-intelligence-technology.jpg",
    pdf: "/director-books/artificial-intelligence-technology.pdf",
    pages: 308,
    // "spread", not "single" — those two values don't mean "one page vs
    // two pages on screen," they mean "does the reader need to pair PDF
    // pages itself." Nalanda/Chandrayaan-3 are "single" because their
    // PDFs are pre-scanned: one PDF page already IS a two-page spread
    // image, so the reader just shows it as-is (and it happens to look
    // like two pages because that's what's baked into the scan). This
    // book's PDF is the opposite — verified via inspection that page 1
    // is one genuine single portrait page (aspect ratio 0.66), the same
    // structure the old Quantum entry had — so it needs the reader to
    // pair two SEPARATE adjacent PDF pages into one view, which is
    // exactly what "spread" does.
    layout: "spread",
    category: "Artificial Intelligence",
    // No pageNumbering config — verified via the PDF's own text layer
    // (pages 1, 50, 150, 250, 308 all carry real selectable text; page 1
    // is the actual cover), but the printed-page-vs-PDF-page offset
    // wasn't independently established the way Quantum's was. Absent
    // here just means the reader falls back to today's default (PDF
    // page number shown as-is) — same safe default every other book
    // without this field already uses.
  },
];