import type { PDFDocumentProxy } from "pdfjs-dist";

export type PageTextSource = "selectable" | "ocr" | "none";

export interface PageTextResult {
  text: string;
  source: PageTextSource;
}

/**
 * Module-scoped caches keyed by `${pdfPath}::${pageNumber}` so results
 * survive component re-renders and the same page is never reprocessed
 * twice in a session.
 */
const selectableTextCache = new Map<string, string>();
const ocrTextCache = new Map<string, string>();
const ocrInFlight = new Map<string, Promise<string>>();

function cacheKey(pdfPath: string, pageNumber: number): string {
  return `${pdfPath}::${pageNumber}`;
}

/**
 * Extracts selectable text directly from the PDF page via pdf.js's
 * own text layer (page.getTextContent()). Fast, no rendering required.
 * Returns an empty string if the page has no selectable text at all
 * (e.g. a scanned image page) — callers should fall back to OCR.
 */
export async function getSelectableText(
  pdf: PDFDocumentProxy,
  pdfPath: string,
  pageNumber: number
): Promise<string> {
  const key = cacheKey(pdfPath, pageNumber);
  const cached = selectableTextCache.get(key);
  if (cached !== undefined) return cached;

  try {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    selectableTextCache.set(key, text);
    return text;
  } catch (err) {
    console.error(`[pageTextExtractor] getSelectableText failed on page ${pageNumber}:`, err);
    selectableTextCache.set(key, "");
    return "";
  }
}

/**
 * Renders the given PDF page to an offscreen canvas at a resolution
 * suited for OCR accuracy, then runs tesseract.js against it. Results
 * are cached per page; concurrent calls for the same page share a
 * single in-flight promise rather than starting OCR twice.
 *
 * Scoped to ONE page at a time — callers must only invoke this for
 * the currently visible page(s), never for the whole book.
 */
export async function getOcrText(
  pdf: PDFDocumentProxy,
  pdfPath: string,
  pageNumber: number
): Promise<string> {
  const key = cacheKey(pdfPath, pageNumber);

  const cached = ocrTextCache.get(key);
  if (cached !== undefined) return cached;

  const inFlight = ocrInFlight.get(key);
  if (inFlight) return inFlight;

  const promise = (async () => {
    try {
      const page = await pdf.getPage(pageNumber);

      const OCR_SCALE = 2.2;
      const viewport = page.getViewport({ scale: OCR_SCALE });

      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);

      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Could not get 2D context for OCR canvas");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvas, canvasContext: ctx, viewport }).promise;

      // Dynamically imported so tesseract.js is only pulled into the
      // bundle when OCR is actually needed, not on every page load.
      const Tesseract = await import("tesseract.js");
      const result = await Tesseract.recognize(canvas, "eng");

      const text = (result.data.text || "").replace(/\s+/g, " ").trim();
      ocrTextCache.set(key, text);
      return text;
    } catch (err) {
      console.error(`[pageTextExtractor] getOcrText failed on page ${pageNumber}:`, err);
      ocrTextCache.set(key, "");
      return "";
    } finally {
      ocrInFlight.delete(key);
    }
  })();

  ocrInFlight.set(key, promise);
  return promise;
}

/**
 * Resolves the best available text for a page:
 *  1. Selectable PDF text, if non-empty.
 *  2. OCR text, only if selectable text was empty.
 *  3. Empty string (caller decides the fallback message) if both are empty.
 *
 * This is the single entry point callers should use — it encapsulates
 * the "try selectable, fall back to OCR" policy in one place.
 */
export async function resolvePageText(
  pdf: PDFDocumentProxy,
  pdfPath: string,
  pageNumber: number,
  onOcrStart?: () => void
): Promise<PageTextResult> {
  const selectable = await getSelectableText(pdf, pdfPath, pageNumber);
  if (selectable.length > 0) {
    return { text: selectable, source: "selectable" };
  }

  onOcrStart?.();
  const ocr = await getOcrText(pdf, pdfPath, pageNumber);
  if (ocr.length > 0) {
    return { text: ocr, source: "ocr" };
  }

  return { text: "", source: "none" };
}