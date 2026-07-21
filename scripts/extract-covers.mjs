// One-time build tool: extracts page 1 of each real book's PDF and
// writes it as a permanent static cover asset in public/book-covers/.
// This is the literal "extract once, store permanently" step described
// in lib/coverManager.ts — run this instead of ever depending on a
// live in-browser PDF render for these three launch titles.
//
// Usage: node scripts/extract-covers.mjs
//
// Uses @napi-rs/canvas, not the classic `canvas` package — pdfjs-dist's
// own Node-targeting code (legacy/build/pdf.mjs) internally does
// `require("@napi-rs/canvas")` for its own temporary canvases and image
// decoding. Rendering with a different canvas implementation than the
// one pdfjs uses internally fails with "Image or Canvas expected": the
// two packages' Canvas/Image classes aren't `instanceof`-compatible
// with each other, so matching pdfjs's own choice is required, not
// optional.
import { createCanvas, Image, DOMMatrix } from "@napi-rs/canvas";
import { writeFileSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

globalThis.Image = Image;
globalThis.DOMMatrix ??= DOMMatrix;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

const BOOKS = [
  // Nalanda's PDF page 1 is a full wrap (back cover + spine + front
  // cover) rather than a lone front-cover page like the other two —
  // cropRightFraction keeps only the front-cover portion (right ~46%,
  // measured against the rendered spine position) instead of showing
  // the whole spread shrunk into a single card.
  // Illustrated/photographic covers export as JPEG — much smaller than
  // PNG for this kind of artwork at a quality level with no visible
  // loss. A plain text-only title page (no illustration) would
  // compress smaller and sharper as PNG instead — set format:
  // "image/png" for a book like that.
  { id: "nalanda", pdf: "public/director-books/nalanda.pdf", out: "public/book-covers/nalanda.jpg", format: "image/jpeg", cropRightFraction: 0.435 },
  { id: "chandrayaan-3", pdf: "public/director-books/chandrayaan-3.pdf", out: "public/book-covers/chandrayaan.jpg", format: "image/jpeg" },
  { id: "artificial-intelligence-technology", pdf: "public/director-books/artificial-intelligence-technology.pdf", out: "public/book-covers/artificial-intelligence-technology.jpg", format: "image/jpeg" },
];

const TARGET_WIDTH = 700;

mkdirSync(path.join(root, "public/book-covers"), { recursive: true });

for (const book of BOOKS) {
  const t0 = Date.now();
  const pdfPath = path.join(root, book.pdf);
  const loadingTask = pdfjsLib.getDocument({
    url: pdfPath,
    standardFontDataUrl: path.join(root, "public/standard_fonts").replace(/\\/g, "/") + "/",
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = TARGET_WIDTH / baseViewport.width;
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const ctx = canvas.getContext("2d");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;

  let outCanvas = canvas;
  if (book.cropRightFraction) {
    const cropX = Math.round(canvas.width * (1 - book.cropRightFraction));
    const cropW = canvas.width - cropX;
    const cropped = createCanvas(cropW, canvas.height);
    cropped.getContext("2d").drawImage(canvas, cropX, 0, cropW, canvas.height, 0, 0, cropW, canvas.height);
    outCanvas = cropped;
  }

  const outPath = path.join(root, book.out);
  const buffer = book.format === "image/jpeg" ? outCanvas.toBuffer("image/jpeg", 90) : outCanvas.toBuffer("image/png");
  writeFileSync(outPath, buffer);
  console.log(`${book.id}: ${outCanvas.width}x${outCanvas.height} -> ${book.out} (${(buffer.length / 1024).toFixed(0)}KB, ${Date.now() - t0}ms)`);
}

console.log("Done.");
