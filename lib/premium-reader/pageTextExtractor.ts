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
 * Cleans raw OCR output before it is cached or spoken. OCR on scanned
 * pages frequently produces noise: repeated whitespace, tiny random
 * fragments (stray punctuation misread as "characters"), standalone
 * symbols, and lines that are mostly non-letters (table borders,
 * watermark artifacts, page furniture). This is a best-effort cleanup
 * pass — it intentionally stays conservative so it never strips real
 * sentences, only obvious junk.
 */
export function cleanOcrText(raw: string): string {
  if (!raw) return "";

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);

  const cleanedLines = lines.filter((line) => {
    // Drop lines that are mostly non-letters (e.g. "—— || ___ ...").
    const letterCount = (line.match(/[A-Za-z]/g) || []).length;
    const letterRatio = letterCount / line.length;
    if (letterRatio < 0.4) return false;

    // Drop very short random fragments (1-2 characters) that aren't
    // a real word on their own (e.g. stray OCR noise like "l", "—", "..").
    const wordlike = /^[A-Za-z]{3,}$/.test(line);
    if (line.length <= 2 && !wordlike) return false;

    // Drop lines that are just a single standalone symbol/punctuation
    // with no letters at all.
    if (!/[A-Za-z0-9]/.test(line)) return false;

    return true;
  });

  return cleanedLines.join(" ").replace(/\s+/g, " ").trim();
}

// ── AI-prompt-specific OCR noise filtering ────────────────────────────
// cleanOcrText() above is intentionally light-touch — it runs once at
// OCR time and its output gets CACHED and used for display/selection,
// so it has to stay conservative to avoid ever corrupting what the
// reader displays/highlights. cleanOcrTextForAi() below is a second,
// much stronger pass applied ONLY right before building an AI prompt
// (never cached, never affects display) — exactly the same
// separation-of-concerns pattern as sanitizeForSpeech() further down
// this file. It targets garbled OCR runs like:
//   "A HA BEER EEE issn ao. mEEES (EE SEER pan: ANEEE IEE EEE E--- J 11148 LJ]"
// — fragments that pass the lighter cleanOcrText() filter (they're
// mostly letters, so letterRatio is fine) but are still unreadable
// noise that an AI model will otherwise dutifully try to translate or
// "explain".

const REPEATED_LETTER_RUN = /([A-Za-z])\1{2,}/; // e.g. "EEE", "AAA", "III"
const SYMBOL_BRACKET_CHARS = /[(){}[\]_~^|<>=+#*]/g;

// Short tokens that are legitimately common in real sentences and
// must never count against a line just for being short.
const SAFE_SHORT_TOKENS = new Set([
  "a", "i", "an", "as", "at", "be", "by", "ce", "bc", "ad", "in", "is",
  "it", "of", "on", "or", "to", "up", "we", "he", "she", "no", "so",
]);

/**
 * Scores a single segment (line or sentence-ish chunk) as likely OCR
 * noise. Deliberately layered so that:
 *  - Symbol/bracket density and isolated-short-token ratio are
 *    language-agnostic and apply to ANY script (catches junk like
 *    "J 11148 LJ]" regardless of language).
 *  - Repeated-letter-run and uppercase-ratio checks are ASCII/Latin-
 *    specific and are SKIPPED entirely for segments that aren't
 *    predominantly Latin-script — this is what keeps Hindi/Indic text
 *    safe from false positives, since Devanagari etc. characters
 *    don't match /[A-Za-z]/ at all and would otherwise skew every
 *    ratio in this function toward "looks like noise".
 */
function isLikelyOcrNoiseSegment(segment: string): boolean {
  const trimmed = segment.trim();
  if (trimmed.length === 0) return false;

  // Pure numbers/dates (page numbers, years, "450 CE", "2014") are
  // never noise on their own.
  if (/^[0-9\s.,:;()-]+$/.test(trimmed)) return false;

  const symbolCount = (trimmed.match(SYMBOL_BRACKET_CHARS) || []).length;
  const symbolRatio = symbolCount / trimmed.length;
  if (symbolRatio > 0.12) return true;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length >= 3) {
    const junkShortTokens = tokens.filter((token) => {
      const alnum = token.replace(/[^\p{L}\p{N}]/gu, "");
      if (alnum.length === 0) return true; // pure punctuation token
      if (/^\d+$/.test(alnum)) return false; // numbers are fine
      if (alnum.length > 2) return false;
      return !SAFE_SHORT_TOKENS.has(alnum.toLowerCase());
    });
    const junkRatio = junkShortTokens.length / tokens.length;
    if (junkRatio > 0.4) return true;
  }

  const asciiLetters = (trimmed.match(/[A-Za-z]/g) || []).length;
  const isPredominantlyLatin = asciiLetters / trimmed.length >= 0.3;
  if (!isPredominantlyLatin) {
    // Likely Hindi/Indic (or otherwise non-Latin) content — the
    // checks above already ran and are language-agnostic; stop here
    // rather than applying ASCII-specific heuristics that would
    // misfire on non-Latin scripts.
    return false;
  }

  if (REPEATED_LETTER_RUN.test(trimmed)) return true;

  const upperCount = (trimmed.match(/[A-Z]/g) || []).length;
  const upperRatio = asciiLetters > 0 ? upperCount / asciiLetters : 0;
  if (upperRatio > 0.7 && trimmed.length > 25) return true;

  return false;
}

