// ── AI context-scope helpers (Phase C2) ────────────────────────────────
// Pure, synchronous helpers shared by the "current chapter" and "entire
// book" AI scopes in PremiumReaderPreviewContent.tsx. Kept separate from
// that file (already large) and free of React/pdf.js so they're trivial
// to reason about and reuse.

/**
 * Splits already-extracted, [Page N]-tagged book text into chunks no
 * larger than `chunkSize`, preferring to break BETWEEN page boundaries
 * so a chunk never cuts a page's text in half. Falls back to returning
 * the whole text as a single chunk if it's already short enough.
 */
export function chunkBookText(text: string, chunkSize: number): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= chunkSize) return trimmed ? [trimmed] : [];

  const pageBlocks = trimmed.split(/\n\n(?=\[Page \d+\])/g);
  const chunks: string[] = [];
  let current = "";

  for (const block of pageBlocks) {
    if (current && current.length + block.length + 2 > chunkSize) {
      chunks.push(current.trim());
      current = block;
    } else {
      current = current ? `${current}\n\n${block}` : block;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return chunks.length > 0 ? chunks : [trimmed];
}

/**
 * Approximates "current chapter" from ALREADY-CACHED page text (never
 * triggers new extraction — this is what keeps chapter scope cheap and
 * instant) by combining a window of pages around `centerPage`. Pages
 * with no cached text yet, or only noise, are simply skipped rather
 * than padded with empty content.
 */
export function buildChapterWindowText(
  pageTexts: Record<number, string>,
  centerPage: number,
  windowSize: number
): string {
  const start = Math.max(1, centerPage - windowSize);
  const end = centerPage + windowSize;
  const parts: string[] = [];
  for (let p = start; p <= end; p++) {
    const t = pageTexts[p];
    if (t && t.trim().length > 10) parts.push(`[Page ${p}]\n${t.trim()}`);
  }
  return parts.join("\n\n");
}

function normalizeForDedup(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Removes near-duplicate lines within a [Page N]-tagged chapter window —
 * repeated running headers/footers, or OCR/text-layer noise that
 * produces the same fragment on several pages — so they don't pad out
 * the context sent to the AI or read as the "same content" repeating.
 * Deliberately line-scoped (never merges across a [Page N] boundary)
 * and only dedupes lines long enough (8+ normalized chars) to compare
 * reliably — short lines like "[Page 4]" or page numbers are always kept.
 */
export function dedupeChapterText(raw: string): string {
  const blocks = raw.split(/\n\n(?=\[Page \d+\])/g);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => {
      const norm = normalizeForDedup(line);
      if (norm.length < 8) return true;
      if (seen.has(norm)) return false;
      seen.add(norm);
      return true;
    });
    const rebuilt = lines.join("\n").trim();
    if (rebuilt) kept.push(rebuilt);
  }
  return kept.join("\n\n");
}

/**
 * Runs `fn` over `items` with at most `concurrency` in flight at once —
 * used to bound how many pages get OCR'd in parallel for chapter-scope
 * extraction (Tesseract is expensive; unbounded concurrency would both
 * slow down each individual page and spike memory).
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/**
 * Races `promise` against a timeout, resolving to `fallback` if the
 * timeout wins. The underlying `promise` is NOT cancelled (browser
 * SpeechSynthesis/pdf.js/Tesseract calls generally can't be aborted
 * mid-flight) — it keeps running in the background and, if it later
 * resolves, its result is simply discarded (harmless: chapter-scope
 * extraction's own per-page cache still benefits from that work
 * completing whenever it does). This exists so a slow or stuck OCR
 * pass — including this codebase's own already-documented page.render()
 * stalls in some environments — can never hang the UI indefinitely with
 * no Retry available; the caller gets `fallback` and moves on.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve(fallback); }
    }, ms);
    promise.then(
      (value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } },
      () => { if (!settled) { settled = true; clearTimeout(timer); resolve(fallback); } }
    );
  });
}
