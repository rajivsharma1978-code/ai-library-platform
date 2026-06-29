import PremiumReaderV2 from "@/components/reader-premium-v2/PremiumReaderV2";
import { BookProfile } from "@/lib/premium-reader/bookProfile";

const nalandaProfile: BookProfile = {
  bookId: "nalanda-demo",
  title: "Nalanda: The Untold Story",
  pdfPath: "/director-books/nalanda.pdf",

  // Each PDF page is already a complete spread (or standalone page)
  // as authored — never pair two PDF pages together.
  pdfPageMode: "prebuilt-spreads",
  totalPages: 32,

  readingDirection: "ltr",
  hasCover: true,
  preferredView: "auto",
  version: "premium-reader-v2",
  createdAt: new Date().toISOString(),

  // Display labels for the demo, matching the printed page-number
  // circles visible in the source PDF. This is plain metadata only —
  // no component contains Nalanda-specific logic. OCR-based automatic
  // detection of these circled numbers is Phase 2 (see
  // detectPrintedPageLabel in pdfLayoutAnalyzer.ts).
  pageMap: [
    { pdfPage: 1, printedPageLabel: "Cover", role: "cover" },
    { pdfPage: 2, printedPageLabel: "Credits" },
    { pdfPage: 3, printedPageLabel: "Title" },
    { pdfPage: 4, printedPageLabel: "02–03" },
    { pdfPage: 5, printedPageLabel: "04–05" },
    { pdfPage: 6, printedPageLabel: "06–07" },
    { pdfPage: 7, printedPageLabel: "08–09" },
    { pdfPage: 8, printedPageLabel: "10–11" },
    { pdfPage: 9, printedPageLabel: "12–13" },
    { pdfPage: 10, printedPageLabel: "14–15" },
    { pdfPage: 11, printedPageLabel: "16–17" },
    { pdfPage: 12, printedPageLabel: "18–19" },
    { pdfPage: 13, printedPageLabel: "20–21" },
    { pdfPage: 14, printedPageLabel: "22–23" },
    { pdfPage: 15, printedPageLabel: "24–25" },
    { pdfPage: 16, printedPageLabel: "26–27" },
    { pdfPage: 17, printedPageLabel: "28–29" },
    { pdfPage: 18, printedPageLabel: "30–31" },
    { pdfPage: 19, printedPageLabel: "32–33" },
    { pdfPage: 20, printedPageLabel: "34–35" },
    { pdfPage: 21, printedPageLabel: "36–37" },
    { pdfPage: 22, printedPageLabel: "38–39" },
    { pdfPage: 23, printedPageLabel: "40–41" },
    { pdfPage: 24, printedPageLabel: "42–43" },
    { pdfPage: 25, printedPageLabel: "44–45" },
    { pdfPage: 26, printedPageLabel: "46–47" },
    { pdfPage: 27, printedPageLabel: "48–49" },
    { pdfPage: 28, printedPageLabel: "50–51" },
    { pdfPage: 29, printedPageLabel: "52–53" },
    { pdfPage: 30, printedPageLabel: "About the Author" },
    { pdfPage: 31, printedPageLabel: "Fundamental Duties" },
    { pdfPage: 32, printedPageLabel: "" },
  ],
};

// New: a normal, sequential single-page PDF — NOT prebuilt-spreads.
// No pageMap is needed here; that field only exists to override
// printed-page-label metadata for Nalanda's specific print layout,
// and a plain textbook just uses its raw PDF page numbers as-is.
//
// pdfPageMode/preferredView are now set EXPLICITLY (confirmed values)
// rather than omitted — omitting pdfPageMode previously left it
// undefined, and getPdfPageMode() apparently treats an undefined/
// missing value as "prebuilt-spreads" by default, which is what was
// silently forcing this book into Nalanda's single-wide-page
// treatment (no middle-spine flip, wrong fullscreen sizing, etc.)
// despite FlipEngine.tsx's actual double-spread/pairing logic being
// completely unaffected and already correct for this case.
const quantumProfile: BookProfile = {
  bookId: "quantum-computing-demo",
  title: "Introduction to Classical and Quantum Computing",
  pdfPath: "/director-books/quantum-computing.pdf",

  pdfPageMode: "single-pages",
  preferredView: "double",
  totalPages: 400,

  readingDirection: "ltr",
  hasCover: true,
  version: "premium-reader-v2",
  createdAt: new Date().toISOString(),
};

const BOOK_PROFILES: Record<string, BookProfile> = {
  nalanda: nalandaProfile,
  quantum: quantumProfile,
};

export default async function ReaderPremiumV2Page({
  searchParams,
}: {
  // Next.js App Router passes searchParams as a Promise in newer
  // versions and a plain object in older ones — awaiting either works
  // (awaiting a non-Promise value just resolves immediately).
  searchParams: Promise<{ book?: string }> | { book?: string };
}) {
  const resolvedSearchParams = await searchParams;
  const requestedBook = resolvedSearchParams?.book;

  // Defaults to Nalanda for no query param, an unrecognized value, or
  // anything other than exactly "quantum" — matching "If no query
  // param, keep Nalanda default" literally rather than just "if
  // missing".
  const profile =
    requestedBook === "quantum" ? BOOK_PROFILES.quantum : BOOK_PROFILES.nalanda;

  return <PremiumReaderV2 profile={profile} />;
}
