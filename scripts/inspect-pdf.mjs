// One-off inspection tool: reports real metadata pulled from a PDF
// itself (not guessed from the filename) — title/author, page count,
// encryption status, and whether the first few pages carry a real text
// layer (vs. scanned images with no selectable text).
//
// Usage: node scripts/inspect-pdf.mjs <path-to-pdf>
import { Image, DOMMatrix } from "@napi-rs/canvas";
import path from "path";

globalThis.Image = Image;
globalThis.DOMMatrix ??= DOMMatrix;

const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

const pdfArg = process.argv[2];
if (!pdfArg) {
  console.error("Usage: node scripts/inspect-pdf.mjs <path-to-pdf>");
  process.exit(1);
}
const pdfPath = path.resolve(pdfArg);

let pdf;
try {
  const loadingTask = pdfjsLib.getDocument({
    url: pdfPath,
    standardFontDataUrl: path.resolve("public/standard_fonts").replace(/\\/g, "/") + "/",
  });
  pdf = await loadingTask.promise;
} catch (e) {
  console.log(JSON.stringify({ ok: false, error: String(e), isPasswordError: e?.name === "PasswordException" }, null, 2));
  process.exit(0);
}

const numPages = pdf.numPages;
const metadata = await pdf.getMetadata().catch(() => null);
const info = metadata?.info ?? {};

const pageTextSamples = [];
const requestedPages = process.argv[3] ? process.argv[3].split(",").map(Number) : [1, 2, 3];
const pagesToSample = requestedPages.filter((p, i, arr) => arr.indexOf(p) === i && p >= 1 && p <= numPages);
for (const pageNum of pagesToSample) {
  try {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((it) => it.str).join(" ").trim();
    pageTextSamples.push({ page: pageNum, hasSelectableText: text.length > 0, charCount: text.length, sample: text.slice(0, 200) });
  } catch (e) {
    pageTextSamples.push({ page: pageNum, error: String(e) });
  }
}

const firstPage = await pdf.getPage(1);
const viewport = firstPage.getViewport({ scale: 1 });

console.log(JSON.stringify({
  ok: true,
  numPages,
  pdfInfoDict: info,
  firstPageDimensions: { widthPt: viewport.width, heightPt: viewport.height, aspectRatio: (viewport.width / viewport.height).toFixed(3) },
  pageTextSamples,
}, null, 2));