/** Splits text into scoring units: real newlines plus sentence-ish boundaries. */
function splitIntoSegments(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+|\r?\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Strict pass: drops every segment scored as likely noise. */
function stripNoiseSegments(text: string): string {
  const segments = splitIntoSegments(text);
  const kept = segments.filter((segment) => !isLikelyOcrNoiseSegment(segment));
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Much gentler pass used only as a fallback when the strict pass
 * above removed too much: drops only the most unambiguous junk
 * (very high symbol density, or a long repeated-letter run), so a
 * page that's borderline-unreadable still yields SOMETHING rather
 * than an empty prompt.
 */
function conservativeTrim(text: string): string {
  const segments = text
    .split(/\r?\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const kept = segments.filter((segment) => {
    const symbolCount = (segment.match(SYMBOL_BRACKET_CHARS) || []).length;
    const symbolRatio = symbolCount / segment.length;
    if (symbolRatio > 0.25) return false;
    if (REPEATED_LETTER_RUN.test(segment) && segment.length < 15) return false;
    return true;
  });

  return kept.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Strong, AI-prompt-specific OCR noise cleanup. Call this on any text
 * (page text or a user selection) immediately before it goes into an
 * AI prompt — never cache its output, never use it for display, since
 * it intentionally drops more than cleanOcrText() does.
 *
 * Keeps: normal English sentences, Hindi/Indic text, numbers/dates
 * that are part of a normal sentence (e.g. "450 CE", "2014").
 * Removes: repeated-letter-run fragments (EEE/AAA/III style), long
 * mostly-uppercase junk lines, bracket/symbol-heavy fragments, lines
 * dominated by isolated 1-2 character tokens.
 *
 * Fallback: if the strict pass removes a large share of the text
 * (and the text was non-trivially long to begin with — short, fully
 * legitimate selections are never penalized just for being short),
 * falls back to a much more conservative trim of the ORIGINAL text
 * rather than risk sending the AI an empty or near-empty prompt.
 */
export function cleanOcrTextForAi(text: string): string {
  if (!text) return "";

  const original = text.trim();
  if (original.length === 0) return "";

  const cleaned = stripNoiseSegments(original);

  if (cleaned.length === 0) {
    const fallback = conservativeTrim(original);
    return fallback.length > 0 ? fallback : original;
  }

  const removedRatio = 1 - cleaned.length / original.length;
  if (removedRatio > 0.7 && original.length > 40) {
    const fallback = conservativeTrim(original);
    return fallback.length > 0 ? fallback : original;
  }

  return cleaned;
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
 * suited for OCR accuracy, then runs tesseract.js against it. The
 * raw OCR output is passed through cleanOcrText() before caching, so
 * every consumer of the cache automatically gets the cleaned version.
 * Results are cached per page; concurrent calls for the same page
 * share a single in-flight promise rather than starting OCR twice.
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

      const cleaned = cleanOcrText(result.data.text || "");
      ocrTextCache.set(key, cleaned);
      return cleaned;
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
 *  2. OCR text (already cleaned via cleanOcrText), only if selectable
 *     text was empty.
 *  3. Empty string (caller decides the fallback message) if both are empty.
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

/**
 * Prepares a copy of resolved page text SPECIFICALLY for speech
 * synthesis. This is intentionally separate from cleanOcrText():
 * cleanOcrText() removes structural OCR noise (garbled lines, table
 * borders) and its output is cached/stored for future AI features.
 * sanitizeForSpeech() goes further but is NEVER cached and NEVER
 * stored — it only transforms a throwaway copy right before handing
 * text to the browser's SpeechSynthesis API, so symbols/equations
 * don't get mispronounced (e.g. "=" read aloud as "is equal to").
 *
 * Rules:
 *  - Strip standalone math/operator symbols: = + - × ÷ < > | _ ~ ^
 *    (only when they appear as isolated tokens or glued onto
 *    otherwise-symbol-heavy fragments — normal words are untouched).
 *  - Strip symbol-heavy fragments (tokens that are mostly punctuation
 *    with little or no alphanumeric content).
 *  - Preserve normal sentence punctuation: . , ? ! ; : ' " ( ) -
 *    (the hyphen is preserved when it's part of a real word like
 *    "well-known"; only DROPPED when used as a bare minus/operator,
 *    which the symbol-token rule below already handles).
 *  - Collapse whitespace.
 */
export function sanitizeForSpeech(raw: string): string {
  if (!raw) return "";

  const tokens = raw.split(/\s+/);

  const MATH_OPERATOR_TOKEN = /^[=+\-×÷<>|_~^]+$/;

  const kept = tokens.filter((token) => {
    if (token.length === 0) return false;

    // Drop tokens that are ENTIRELY made of math/operator symbols.
    if (MATH_OPERATOR_TOKEN.test(token)) return false;

    // Drop tokens that are mostly symbols with little real content —
    // e.g. OCR garbage like "—=//" or "^^^_". A token is considered
    // symbol-heavy if fewer than 40% of its characters are letters
    // or digits AND it's short (long real words with one stray
    // symbol, e.g. "co-operate", are left alone).
    const alnumCount = (token.match(/[A-Za-z0-9]/g) || []).length;
    const alnumRatio = alnumCount / token.length;
    if (token.length <= 6 && alnumRatio < 0.4) return false;

    return true;
  });

  return kept
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}