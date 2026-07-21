"use client";

// ── CoverManager ─────────────────────────────────────────────────────
// Single place that owns "how do we get a cover image out of an
// uploaded PDF." Previously this logic lived inline inside
// components/ui/BookCover.tsx and ran fresh on every single mount — a
// book shown on three Home rails at once meant three independent
// getDocument() + render() passes over the same PDF, competing for the
// same 8-second budget. That's what made Nalanda's 26MB file
// unreliable: not the renderer, the fact that it re-did the work every
// time instead of doing it once.
//
// The fix: extract-once, cache-forever. generateCoverFromPdf() is the
// actual "render page 1 to an image" primitive — used both by
// getCachedCoverForPdf() (BookCover.tsx's live fallback for any PDF
// that doesn't have a pre-generated static cover yet) and by any future
// admin "generate a cover for this upload" tool, so there's exactly one
// implementation of PDF-to-cover in the codebase. The cache is checked
// in-memory first, then localStorage (so it survives reloads and new
// tabs), and only falls through to an actual render on a true first
// encounter — every subsequent request for the same PDF, anywhere in
// the app, for any book, resolves instantly from cache.
//
// For the three real launch titles (Nalanda, Chandrayaan-3, Artificial
// Intelligence Technology) this cache is a safety net, not the primary
// path — their covers are pre-generated once at build time into
// public/book-covers/ and referenced directly via lib/directorBooks.ts's
// `cover` field (BookCover's Tier 1), so they never hit this code at all
// in normal operation. This exists for every book that doesn't have
// that yet: today that's the handful of director-catalogue books
// without a static asset, and after launch
// it's every newly-uploaded PDF until an admin (or an automated upload
// pipeline) runs the same generateCoverFromPdf() step and promotes the
// result to a permanent Tier-1 asset.

const memoryCache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

function cacheKey(pdfUrl: string) {
  return `ndl-cover-cache:${pdfUrl}`;
}

function readPersistedCache(pdfUrl: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(cacheKey(pdfUrl));
  } catch {
    return null;
  }
}

function writePersistedCache(pdfUrl: string, dataUrl: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(cacheKey(pdfUrl), dataUrl);
  } catch {
    // Quota exceeded or storage disabled — memory cache still covers
    // the current session, which is the case that actually matters
    // (repeated renders within one visit).
  }
}

export type GenerateCoverOptions = {
  /** Target pixel width of the generated cover. */
  width?: number;
  /** WebP quality, 0–1. */
  quality?: number;
};

// The actual PDF-first-page-to-image primitive. No artificial timeout
// here — a caller that needs a deadline (BookCover's live fallback)
// races this against its own timer instead of the generator giving up
// on itself, so a slow render still finishes and populates the cache
// for next time even if the current mount already fell back to Tier 3.
export async function generateCoverFromPdf(pdfUrl: string, options: GenerateCoverOptions = {}): Promise<string> {
  const { width = 600, quality = 0.85 } = options;
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const pdf = await pdfjsLib.getDocument({ url: pdfUrl, standardFontDataUrl: "/standard_fonts/" }).promise;
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const scale = width / baseViewport.width;
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas.toDataURL("image/webp", quality);
}

// Cached wrapper: resolves from memory, then localStorage, then
// generates exactly once (de-duped across concurrent callers via
// `inFlight`) and persists the result for every future call.
export function getCachedCoverForPdf(pdfUrl: string, options?: GenerateCoverOptions): Promise<string> {
  const cached = memoryCache.get(pdfUrl) ?? readPersistedCache(pdfUrl);
  if (cached) {
    memoryCache.set(pdfUrl, cached);
    return Promise.resolve(cached);
  }

  const existing = inFlight.get(pdfUrl);
  if (existing) return existing;

  const promise = generateCoverFromPdf(pdfUrl, options)
    .then((dataUrl) => {
      memoryCache.set(pdfUrl, dataUrl);
      writePersistedCache(pdfUrl, dataUrl);
      return dataUrl;
    })
    .finally(() => {
      inFlight.delete(pdfUrl);
    });
  inFlight.set(pdfUrl, promise);
  return promise;
}
