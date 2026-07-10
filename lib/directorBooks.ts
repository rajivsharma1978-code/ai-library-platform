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
  },
];