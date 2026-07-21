// ── PDF layout auto-detection ────────────────────────────────────────
// Decides whether an uploaded PDF's pages should render as "single" (one
// PDF page is already a complete render unit — a pre-scanned two-up
// spread image, Nalanda/Chandrayaan-3's pattern) or "spread" (the reader
// must pair two SEPARATE adjacent PDF pages — an ordinary single-page-
// per-side document, e.g. a typical report or textbook). Same two
// values, same meaning as DirectorBook.layout in lib/directorBooks.ts —
// see lib/spreadNavigation.ts for how both readers consume it.
//
// Detection rule: a genuine two-up scanned spread page is wider than it
// is tall (landscape); an ordinary single printed page is taller than it
// is wide (portrait) or square. That physical aspect ratio is the whole
// signal — no OCR, no content inspection, nothing async beyond the one
// getPage(1) call already needed for page count.

export type PdfLayout = "single" | "spread";

/** `doc` is a pdfjs-dist PDFDocumentProxy (already loaded via
 *  getDocument().promise). Never throws — falls back to "spread", the
 *  safe default for an ordinary uploaded document, if page 1 can't be
 *  inspected for any reason. */
export async function detectPdfLayout(doc: any): Promise<PdfLayout> {
  try {
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    return viewport.width > viewport.height ? "single" : "spread";
  } catch {
    return "spread";
  }
}
