"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import AICompanion from "@/components/reader-premium/AICompanion";
import BookOpeningAnimation from "@/components/reader-premium/BookOpeningAnimation";
import BookCover from "@/components/reader-premium/BookCover";
import { directorBooks } from "@/lib/directorBooks";
import { getPublicCatalog } from "@/lib/catalog";
import { trackAIUsage, logActivity, type AIFeature } from "@/components/admin/adminData";
import PremiumReaderLayout, { type PremiumReaderLayoutHandle } from "@/components/reader-premium/PremiumReaderLayout";
import LanguagePopover from "@/components/reader-premium/LanguagePopover";
import AccessibilityToolbar from "@/components/ui/AccessibilityToolbar";
import { saveCurrentBook } from "@/lib/currentBook";
import { saveReadingProgress } from "@/components/my-space/mySpaceData";
// ── Phase 2: AI Notes, Highlights, Bookmarks, Study Workspace ─────────
// Additive only — nothing below touches page turning, zoom, fullscreen,
// or the text/image selection engine above.
import {
  HighlightColor, StoredHighlight, StoredNote, StoredBookmark, RectPct,
  HIGHLIGHT_COLOR_HEX,
  loadHighlights, saveHighlights, loadNotes, saveNotes, loadBookmarks, saveBookmarks, newId,
} from "@/components/reader-premium/study/studyData";
import HighlightColorPicker from "@/components/reader-premium/study/HighlightColorPicker";
import NotePopover, { NoteAIAction } from "@/components/reader-premium/study/NotePopover";
import type { RevisionAction } from "@/components/reader-premium/study/StudyWorkspace";
import type { PageOverlayHighlight, PageOverlayNote } from "@/components/reader-premium/PdfBookSpread";
import { getPrintedPageMap, getPageDescriptionForAI, resolvePrintedPageTarget, getDisplayLabel, getSpreadDisplayLabel } from "@/lib/printedPageMap";
import { snapSpreadCursor, getNextSpreadCursor, getPrevSpreadCursor } from "@/lib/spreadNavigation";
import { cleanOcrTextForAi, sanitizeForSpeech, resolvePageText } from "@/lib/premium-reader/pageTextExtractor";
import { chunkBookText, buildChapterWindowText, dedupeChapterText, mapWithConcurrency, withTimeout } from "@/lib/premium-reader/aiContext";
import { getUploadedPdf, getUploadedBookMeta, saveUploadedBookMeta, type UploadedBookMeta } from "@/lib/uploadedPdfStore";
import { detectPdfLayout } from "@/lib/pdfLayoutDetection";
import { getSpeechLanguage } from "@/lib/premium-reader/aiActions";
import { loadVoices, pickVoiceForLanguage, stripMarkdownForSpeech, splitIntoSpeechChunks } from "@/lib/premium-reader/speech";
import { useEnabledLanguages, LANGUAGE_NAME_TO_CODE } from "@/lib/languageSettings";
import { UI_TEXT, type Language } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

const PdfBookSpread = dynamic(
  () => import("@/components/reader-premium/PdfBookSpread"),
  { ssr: false }
);

// P0: dedicated mobile PDF renderer — mounted instead of PdfBookSpread
// only below the 640px viewport threshold (isMobileViewport). Code-split
// the same way as PdfBookSpread so neither renderer's code ships to the
// platform that doesn't use it.
const MobilePdfPage = dynamic(
  () => import("@/components/reader-premium/MobilePdfPage"),
  { ssr: false }
);

// ── Languages ────────────────────────────────────────────────────────
const LANGUAGES = ["English","Hindi","Tamil","Bengali","Marathi","Telugu"] as const;
type Lang = typeof LANGUAGES[number];
// Reverse of LanguagePopover's LANG_TO_UI_CODE — lets the AI response
// language (`language` state below) be initialized FROM the persisted
// platform UI language on mount/refresh, instead of always starting at
// the hardcoded "English" default regardless of what `uiLanguage` was
// left at. Without this, refreshing while the UI language was Hindi
// left `language` at "English" and `uiLanguage` at "hi" out of sync
// until the user manually reopened the language popover.
const UI_CODE_TO_LANG: Record<Language, Lang> = {
  en: "English", hi: "Hindi", ta: "Tamil", bn: "Bengali", mr: "Marathi", te: "Telugu",
};

// ── ONE interaction mode enum ─────────────────────────────────────────
// This is the ONLY thing that decides which AI context gets used.
//
// ARCHITECTURE NOTE (read this before touching selection logic):
// The user is allowed to physically drag across ANYTHING in either mode —
// text, images, diagrams, mixed content. We do not try to physically wall
// off "text" from "image" drags anymore. Both a browser text selection AND
// a cropped image CAN exist internally at the same time. The MODE alone
// decides which one the AI is allowed to see:
//   - Text Select mode  → AI uses ONLY activeSelection.text
//   - Image Select mode → AI uses ONLY activeSelection.imageData
// Every floating-toolbar button goes through ONE router — handleSelectionAction —
// which looks at interactionMode (not at browser selection, not at image
// crop) to decide which of the two mode-specific action runners to call.
type InteractionMode = "none" | "text" | "image";

// ── ONE selection type ────────────────────────────────────────────────
type ActiveSelection =
  | { type: "text";  id: string; text: string;      pageNumber: number; x: number; y: number }
  | { type: "image"; id: string; imageData: string;  pageNumber: number }
  | null;

// ── Screen-space rectangle used for drag/highlight overlays ───────────
type ScreenRect = { left: number; top: number; width: number; height: number };

// ── Phase C2: one remembered Q&A turn, kept in memory only (never
// localStorage) so follow-ups like "explain that more simply" can be
// grounded without changing any persisted schema. ─────────────────────
type AiTurn = { question: string; answer: string };

// ── Response depth — reuses the Student/Exam Prep/Researcher study
// modes already implemented server-side (app/api/ask-ai/route.ts) via
// the existing "[Study Mode: X]" tag, instead of adding a new backend
// concept for what is really the same idea under a friendlier name. ────
type Depth = "Beginner" | "Exam-focused" | "Research-level";
const DEPTH_TO_STUDY_MODE: Record<Depth, string> = {
  Beginner: "Student",
  "Exam-focused": "Exam Prep",
  "Research-level": "Researcher",
};

// ── AI caller ─────────────────────────────────────────────────────────
async function callAskAI(
  question: string, bookTitle: string, pageNumber: number,
  content: string, language: Lang, imageDataUrl?: string,
  /** Overrides the default "Page N" chapter label sent to the AI.
   *  Selection actions pass "Selected Text" or "Selected Image" so the
   *  model uses that as its context heading instead of "Page X". */
  chapterOverride?: string,
  studyMode: string = "Student",
  /** Last few turns from this reading session, oldest first — lets the
   *  model resolve "explain that more simply"-style follow-ups. */
  history?: AiTurn[],
  /** Human-readable scope label sent to the API so its system prompt
   *  never claims a narrower scope than what was actually provided. */
  scope: string = "current page",
  /** Aborts the request (network failure OR the timeout runAI sets up
   *  around this call) — surfaces as a DOMException named "AbortError",
   *  caught the same as any other failure by the caller. */
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch("/api/ask-ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: `[Study Mode: ${studyMode}] ${question} Respond ONLY in: ${language}.`,
      book: bookTitle,
      chapter: chapterOverride ?? `Page ${pageNumber}`,
      content,
      scope,
      ...(history && history.length > 0 ? { history: history.slice(-3) } : {}),
      ...(imageDataUrl ? { imageDataUrl } : {}),
    }),
    signal,
  });
  // res.json() itself can throw (e.g. a non-JSON proxy/error page) —
  // that's allowed to propagate to the caller's catch exactly like any
  // other failure here; there is deliberately no special-casing per
  // failure type, so every failure (network error, non-200, invalid
  // JSON, timeout/abort) is caught identically by runAI.
  const data = await res.json();
  // The route always returns { answer } even for errors so /reader,
  // /quiz, /revision (which never check res.ok) still get SOME text —
  // but this caller can and should tell the difference, so a real
  // server-side failure (missing API key, OpenAI error, etc.) properly
  // triggers runAI's catch block: Retry button, preserved question,
  // aiFailed state, instead of silently rendering the error text as if
  // it were a normal answer.
  if (!res.ok) throw new Error(data?.answer || "AI request failed");
  return data?.answer ?? UI_TEXT[LANGUAGE_NAME_TO_CODE[language]].premiumReaderNoResponse;
}

// ── AI usage tracking ────────────────────────────────────────────────
// Maps this Reader's action-name strings (used by both the floating
// toolbar and the AI Companion's quick-action buttons) onto the 6
// features Admin → AI Usage tracks. Free-form "ask" questions and image
// "ask" have no matching bucket, so they're intentionally left untracked
// by feature (still real AI calls, just not one of the 6 named ones).
function mapActionToAIFeature(action?: string): AIFeature | null {
  switch (action) {
    case "explain": return "explain";
    case "summarize": return "summarize";
    case "translate": return "translate";
    case "quiz": case "mcqs": return "quiz";
    case "flashcards": return "flashcards";
    case "notes": case "revision": return "revision";
    default: return null;
  }
}

// ── Crop a screen-space rectangle out of the current page's canvas ────
// Shared by BOTH modes: Image Select uses it directly to build the AI
// image; Text Select uses it only as an OCR fallback when the browser's
// native selection came back empty (e.g. Nalanda pages with no embedded
// text layer). This is the ONLY place canvas cropping happens — no
// duplicate crop logic lives anywhere else.
function cropCanvasRegion(
  start: { x: number; y: number },
  end: { x: number; y: number },
  pageNumber: number
): { dataUrl: string; rect: ScreenRect } | null {
  const canvas = document.querySelector<HTMLCanvasElement>(`canvas[data-pdf-page="${pageNumber}"]`);
  if (!canvas) return null;

  const canvasRect = canvas.getBoundingClientRect();
  const selLeft   = Math.max(Math.min(start.x, end.x), canvasRect.left);
  const selTop    = Math.max(Math.min(start.y, end.y), canvasRect.top);
  const selRight  = Math.min(Math.max(start.x, end.x), canvasRect.right);
  const selBottom = Math.min(Math.max(start.y, end.y), canvasRect.bottom);
  if (selRight <= selLeft || selBottom <= selTop) return null;

  // Map screen coords → canvas buffer coords (accounts for zoom + DPR)
  const bufScaleX = canvas.width  / canvasRect.width;
  const bufScaleY = canvas.height / canvasRect.height;
  const sx = Math.max(0, Math.round((selLeft   - canvasRect.left) * bufScaleX));
  const sy = Math.max(0, Math.round((selTop    - canvasRect.top)  * bufScaleY));
  const sw = Math.min(Math.round((selRight  - selLeft)  * bufScaleX), canvas.width  - sx);
  const sh = Math.min(Math.round((selBottom - selTop)   * bufScaleY), canvas.height - sy);
  if (sw < 10 || sh < 10) return null;

  const crop = document.createElement("canvas");
  crop.width = sw; crop.height = sh;
  const ctx = crop.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);

  let dataUrl = "";
  try { dataUrl = crop.toDataURL("image/png"); } catch { return null; }
  if (dataUrl.length < 100) return null;

  return {
    dataUrl,
    rect: { left: selLeft, top: selTop, width: selRight - selLeft, height: selBottom - selTop },
  };
}

// Only used by "Read AI Response" now (handleReadAiResponse) — a
// genuinely separate, one-off "player" (reads the AI Companion's current
// output, never part of Read Page/Chapter/Book) that this unification
// task explicitly does not touch.
type SpeechState = "idle" | "loading" | "speaking" | "paused";

// ── Unified Reading Engine ──────────────────────────────────────────────
// Read Page, Read Chapter and Read Book (previously three loosely-related
// implementations — a standalone handleReadPage using a DIFFERENT, OCR-
// blind text source than Read Chapter/Book's own pipeline) now share ONE
// engine: one page-text resolver (resolveReadingPageText), one chunking/
// speech path (speakChunksContinuous), one cancellation token
// (readerTokenRef), and one player state machine below. "page" mode is
// simply a session whose start and end page are the same, so the engine
// never special-cases it beyond that.
type ReadMode = "page" | "chapter" | "book";
type ReaderStatus = "idle" | "starting" | "playing" | "paused" | "completed" | "error";
type SleepTimerOption = "off" | "15" | "30" | "45" | "60" | "endOfChapter" | "endOfBook";
// Typed result of the shared page-text resolver (resolveReadingPageText)
// — "source" makes it possible to tell a genuine "no text anywhere"
// result apart from one that just hasn't been checked yet, instead of
// overloading an empty string for both.
type PageTextSource = "cache" | "selectable" | "ocr" | "none";
interface PageTextResolution { text: string; source: PageTextSource; }

// Page-level resume — deliberately the ONLY thing persisted (per spec:
// no sentence position, no speech timestamps). Keyed by bookId inside one
// localStorage entry so multiple books each keep their own last position.
const READ_BOOK_RESUME_KEY = "ndl_read_book_resume";
function saveReadBookResume(bookId: string, page: number) {
  try {
    const raw = window.localStorage.getItem(READ_BOOK_RESUME_KEY);
    const all = raw ? JSON.parse(raw) : {};
    all[bookId] = { page, mode: "book" };
    window.localStorage.setItem(READ_BOOK_RESUME_KEY, JSON.stringify(all));
  } catch { /* best-effort only — never block reading on storage failure */ }
}
function getReadBookResume(bookId: string): { page: number } | null {
  try {
    const raw = window.localStorage.getItem(READ_BOOK_RESUME_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw);
    const entry = all[bookId];
    return entry && Number.isFinite(entry.page) ? { page: entry.page } : null;
  } catch { return null; }
}
function clearReadBookResume(bookId: string) {
  try {
    const raw = window.localStorage.getItem(READ_BOOK_RESUME_KEY);
    if (!raw) return;
    const all = JSON.parse(raw);
    delete all[bookId];
    window.localStorage.setItem(READ_BOOK_RESUME_KEY, JSON.stringify(all));
  } catch { /* best-effort only */ }
}

const ZOOM_MIN = 50, ZOOM_MAX = 200, ZOOM_STEP = 20;
// Landscape fit-width follow-up: landscape's "100%" now MEANS fit-width
// (see MobilePdfPage's baseFitScale), so zooming below 100 there would
// just re-introduce the gutters this whole task removes — the floor
// moves up to 100. The ceiling is raised too (200 → 300) since fit-width
// starts from a taller effective baseline than portrait's contain-fit
// did, and the existing canvas safety budget (MobilePdfPage's
// MAX_CANVAS_PIXELS/MAX_CANVAS_DIMENSION_PX) still bounds how far a
// real device can actually render sharply regardless of this ceiling.
// Portrait/desktop keep the original ZOOM_MIN/MAX untouched everywhere
// they're already used.
const ZOOM_MIN_LANDSCAPE = 100, ZOOM_MAX_LANDSCAPE = 300;
// Minimum pointer travel (px) before a mouse-down/up pair counts as a real
// drag. Anything below this is a plain click and must never produce a
// selection, a crop, a highlight, or the floating toolbar.
const MIN_DRAG_PX = 6;

export default function PremiumReaderPreviewContent() {
  // ── Book ──────────────────────────────────────────────────────────
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  // ── Hydration gate ───────────────────────────────────────────────────
  // isHydrated is false during SSR and during the client's FIRST render
  // (the one React uses to hydrate against the server markup) — those
  // two renders are therefore guaranteed identical. It only flips to
  // true in a useEffect, i.e. strictly AFTER hydration has already
  // completed successfully. Nothing below ever reads
  // localStorage/sessionStorage/window unless isHydrated is already true,
  // so the uploaded-PDF title (or any other client-only data) can never
  // leak into the server-rendered / first-client-rendered output.
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Platform UI language — deliberately separate from the `language`
  // state declared below, which is the AI response/content language.
  // Named `uiLanguage` to avoid any collision with that state, same
  // convention used throughout the Reader (LanguagePopover.tsx, etc).
  // Declared this early (before currentBook) since the uploaded-document
  // fallback title below already needs a translated string.
  const { language: uiLanguage } = useLanguage();
  const t = UI_TEXT[uiLanguage];

  // ── Unified reading experience: user-uploaded PDFs ──────────────────
  // app/read/page.tsx reads an uploaded file as a base64 data URL and
  // stores it in IndexedDB (lib/uploadedPdfStore.ts) — sessionStorage's
  // ~5-10MB per-origin quota was too small for a base64-encoded file of
  // any real size (base64 alone runs ~33% larger than the source), so
  // any upload past a few MB threw QuotaExceededError. Small pointer
  // fields (upload id / file name / page count) still live in
  // sessionStorage since they're tiny and safe to read synchronously.
  // This is the ONLY place in the whole Reader that decides which "book"
  // is active — everything downstream (PdfBookSpread, AI Companion,
  // Study Workspace, highlights, notes, bookmarks, Read Aloud,
  // translation, quiz, revision) already just consumes whatever
  // currentBook/bookId resolve to below, so none of it needed to change.
  //
  // BEFORE hydration: always the stable directorBooks default (Nalanda,
  // or whatever ?book= says) — never sessionStorage/IndexedDB, never the
  // uploaded title. AFTER hydration: if an upload is actually present,
  // this re-evaluates (triggered by isHydrated flipping, then again once
  // the IndexedDB read below resolves) and swaps to it. Both swaps are
  // normal post-mount state updates, not part of hydration
  // reconciliation, so neither can ever produce a mismatch — this is
  // intentionally "BookCover updates only after client mount," not
  // eliminated.
  const uploadedSource = searchParams.get("source") === "upload";
  // `?id=` is the URL itself (available even before hydration, safe for
  // SSR) and is preferred; the sessionStorage pointer is a fallback for
  // links generated before this param existed — see app/read/page.tsx's
  // handleAiUpload for where both are written.
  const uploadIdParam = searchParams.get("id");
  const uploadedPdfId = uploadIdParam || (isHydrated ? window.sessionStorage.getItem("ndl_uploaded_pdf_id") : null);

  // The PDF's actual bytes — unlike the pointer fields above, this is an
  // async IndexedDB read, so it starts null and resolves once via effect.
  const [uploadedPdfData, setUploadedPdfData] = useState<string | null>(null);
  const [uploadedPdfLoadFailed, setUploadedPdfLoadFailed] = useState(false);
  useEffect(() => {
    if (!isHydrated || !uploadedSource || !uploadedPdfId) return;
    let cancelled = false;
    getUploadedPdf(uploadedPdfId)
      .then((dataUrl) => {
        if (cancelled) return;
        if (dataUrl) setUploadedPdfData(dataUrl);
        else setUploadedPdfLoadFailed(true);
      })
      .catch(() => { if (!cancelled) setUploadedPdfLoadFailed(true); });
    return () => { cancelled = true; };
  }, [isHydrated, uploadedSource, uploadedPdfId]);

  // Small persistent metadata record (name/pages/layout) — see
  // lib/uploadedPdfStore.ts. Separate from the pdf-bytes effect above
  // since this is a synchronous localStorage read, no fetch involved; if
  // it's missing (an upload made before this record existed), detect the
  // layout once the bytes are in and persist it — self-healing, so every
  // future open of the same upload is instant.
  const [uploadedBookMeta, setUploadedBookMeta] = useState<UploadedBookMeta | null>(null);
  useEffect(() => {
    if (!isHydrated || !uploadedSource || !uploadedPdfId || !uploadedPdfData) return;
    const existing = getUploadedBookMeta(uploadedPdfId);
    if (existing) { setUploadedBookMeta(existing); return; }
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjsLib.getDocument(uploadedPdfData).promise;
        const layout = await detectPdfLayout(doc);
        const name = window.sessionStorage.getItem("ndl_uploaded_pdf_name") || t.premiumReaderUploadedDocumentFallback;
        const meta: UploadedBookMeta = { id: uploadedPdfId, name, pages: doc.numPages, layout, uploadedAt: Date.now() };
        saveUploadedBookMeta(meta);
        if (!cancelled) setUploadedBookMeta(meta);
      } catch {
        // Leave meta null — currentBook below still falls back to the
        // safe "spread" default and the sessionStorage page-count pointer.
      }
    })();
    return () => { cancelled = true; };
  }, [isHydrated, uploadedSource, uploadedPdfId, uploadedPdfData]);

  // Explicit AND — requires both the URL's stated intent (?source=upload)
  // and the data actually being present, so a stale/bad link (or leftover
  // sessionStorage from a previous session) never silently hijacks a
  // normal library-book visit.
  const isUploadedBook = Boolean(isHydrated && uploadedSource && uploadedPdfData && uploadedPdfId);

  // Same before/after-hydration split as the upload data above — the
  // merged (admin-editable) catalog reads localStorage, so it's only
  // safe to use once isHydrated is true; before that, the static
  // directorBooks default keeps the first render identical to SSR.
  const catalogBooks = isHydrated ? getPublicCatalog() : directorBooks;

  const bookId = isUploadedBook ? (uploadedPdfId as string) : (searchParams.get("book") || "nalanda");
  const currentBook = isUploadedBook
    ? {
        id: uploadedPdfId as string,
        title: uploadedBookMeta?.name || (isHydrated ? window.sessionStorage.getItem("ndl_uploaded_pdf_name") : null) || t.premiumReaderUploadedDocumentFallback,
        author: "",
        description: "",
        language: "",
        cover: "",
        // The SAME string PdfBookSpread already passes straight into
        // pdfjsLib.getDocument(pdfPath) for every catalog book — a
        // data: URL is fetchable the same way a /director-books/*.pdf
        // path is, so PdfBookSpread needed zero changes for this to work.
        pdf: uploadedPdfData as string,
        pages: uploadedBookMeta?.pages || Number(isHydrated ? window.sessionStorage.getItem("ndl_uploaded_pdf_pages") : null) || 1,
        // Same canonical field/values as DirectorBook.layout — resolved
        // from the persisted metadata record (lib/uploadedPdfStore.ts,
        // detected once at upload time via lib/pdfLayoutDetection.ts).
        // "spread" is the safe portrait-PDF default while that record is
        // still being read/detected, never a silent "single".
        layout: uploadedBookMeta?.layout ?? "spread",
      }
    : (catalogBooks.find((b) => b.id === bookId) || catalogBooks[0]);
  const book = currentBook.title;
  const totalPages = Number(currentBook.pages);
  const isSpreadBook = currentBook.layout === "spread";

  // ── Printed-page mapping (demo: static, deterministic — no OCR, no
  // background indexing, nothing async) ─────────────────────────────────
  // A hand-verified per-book table (lib/printedPageMap.ts). Every lookup
  // is synchronous and instant — this is the ONLY source of truth for
  // every "what page is this" display/prompt/lookup below.
  const printedPageMap = useMemo(() => getPrintedPageMap(bookId), [bookId]);

  // Single place both the reader UI and every AI prompt below describe a
  // PDF page from — never build a "page N" string by hand elsewhere.
  const pageDescription = useCallback(
    (pdfPage: number) => getPageDescriptionForAI(pdfPage, printedPageMap),
    [printedPageMap]
  );

  // ── Reader ────────────────────────────────────────────────────────
  // A requested `?page=` is resolved synchronously into BOTH of these
  // initial states — not just `readerPage` — so the very first render
  // already reflects it. Doing this only in an effect (as a first pass
  // did) meant the component's first paint always used the plain
  // defaults (page 1, cover shown), and the correct values only landed
  // one commit later — a real, visible flash of the cover before the
  // requested page appeared. `searchParams`/`totalPages`/`isSpreadBook`
  // are all already resolved above by this point in the same render, so
  // reading them here is safe and needs no separate state or effect.
  const [readerPage, setReaderPage] = useState(() => {
    const urlPage = Number(searchParams.get("page"));
    if (!Number.isFinite(urlPage) || urlPage < 1) return 1;
    // Phase C1F (corrected): `?page=N` always means exactly page N,
    // for every caller — Continue Reading (which builds its link FROM
    // saved progress, so this is already the resume target), the
    // Normal Reader's "Open in AI Tutor at this page" button
    // (app/read/page.tsx), a Bookmark/Note/AI "open page" link, or a
    // hand-typed URL. An earlier version of this code preferred saved
    // progress over the URL's own number whenever any `?page=` was
    // present, which silently sent an explicit page request to a
    // different (saved) page instead — fixed. "Refresh preserves the
    // current page" is instead handled by the URL-sync effect below,
    // which keeps `?page=` itself up to date as the user navigates, so
    // by the time a refresh happens this exact rule already reproduces
    // the right page from the URL alone.
    const clamped = Math.min(Math.max(1, Math.floor(urlPage)), totalPages || urlPage);
    return snapSpreadCursor(clamped, currentBook.layout);
  });
  const [bookOpened, setBookOpened] = useState(() => {
    const urlPage = Number(searchParams.get("page"));
    return Number.isFinite(urlPage) && urlPage >= 1;
  });
  const [bookOpening, setBookOpening] = useState(false);

  // ── Reading-progress persistence readiness ───────────────────────────
  // Sticky "safe to persist" latch for the reading-progress effect below.
  // Mirrors `bookOpened`'s own initial value, since both are resolved from
  // the identical `?page=` check: true immediately for a deep-link open
  // (Continue Reading, a bookmark/note/AI "open page" link, or a
  // hand-typed URL) — that position is already genuine, and persisting it
  // right away is required so Continue Reading's own resume page stays
  // reinforced rather than silently dropped. False for a plain cover
  // click, which always lands on page 1 by definition (see
  // openBookWithAnimation below) — NOT yet real progress, so it must not
  // be saved merely because the book was opened. It flips true the first
  // time the persistence effect actually runs for a false start — i.e. on
  // the very next `readerPage` change from real navigation — so mounting
  // or opening the cover can never itself write anything, but every
  // genuine page turn after that (including one that lands back on page
  // 1) persists normally.
  const hasEngagedRef = useRef(bookOpened);

  // ── Shared "current book" pointer for Return to Book (Phase G-2B) ───
  // Additive only — does not touch zoom, fullscreen, selection, AI
  // Companion, or Study Workspace persistence below.
  useEffect(() => {
    if (!bookId || !totalPages) return;
    saveCurrentBook({
      route: "/reader-premium",
      bookId,
      title: currentBook.title,
      page: readerPage,
      source: isUploadedBook ? "upload" : undefined,
    });
  }, [bookId, readerPage, currentBook.title, totalPages, isUploadedBook]);

  // ── Phase C1F: per-book reading-progress persistence (Continue Reading)
  // One centralized effect tied to the confirmed current page, rather
  // than a storage write in every navigation handler — Previous/Next,
  // the page input/slider, Go to Page, and jump-to-page from Notes/
  // Bookmarks/Study Workspace all already funnel through setReaderPage
  // (see navigateToPdfPage/goToPage/studyJumpToPage), so watching
  // `readerPage` here alone captures every one of them for free.
  //
  // Gated on `bookOpened`: the cover screen, a book still being resolved,
  // or the PDF still loading all leave `readerPage` at its initial value
  // (often 1) without the user having genuinely opened the book yet —
  // `bookOpened` only becomes true once they actually have (a real click,
  // or a valid `?page=` deep link).
  //
  // That alone isn't enough, though: a PLAIN cover click also flips
  // `bookOpened` true while `readerPage` is still sitting at its untouched
  // default (1) — confirmed live to otherwise fire this effect on that
  // exact commit and silently overwrite real saved progress with page 1
  // the instant the user merely opens the book. `hasEngagedRef` guards
  // against exactly that: for a plain cover open it's false, so the first
  // run here is skipped (and the latch flips true) rather than persisted;
  // the next `readerPage` change — an actual page turn — persists
  // normally, same as always. For a deep-link open (Continue Reading, a
  // bookmark/note/AI "open page" link) `hasEngagedRef` already starts
  // true, since that position is genuine from the moment it renders, so
  // it persists immediately with no skip — required so Continue Reading's
  // own resume page stays reinforced rather than silently dropped.
  useEffect(() => {
    if (!bookOpened || !bookId || !totalPages) return;
    if (!hasEngagedRef.current) {
      hasEngagedRef.current = true;
      return;
    }
    saveReadingProgress(bookId, readerPage, totalPages);
  }, [bookOpened, bookId, readerPage, totalPages]);

  // ── Phase C1F fix: keep the URL's own `page` in sync with `readerPage`
  // while the book is open. This is what makes "an explicit ?page= link
  // always wins" (restored above) compatible with "refresh preserves the
  // current page": the URL is updated live as the user turns pages, via
  // `router.replace` (shallow — no new history entry per page turn, no
  // server round-trip for this client page), so by the time a refresh
  // happens the address bar already says the page the user is actually
  // on, and the plain "honor ?page= exactly" rule above reproduces it
  // correctly with no separate saved-progress lookup needed here.
  //
  // Reads `window.location` directly (not the reactive `searchParams`
  // hook) purely to decide whether a replace is even needed — this
  // effect's own deps never include `searchParams`, so the URL update it
  // triggers can't cause it to re-fire itself.
  useEffect(() => {
    if (!bookOpened || !bookId) return;
    const params = isUploadedBook
      ? new URLSearchParams({ source: "upload", id: bookId, page: String(readerPage) })
      : new URLSearchParams({ book: bookId, page: String(readerPage) });
    const next = `${pathname}?${params.toString()}`;
    if (typeof window !== "undefined" && window.location.pathname + window.location.search === next) return;
    router.replace(next, { scroll: false });
  }, [bookOpened, bookId, readerPage, isUploadedBook, pathname, router]);

  // ── RC1 P0 fix #1 (book switching bug) ───────────────────────────────
  // Root cause: `readerPage`/`bookOpened` above are seeded via lazy
  // useState initializers, which — by React's own contract — run EXACTLY
  // ONCE per component instance, on its very first render. Next.js App
  // Router reuses the SAME PremiumReaderPreviewContent instance across a
  // book-to-book navigation that stays on the /reader-premium route
  // (only `?book=` changes) — e.g. a "Continue Reading"/related-book
  // link tapped from inside an already-open reader, or any client-side
  // <Link> to another book. `bookId`/`currentBook` themselves are
  // recomputed fresh every render directly from `searchParams` (lines
  // 352-374 above), so the correct PDF/document/title were never
  // actually wrong — but `readerPage` kept whatever value the PREVIOUS
  // book had left it at, and `pageTexts` (below) is keyed by bare page
  // number, so the previous book's cached page text bled into the new
  // book's "page N" the instant the AI or Read Aloud used it. Together
  // these are exactly what "switching books frequently shows the wrong
  // one" looks like from the outside: PDF pages that don't match the
  // title, or AI answers describing the wrong book's content. The
  // MobilePdfPage `key={bookId:pdf}` remount (elsewhere in this file)
  // already made the canvas/document side of this correct — this effect
  // is what was still missing on the plain React state side. Runs only
  // when `bookId` actually changes (tracked via a ref, not react to its
  // own effect deps in a loop) — never on first mount, since the lazy
  // initializers already handle that case correctly.
  const lastBookIdRef = useRef(bookId);
  useEffect(() => {
    if (lastBookIdRef.current === bookId) return;
    lastBookIdRef.current = bookId;

    const urlPage = Number(searchParams.get("page"));
    const hasExplicitPage = Number.isFinite(urlPage) && urlPage >= 1;
    const clamped = hasExplicitPage
      ? Math.min(Math.max(1, Math.floor(urlPage)), totalPages || urlPage)
      : 1;
    setReaderPage(snapSpreadCursor(clamped, currentBook.layout));
    setBookOpened(hasExplicitPage);
    hasEngagedRef.current = hasExplicitPage;

    // Zoom/pan are reading-position state, same category as page number
    // — a new book should never inherit the previous one's zoom level
    // or pan offset.
    setZoom(100);
    setPan({ x: 0, y: 0 });
    autoFitDone.current = false;

    // Page-number-keyed caches must not leak between books — pageTexts
    // is keyed by bare page number (not `${bookId}:${page}`), so
    // "page 5" of the old book would otherwise still answer for
    // "page 5" of the new one until every page had been re-visited.
    setPageTexts({});
  }, [bookId, searchParams, totalPages, currentBook.layout]);

  // ── Zoom / pan ────────────────────────────────────────────────────
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const bookAreaRef = useRef<HTMLDivElement>(null);
  // Real-device gesture fix: tracks whether the div carrying
  // `bookAreaRef` is actually mounted right now — this div only exists
  // in the JSX once the book cover animation has finished (see the
  // `bookOpening`/`!bookOpened` early returns further down), so a plain
  // `useRef` gives no signal for "the element just appeared." Wiring
  // this from a ref CALLBACK (see `setBookAreaNode` below, used as the
  // div's `ref` prop instead of `bookAreaRef` directly) lets the
  // pointer-listener effect re-run at the exact moment the real element
  // mounts, instead of inferring mount timing from an unrelated value.
  const [bookAreaMounted, setBookAreaMounted] = useState(false);
  const setBookAreaNode = useCallback((node: HTMLDivElement | null) => {
    bookAreaRef.current = node;
    setBookAreaMounted(!!node);
  }, []);
  const autoFitDone = useRef(false);

  // ── Phase C3: layout state (visual/interaction redesign only — none
  // of this touches PDF rendering, page logic, zoom logic, or AI
  // request logic; it only decides how much space the AI panel takes
  // and whether the book-info panel/fullscreen chrome show). ─────────
  const AI_PANEL_COMPACT_KEY = "ndl_reader_ai_panel_compact";
  const AI_PANEL_EXPANDED_PX = 400;
  // Icon-only rail — AI icon + expand button, nothing else — so the
  // reader immediately gets the freed width back instead of a mostly-
  // empty 280px panel.
  const AI_PANEL_COMPACT_PX = 76;
  const [aiPanelCompact, setAiPanelCompact] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  // Own lightweight fullscreen tracking (PremiumReaderLayout tracks its
  // own copy too, purely for its exit-button/idle-hide chrome) — this
  // copy exists only so `center` (built here) can swap in the floating
  // fullscreen bottom bar instead of the normal one.
  const [isFullscreenLayout, setIsFullscreenLayout] = useState(false);
  const layoutRef = useRef<PremiumReaderLayoutHandle>(null);
  const wasFullscreenRef = useRef(false);
  // Final mobile polish point 3: iOS Safari has no Fullscreen API support
  // at all (document.fullscreenEnabled is false there) — the mobile More
  // sheet's Fullscreen button hides itself rather than sit there doing
  // nothing. Defaults to true (matches the toggleFullscreen call it
  // already had) until the client-only check below runs, so nothing
  // flashes hidden-then-shown on a supported browser.
  const [fullscreenSupported, setFullscreenSupported] = useState(true);
  // Tracks viewport width for responsive behavior only (never touches
  // reader/PDF logic) — tablet gets a narrower/compact AI panel by
  // default, mobile additionally renders it as a full-height overlay
  // instead of a permanent column so the book keeps the full width.
  const [viewportWidth, setViewportWidth] = useState(1280);
  // Final mobile polish point 2: viewport HEIGHT, tracked alongside width
  // so a touch device can be classified by its short edge (see
  // isMobileViewport below) instead of raw width alone — a phone rotated
  // to landscape has a wide `innerWidth` but its short edge (now the
  // height) is still phone-sized, which is what should decide the UI.
  const [viewportHeight, setViewportHeight] = useState(800);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AI_PANEL_COMPACT_KEY);
      if (stored !== null) setAiPanelCompact(stored === "true");
      else setAiPanelCompact(window.innerWidth < 1024); // tablet/mobile default
    } catch { /* ignore */ }
    function onFsChange() { setIsFullscreenLayout(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", onFsChange);
    setFullscreenSupported(!!document.fullscreenEnabled);
    setViewportWidth(window.innerWidth);
    setViewportHeight(window.innerHeight);
    function onResize() { setViewportWidth(window.innerWidth); setViewportHeight(window.innerHeight); }
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  // Final mobile polish point 2: a touch device (phone) rotating to
  // landscape must keep the mobile UI — width alone used to flip it to
  // the desktop layout the moment innerWidth crossed 640px, which is
  // exactly what happens on every phone in landscape. For a touch
  // device, classify by the SHORTER of the two dimensions instead (the
  // device's physical short edge, which doesn't change with rotation);
  // a tablet's short edge is still well above 640px so it correctly
  // stays on the desktop/tablet layout in both orientations. Non-touch
  // devices (a mouse-only desktop browser, including one resized
  // narrow for testing) keep the exact previous width-only check —
  // this only changes behavior for touch devices, so "desktop
  // unchanged" holds for every non-touch environment.
  const isTouchDevice = typeof navigator !== "undefined" && (navigator.maxTouchPoints > 0 || (typeof window !== "undefined" && "ontouchstart" in window));
  const isMobileViewport = isTouchDevice
    ? Math.min(viewportWidth, viewportHeight) < 640
    : viewportWidth < 640;
  // RC1 P2: landscape specifically — wide edge is now the CSS width
  // (viewportWidth), short edge the height, so a simple width>height
  // check on top of isMobileViewport identifies "phone, rotated
  // sideways" without touching the short-edge classification above.
  const isMobileLandscape = isMobileViewport && viewportWidth > viewportHeight;
  // Landscape fit-width follow-up: which zoom range is actually in
  // effect right now — read at every call site that clamps/steps zoom
  // (the pinch handler, the landscape More panel's +/− buttons) instead
  // of the raw ZOOM_MIN/MAX constants, which stay the portrait/desktop
  // values unchanged.
  const effectiveZoomMin = isMobileLandscape ? ZOOM_MIN_LANDSCAPE : ZOOM_MIN;
  const effectiveZoomMax = isMobileLandscape ? ZOOM_MAX_LANDSCAPE : ZOOM_MAX;

  // Landscape fit-width follow-up: "start at the top of the page… when
  // entering landscape" plus keeping `zoom` (shared with portrait) from
  // ever landing below landscape's new 100% floor — e.g. a user at 70%
  // in portrait who then rotates would otherwise render BELOW fit-width
  // and reintroduce the exact gutters this task removes.
  useEffect(() => {
    if (!isMobileLandscape) return;
    setPan({ x: 0, y: 0 });
    setZoom((z) => (z < ZOOM_MIN_LANDSCAPE ? ZOOM_MIN_LANDSCAPE : z));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileLandscape]);

  // ── Phase C1: mobile toolbar "More" sheet ────────────────────────────
  // Below 640px the top chrome collapses from 2 flex-wrap rows (5 visual
  // rows once wrapped) into 2 fixed rows, with the less-frequently-used
  // controls (Fit, Go-to-page, Text/Image select, Language) moved into
  // this bottom sheet. Every control from the original strip still
  // exists somewhere — nothing was removed, only regrouped. Desktop/
  // tablet (isMobileViewport === false) render the original strip
  // unchanged and never touch this state.
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  // Phase D3 point 4: page strip sheet, opened by tapping the header's
  // page-indicator badge. Numbered jump list (same convention/cap as
  // app/read/page.tsx's existing THUMBNAIL_LIMIT=30 thumbnail sidebar) —
  // there's no rendered-bitmap-thumbnail pipeline anywhere in this app to
  // reuse, so this reuses the existing goToPage() navigation primitive
  // and printed-page labels instead of building new page-rendering.
  const [pageStripOpen, setPageStripOpen] = useState(false);
  const PAGE_STRIP_LIMIT = 30;

  // ── Phase D3: immersive mode (replaces D1's idle-timer auto-hide) ────
  // D1 faded chrome out after a few seconds idle; D3's spec is explicit
  // tap-to-toggle instead (Kindle/Books convention), so the idle timer
  // and its window-level listeners are gone — visibility is now driven
  // entirely by the single-tap gesture handler below (handleGestureUp).
  // Desktop/tablet never touch mobileChromeVisible at all (always true,
  // unused by their own JSX branch).
  const [mobileChromeVisible, setMobileChromeVisible] = useState(true);
  const mobileChromeCls = mobileChromeVisible
    ? "opacity-100 pointer-events-auto"
    : "opacity-0 pointer-events-none";

  // RC1 P2: auto-hide chrome after inactivity, landscape only. D3
  // deliberately dropped the old idle timer in favor of tap-only
  // (comment above) for the general/portrait case — that stays exactly
  // as-is. Landscape is a narrower, explicitly-requested exception:
  // "still feels desktop-like… auto-hide chrome after inactivity, tap
  // restores controls." Reuses mobileChromeVisible/setMobileChromeVisible
  // (the same state the tap gesture already drives), so "tap restores
  // controls" needs no new code — finishTapOrSwipe's existing plain-tap
  // branch already flips this same state back to visible.
  const LANDSCAPE_AUTOHIDE_MS = 3000;
  const landscapeIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isMobileLandscape) {
      // Leaving landscape (rotated back to portrait, or navigated away):
      // never leave the reader stuck with hidden chrome on a mode that
      // has no auto-restore of its own.
      if (landscapeIdleTimerRef.current) { clearTimeout(landscapeIdleTimerRef.current); landscapeIdleTimerRef.current = null; }
      setMobileChromeVisible(true);
      return;
    }
    // True immersive landscape: "no controls visible initially" — starts
    // hidden immediately rather than visible-then-fade-after-3s. A tap
    // (finishTapOrSwipe's plain-tap branch) reveals them; this timer's
    // job from then on is only to re-hide after a further idle period.
    setMobileChromeVisible(false);
    function resetIdleTimer() {
      if (landscapeIdleTimerRef.current) clearTimeout(landscapeIdleTimerRef.current);
      landscapeIdleTimerRef.current = setTimeout(() => setMobileChromeVisible(false), LANDSCAPE_AUTOHIDE_MS);
    }
    // touchstart/touchmove cover real devices; mousedown/mousemove keep
    // this working under mouse-only testing/input, same dual-path
    // reasoning as the gesture system above.
    window.addEventListener("touchstart", resetIdleTimer, { passive: true });
    window.addEventListener("touchmove", resetIdleTimer, { passive: true });
    window.addEventListener("mousedown", resetIdleTimer);
    window.addEventListener("mousemove", resetIdleTimer);
    return () => {
      window.removeEventListener("touchstart", resetIdleTimer);
      window.removeEventListener("touchmove", resetIdleTimer);
      window.removeEventListener("mousedown", resetIdleTimer);
      window.removeEventListener("mousemove", resetIdleTimer);
      if (landscapeIdleTimerRef.current) { clearTimeout(landscapeIdleTimerRef.current); landscapeIdleTimerRef.current = null; }
    };
  }, [isMobileLandscape]);

  // True immersive landscape: mirrors mobileChromeCls onto <html> so the
  // portaled FloatingControlsDock (Accessibility ♿ / Voice 🎙️ triggers —
  // rendered outside this component's own subtree, see PremiumReader
  // Layout's fullscreen comment for why it's portaled) hides on the same
  // schedule as every other control here, without touching that
  // component's own logic (see app/globals.css's
  // html[data-ndl-immersive-hidden] rule — presentation-only).
  useEffect(() => {
    const hidden = isMobileLandscape && !mobileChromeVisible;
    if (hidden) document.documentElement.setAttribute("data-ndl-immersive-hidden", "true");
    else document.documentElement.removeAttribute("data-ndl-immersive-hidden");
    return () => { document.documentElement.removeAttribute("data-ndl-immersive-hidden"); };
  }, [isMobileLandscape, mobileChromeVisible]);

  // Landscape accessibility fix: the Accessibility glass panel is
  // portaled outside this component's own subtree (see
  // AccessibilityToolbar's ndl-accessibility-panel-state comment), so
  // this is the only way the gesture layer below can know it's open —
  // needed so a drag/tap INSIDE the panel (e.g. a slider) can never also
  // register as a swipe/page-turn/long-press on the reader underneath.
  const accessibilityPanelOpenRef = useRef(false);
  useEffect(() => {
    function onState(e: Event) {
      accessibilityPanelOpenRef.current = !!(e as CustomEvent<{ open: boolean }>).detail?.open;
    }
    window.addEventListener("ndl-accessibility-panel-state", onState);
    return () => window.removeEventListener("ndl-accessibility-panel-state", onState);
  }, []);

  // ── True immersive landscape: best-effort Fullscreen API request ──────
  // Browsers only grant Element.requestFullscreen() during a real user
  // gesture — an orientationchange event does NOT count as one, so a
  // page can't reliably go fullscreen automatically the instant it
  // rotates. Real flow implemented here: the first genuine tap the user
  // makes while in landscape (finishTapOrSwipe's plain-tap branch, which
  // already reveals chrome) ALSO doubles as that required activation and
  // triggers one fullscreen request for the whole session — never
  // repeated automatically afterward (hasAutoRequestedFullscreenRef), so
  // there's no repeated permission nagging. The explicit Fullscreen
  // button in the More sheet (already existed) is untouched and can
  // still be used any time by the user directly. requestFullscreen()
  // returns a Promise that rejects (not throws) when activation/
  // permission rules block it — every call site below is wrapped so a
  // rejection is swallowed, never surfaced as an unhandled rejection.
  const hasAutoRequestedFullscreenRef = useRef(false);
  // Final mobile cleanup: feeds the Home Screen hint below — "Safari has
  // rejected or cannot provide fullscreen" needs an actual signal, not
  // just an assumption. Sets on either a rejected requestFullscreen()
  // Promise or a `fullscreenerror` event; the hint's own visibility
  // condition also checks `!fullscreenSupported` separately for the
  // "cannot provide it at all" half of that same requirement.
  const [fullscreenDenied, setFullscreenDenied] = useState(false);
  function requestImmersiveFullscreenOnce() {
    if (!isMobileLandscape || !fullscreenSupported) return;
    if (hasAutoRequestedFullscreenRef.current) return;
    if (document.fullscreenElement) return;
    hasAutoRequestedFullscreenRef.current = true;
    try {
      const maybePromise = document.documentElement.requestFullscreen();
      if (maybePromise && typeof (maybePromise as Promise<void>).catch === "function") {
        (maybePromise as Promise<void>).catch(() => setFullscreenDenied(true));
      }
    } catch { setFullscreenDenied(true); }
  }
  useEffect(() => {
    function onFullscreenError() { setFullscreenDenied(true); }
    // Best-effort re-attempt on rotation — most browsers will reject this
    // one too (no fresh activation from an orientationchange), but iOS/
    // Android occasionally still honor it within a short window after a
    // real prior tap; rejection is swallowed the same way either way.
    function onOrientationChange() {
      hasAutoRequestedFullscreenRef.current = false;
      requestImmersiveFullscreenOnce();
    }
    document.addEventListener("fullscreenerror", onFullscreenError);
    window.addEventListener("orientationchange", onOrientationChange);
    return () => {
      document.removeEventListener("fullscreenerror", onFullscreenError);
      window.removeEventListener("orientationchange", onOrientationChange);
    };
  }, []);

  // ── Final mobile cleanup: honest "Add to Home Screen" hint ────────────
  // Real Safari tabs/URL bar cannot be force-hidden by a web page — the
  // Fullscreen API above is the best a normal tab visit can do, and even
  // that needs a fresh user gesture Safari sometimes still declines. The
  // ONLY way to get a truly chrome-free view is the user adding this app
  // to their Home Screen (standalone launch, see app/layout.tsx's
  // appleWebApp meta) — this hint says so honestly instead of implying
  // rotation alone should have removed Safari's UI. Shown once, only
  // when it's actually true (not fullscreen, not standalone, and either
  // fullscreen isn't supported at all or a real attempt was rejected),
  // and never again after the user dismisses it (localStorage, not just
  // component state, so it survives navigating away and back).
  const HOME_SCREEN_HINT_DISMISSED_KEY = "ndl-home-screen-hint-dismissed";
  const [homeScreenHintDismissed, setHomeScreenHintDismissed] = useState(true);
  const [standaloneMode, setStandaloneMode] = useState(false);
  useEffect(() => {
    try { setHomeScreenHintDismissed(localStorage.getItem(HOME_SCREEN_HINT_DISMISSED_KEY) === "true"); } catch { /* ignore */ }
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(display-mode: standalone)");
    setStandaloneMode(mql.matches);
    function onChange() { setStandaloneMode(mql.matches); }
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  function dismissHomeScreenHint() {
    setHomeScreenHintDismissed(true);
    try { localStorage.setItem(HOME_SCREEN_HINT_DISMISSED_KEY, "true"); } catch { /* ignore */ }
  }
  const showHomeScreenHint =
    isMobileLandscape && !isFullscreenLayout && !standaloneMode && !homeScreenHintDismissed &&
    (!fullscreenSupported || fullscreenDenied);

  // ── Phase D3: mobile-only tap/swipe/long-press gesture layer ─────────
  // Deliberately NOT a second set of onTouch* listeners — this app
  // already routes mobile touch through the same onMouseDown/Move/Up
  // props as desktop drag-pan (see the `touchAction: "none"` on
  // bookAreaRef below, which is what makes that compat-event path the
  // ONLY pointer path on mobile). So gesture detection is composed
  // ALONGSIDE the existing onCenterMouseDown/Move/Up + handleMouseUp
  // calls in the JSX below (never replacing them), gated by
  // isMobileViewport so desktop's identical existing behavior is
  // untouched byte-for-byte. One shared ref carries the gesture's start
  // point/time/zone; a single mouseup classifies it as exactly one of:
  // swipe-up (bottom zone) → AI sheet, swipe-down (top zone) → Reading
  // panel, long-press-on-selection → Context AI, or plain tap → toggle
  // immersive mode. Never fires if a button/input was the target, if a
  // text/image-select drag is in progress, or if the movement was large
  // enough to be an ordinary pan.
  const GESTURE_TAP_MAX_MOVE = 10;
  const GESTURE_TAP_MAX_MS = 400;
  const GESTURE_LONGPRESS_MS = 500;
  const GESTURE_LONGPRESS_MAX_MOVE = 10;
  const SWIPE_MIN_DISTANCE = 70;
  const SWIPE_MAX_MS = 700;
  const SWIPE_ZONE_FRACTION = 0.22;
  const gestureStartRef = useRef<{ x: number; y: number; time: number; zone: "top" | "bottom" | null; onControl: boolean } | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);

  function isInteractiveTarget(target: EventTarget | null): boolean {
    let node = target as HTMLElement | null;
    while (node) {
      if (["BUTTON", "INPUT", "SELECT", "A", "TEXTAREA"].includes(node.tagName)) return true;
      node = node.parentElement;
    }
    return false;
  }

  // Real-device fix 6 (mobile text/image selection): the press-region
  // half-extents used to seed a long-press selection when none already
  // exists — a "paragraph-sized" chunk around the finger, not the whole
  // page. Clamped to the canvas bounds by cropCanvasRegion itself.
  const LONGPRESS_REGION_HALF_W = 130;
  const LONGPRESS_REGION_HALF_H = 90;

  // Real-device fix 6: long-press with no existing selection captures a
  // small region around the press point via cropCanvasRegion — the EXACT
  // same helper (and canvas[data-pdf-page] query) desktop's drag-select
  // already uses, so this is not a new PDF/rendering capability, just a
  // second way to produce the start/end points it expects. From there it
  // reuses desktop's own no-native-selection OCR fallback (callAskAI with
  // an "extract readable text" prompt) verbatim. If OCR comes back with
  // real text, that becomes a "text" activeSelection (long-press text →
  // text selection); if OCR comes back empty, the region is treated as a
  // picture instead and becomes an "image" activeSelection (long-press
  // image → image selection) — the same crop data, just routed the other
  // way. Either way this only ever POPULATES activeSelection/
  // interactionMode; the existing "UNIFIED FLOATING MENU" (already in
  // this file) is what actually renders the on-screen menu and runs
  // Explain/Summarize/etc. — no new selection UI, no new AI logic.
  async function tryLongPressSelection(x: number, y: number) {
    const start = { x: x - LONGPRESS_REGION_HALF_W, y: y - LONGPRESS_REGION_HALF_H };
    const end = { x: x + LONGPRESS_REGION_HALF_W, y: y + LONGPRESS_REGION_HALF_H };
    const targetPage = resolveInteractionPageNumber(x, y);
    const cropped = cropCanvasRegion(start, end, targetPage);
    if (!cropped) return;

    const sel = window.getSelection();
    const selText = sel?.toString().trim() || "";
    if (selText.length >= 2 && selText.length <= 1200) {
      switchInteractionMode("text");
      setSelectionRects([]);
      setActiveSelection({ type: "text", id: Date.now().toString(), text: selText, pageNumber: targetPage, x, y });
      return;
    }

    setAiLoading(true);
    setAiResponse(t.premiumReaderExtractingRegion);
    try {
      const ocrText = await callAskAI(
        "Extract all readable text from this image region exactly as it appears. " +
        "Return ONLY the extracted text, preserving line breaks and spacing. " +
        "No explanation, no commentary, no formatting — just the text.",
        book, targetPage,
        `Image region from ${pageDescription(targetPage)} of "${book}".`,
        language, cropped.dataUrl,
        "Selected Region"
      );
      const cleaned = ocrText.trim();
      if (cleaned.length > 1) {
        switchInteractionMode("text");
        setSelectionRects([cropped.rect]);
        setActiveSelection({ type: "text", id: Date.now().toString(), text: cleaned, pageNumber: targetPage, x, y });
        setAiResponse(t.premiumReaderTextExtracted);
      } else {
        // No readable text in this region — treat it as a picture instead
        // (same crop data, "image" selection now) rather than a dead end.
        switchInteractionMode("image");
        setCapturedImageRect(cropped.rect);
        setActiveSelection({ type: "image", id: Date.now().toString(), imageData: cropped.dataUrl, pageNumber: targetPage });
        setAiResponse("");
      }
    } catch {
      setAiResponse(t.premiumReaderExtractionFailed);
    } finally {
      setAiLoading(false);
    }
  }

  // Pulled out of handleGestureDown so the pointer-event path
  // (handlePointerDown below) can arm the exact same gesture — zone
  // detection, long-press timer, everything — from a plain {x,y} instead
  // of a React.MouseEvent, without duplicating the logic. `onFire` is an
  // optional hook the pointer path uses to update the temporary gesture
  // debug overlay when the long-press timer actually fires; the mouse
  // path below doesn't pass one.
  function startGesture(x: number, y: number, onControl: boolean, onFire?: () => void) {
    const vh = window.innerHeight;
    const zone: "top" | "bottom" | null =
      y < vh * SWIPE_ZONE_FRACTION ? "top"
      : y > vh * (1 - SWIPE_ZONE_FRACTION) ? "bottom"
      : null;
    gestureStartRef.current = { x, y, time: Date.now(), zone, onControl };
    longPressFiredRef.current = false;
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    if (onControl) return;
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      onFire?.();
      if (activeSelection?.type === "text") { handleSelectionAction("explain"); return; }
      if (!activeSelection) tryLongPressSelection(x, y);
    }, GESTURE_LONGPRESS_MS);
  }

  function handleGestureDown(e: React.MouseEvent) {
    // Real-device gesture safety: never arm a gesture while a locally-
    // rendered sheet (More / Contents / page strip / Read menu / chapter-
    // unavailable / resume prompt) is open, or while the Accessibility
    // (Reading Options) panel is open — that panel is portaled outside
    // this subtree, so accessibilityPanelOpenRef (fed by
    // AccessibilityToolbar's ndl-accessibility-panel-state broadcast) is
    // the only way this handler can know about it.
    //
    // P0 regression fix: readMenuOpen/chapterUnavailableOpen/
    // resumePromptPage were missing from this list — a tap on the Read
    // menu's backdrop (or the dialogs' backdrop) is a plain <div>, which
    // isInteractiveTarget doesn't recognize as a control, so without this
    // guard the tap fell through to normal gesture handling instead
    // (arming a pan/long-press or, on a plain tap, toggling immersive
    // chrome back on via finishTapOrSwipe) — the backdrop's own onClick
    // never got a chance to run because the touch's default action had
    // already been claimed by the gesture layer, so the menu never
    // closed and every subsequent tap kept re-hitting the same stuck
    // full-viewport backdrop.
    if (mobileMoreOpen || contentsOpen || pageStripOpen || accessibilityPanelOpenRef.current
      || readMenuOpen || chapterUnavailableOpen || resumePromptPage !== null) { gestureStartRef.current = null; return; }
    if (interactionMode !== "none") { gestureStartRef.current = null; return; }
    startGesture(e.clientX, e.clientY, isInteractiveTarget(e.target));
  }

  function handleGestureMove(e: React.MouseEvent) {
    const start = gestureStartRef.current;
    if (!start || longPressFiredRef.current || !longPressTimerRef.current) return;
    const dx = Math.abs(e.clientX - start.x);
    const dy = Math.abs(e.clientY - start.y);
    if (dx > GESTURE_LONGPRESS_MAX_MOVE || dy > GESTURE_LONGPRESS_MAX_MOVE) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  // RC1 P0 fix #2: extracted so both the mouse-based path (handleGestureUp
  // below) and the new native-touch path (finishTouchGesture further down)
  // classify a finished single-pointer gesture identically — one source
  // of truth for the swipe/tap thresholds instead of two copies that
  // could drift.
  function finishTapOrSwipe(start: { x: number; y: number; time: number; zone: "top" | "bottom" | null }, endX: number, endY: number) {
    const dx = endX - start.x;
    const dy = endY - start.y;
    const dt = Date.now() - start.time;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    const mostlyVertical = absDy > absDx * 1.5;

    // Swipe UP from the lower part of the screen → open the AI sheet.
    // "If already open: Ignore" — aiPanelCompact is only true when closed.
    if (start.zone === "bottom" && dy < -SWIPE_MIN_DISTANCE && mostlyVertical && dt < SWIPE_MAX_MS) {
      if (aiPanelCompact) setAiPanelCompact(false);
      return;
    }
    // Swipe DOWN from the upper part of the screen → open the Reading
    // (Accessibility glass) panel — same event AccessibilityToolbar
    // already listens for (D1/D2), no new open mechanism.
    if (start.zone === "top" && dy > SWIPE_MIN_DISTANCE && mostlyVertical && dt < SWIPE_MAX_MS) {
      window.dispatchEvent(new Event("ndl-open-accessibility-panel"));
      return;
    }

    // Horizontal swipe → page turn. Reuses goPrev/goNext verbatim (the
    // same functions the arrow buttons call). Not zone-restricted like
    // the vertical swipes. Gated to zoom<=105% — RC1 P0 fix #3 requires
    // swipe page-turn disabled above 100% zoom so it never fights
    // one-finger panning; the native-touch path additionally never even
    // reaches this function while zoomed (it diverts to panning at
    // touchstart), this check is what keeps the mouse-based fallback
    // path consistent with the same rule.
    const mostlyHorizontal = absDx > absDy * 1.5;
    if (zoom <= 105 && mostlyHorizontal && absDx > SWIPE_MIN_DISTANCE && dt < SWIPE_MAX_MS) {
      if (dx < 0) goNext(); else goPrev();
      return;
    }

    // Plain tap → toggle immersive mode. Entering immersive mode also
    // closes any open glass panel (More sheet + Accessibility glass),
    // per spec point 1's "Glass panels close if open."
    if (absDx <= GESTURE_TAP_MAX_MOVE && absDy <= GESTURE_TAP_MAX_MOVE && dt <= GESTURE_TAP_MAX_MS) {
      // This tap is a genuine user gesture — the one moment browsers will
      // actually grant Element.requestFullscreen() — see the file-top
      // comment on requestImmersiveFullscreenOnce for the full flow.
      requestImmersiveFullscreenOnce();
      setMobileChromeVisible(v => {
        const next = !v;
        if (!next) {
          setMobileMoreOpen(false);
          window.dispatchEvent(new Event("ndl-close-accessibility-panel"));
        }
        return next;
      });
    }
  }

  function handleGestureUp(e: React.MouseEvent) {
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    const start = gestureStartRef.current;
    gestureStartRef.current = null;
    if (!start || start.onControl || longPressFiredRef.current || interactionMode !== "none") return;
    finishTapOrSwipe(start, e.clientX, e.clientY);
  }

  // ── Real-device gesture fix: Pointer Events, correctly-mounted target ──
  //
  // WHY THE PREVIOUS (touch-event) IMPLEMENTATION NEVER FIRED ON A REAL
  // IPHONE: the listener-attach effect keyed off `[isMobileViewport]`
  // alone. `isMobileViewport` is derived purely from viewport size and is
  // already `true` the moment the reader route mounts — well before the
  // user has tapped to open the book. But the div carrying
  // `ref={bookAreaRef}` doesn't exist in the tree yet at that point:
  // `bookOpening`/`!bookOpened` both early-return `<BookOpeningAnimation>`
  // / `<BookCover>` instead (see below, near the component's final
  // return). So the effect ran exactly once, read `bookAreaRef.current`
  // as `null`, and bailed out. Once the user tapped the cover and the
  // real element mounted, `isMobileViewport` hadn't changed value, so the
  // effect's dependency array gave React no reason to re-run it — the
  // listeners were simply never attached, on every real session. (The
  // Explore-agent investigation this round also checked: no competing
  // global touch-action rule, no viewport-meta restriction, no stray
  // pointer-events:auto overlay sitting over the book area, and no
  // passive/non-passive mismatch anywhere else — this was the sole
  // cause.) Fixed by tracking actual DOM mount/unmount via a ref
  // callback (`setBookAreaNode` below, wired to `bookAreaMounted` state)
  // instead of inferring it from an unrelated value.
  //
  // Also switched the event source from raw touchstart/move/end/cancel to
  // Pointer Events (pointerdown/move/up/cancel), as requested: one
  // consistent model (supported on iOS Safari 13+) with built-in
  // pointerId tracking, so "how many fingers are down right now" is a
  // plain Map instead of re-deriving it from a TouchList every time.
  // Filtered to pointerType "touch"/"pen" only — real mouse input still
  // goes through the separate onCenterMouseDown/Move/Up + handleGesture
  // Down/Move/Up path below unchanged, so the two systems never
  // double-fire for the same input device.
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    startDist: number; startZoom: number;
    // Practical stand-in for the zoom transform's `transform-origin:
    // center center` (see MobilePdfPage's zoomTransform) — the element's
    // own bounding-box center, measured once at pinch start — plus the
    // content-space point that was under the fingers' midpoint at that
    // moment, so subsequent moves can keep that same content point under
    // the fingers ("zoom remains centered around the pinch midpoint
    // where practical").
    cardCenterX: number; cardCenterY: number;
    contentX: number; contentY: number;
  } | null>(null);
  const touchPanRef = useRef<{
    x: number; y: number; px: number; py: number;
    // Landscape fit-width follow-up: true while panning at fit-width
    // (zoom<=105) — the horizontal axis stays pinned (there's no
    // horizontal slack to pan into at fit-width, only vertical), while
    // the EXISTING zoom>100 pan (portrait or landscape) always leaves
    // this false/undefined, panning freely on both axes exactly as
    // before.
    lockX?: boolean;
  } | null>(null);
  // Landscape fit-width follow-up: last known {cssHeight, containerHeight}
  // from MobilePdfPage's onContentMetrics — lets the vertical-pan-at-rest
  // mechanism below clamp to the page's REAL bounds instead of letting
  // the user scroll into blank space past either end. A ref (not state):
  // this is read only during a live gesture, never needs to trigger a
  // render on its own.
  const landscapeContentMetricsRef = useRef<{ cssHeight: number; containerHeight: number } | null>(null);
  const handleLandscapeContentMetrics = useCallback((info: { cssHeight: number; containerHeight: number }) => {
    landscapeContentMetricsRef.current = info;
  }, []);
  function clampLandscapePanY(y: number): number {
    const metrics = landscapeContentMetricsRef.current;
    if (!metrics) return y;
    const maxScroll = Math.max(0, metrics.cssHeight - metrics.containerHeight);
    return Math.min(0, Math.max(-maxScroll, y));
  }

  function pointerDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  // ── Temporary real-device diagnostics (?gestureDebug=1 only) ──────────
  type GestureDebugState = {
    pointerDownCount: number; activePointerCount: number; lastEventType: string;
    startX: number; startY: number; curX: number; curY: number; distance: number;
    gestureState: "idle" | "tap" | "swipe" | "pinch" | "pan" | "longpress";
    zoom: number; listenerMounted: boolean; preventDefaultCalled: boolean;
  };
  // Captured once at mount (lazy initializer), not read reactively from
  // `searchParams` on every render: the reader's own URL-sync effect
  // (further down) rewrites the query string to just `?book=&page=` as
  // soon as the book opens, which would otherwise silently strip
  // `gestureDebug=1` moments after a real device navigated in with it.
  const [gestureDebugEnabled] = useState(() => searchParams.get("gestureDebug") === "1");
  // Same sticky-capture reasoning as gestureDebugEnabled above — the
  // reader's own URL-sync effect would otherwise strip this moments
  // after the book opens.
  const [renderDebugEnabled] = useState(() => searchParams.get("renderDebug") === "1");
  const [debugInfo, setDebugInfo] = useState<GestureDebugState>({
    pointerDownCount: 0, activePointerCount: 0, lastEventType: "none",
    startX: 0, startY: 0, curX: 0, curY: 0, distance: 0,
    gestureState: "idle", zoom: 100, listenerMounted: false, preventDefaultCalled: false,
  });
  const pointerDownCountRef = useRef(0);
  function updateDebug(patch: Partial<GestureDebugState>) {
    if (!gestureDebugEnabled) return;
    setDebugInfo((d) => ({ ...d, ...patch }));
  }

  function handlePointerDown(e: PointerEvent) {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    // P0 regression fix: see the matching comment on handleGestureDown's
    // identical guard above — readMenuOpen/chapterUnavailableOpen/
    // resumePromptPage were missing here too, which is the real-device
    // touch path (this is what an iPhone actually uses).
    if (mobileMoreOpen || contentsOpen || pageStripOpen || accessibilityPanelOpenRef.current
      || readMenuOpen || chapterUnavailableOpen || resumePromptPage !== null) return;
    // Explicit text/image select mode: leave this untouched, exactly as
    // before — it's still driven by the mouse-compat path via
    // onCenterMouseDown/Move (drag-to-select), which real touches still
    // feed as long as this handler doesn't preventDefault them away.
    if (interactionMode !== "none") return;

    const el = e.currentTarget as HTMLElement;
    pointerDownCountRef.current += 1;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { el.setPointerCapture(e.pointerId); } catch { /* not critical */ }

    if (activePointersRef.current.size === 2) {
      e.preventDefault();
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
      gestureStartRef.current = null;
      touchPanRef.current = null;
      const pts = Array.from(activePointersRef.current.values());
      const rect = el.getBoundingClientRect();
      const cardCenterX = rect.left + rect.width / 2;
      const cardCenterY = rect.top + rect.height / 2;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const scale = zoom / 100;
      pinchRef.current = {
        startDist: pointerDistance(pts[0], pts[1]), startZoom: zoom,
        cardCenterX, cardCenterY,
        contentX: (midX - cardCenterX - pan.x) / scale,
        contentY: (midY - cardCenterY - pan.y) / scale,
      };
      updateDebug({
        lastEventType: "pointerdown(2)", gestureState: "pinch", activePointerCount: 2,
        pointerDownCount: pointerDownCountRef.current, zoom, preventDefaultCalled: true,
      });
      return;
    }
    if (activePointersRef.current.size !== 1) return; // 3rd+ finger — ignore entirely

    pinchRef.current = null;
    const onControl = isInteractiveTarget(e.target);
    if (onControl) {
      updateDebug({ lastEventType: "pointerdown(control)", pointerDownCount: pointerDownCountRef.current, activePointerCount: 1 });
      return; // never swallow a real tap on a button/input
    }

    if (zoom > 100) {
      e.preventDefault();
      gestureStartRef.current = null;
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
      touchPanRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      updateDebug({
        lastEventType: "pointerdown(pan)", gestureState: "pan",
        startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY, distance: 0,
        pointerDownCount: pointerDownCountRef.current, activePointerCount: 1, preventDefaultCalled: true,
      });
      return;
    }

    e.preventDefault();
    startGesture(e.clientX, e.clientY, onControl, () => updateDebug({ gestureState: "longpress" }));
    updateDebug({
      lastEventType: "pointerdown", gestureState: "tap",
      startX: e.clientX, startY: e.clientY, curX: e.clientX, curY: e.clientY, distance: 0,
      pointerDownCount: pointerDownCountRef.current, activePointerCount: 1, preventDefaultCalled: true,
    });
  }

  function handlePointerMove(e: PointerEvent) {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    if (!activePointersRef.current.has(e.pointerId)) return;
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinchRef.current && activePointersRef.current.size === 2) {
      e.preventDefault();
      const pts = Array.from(activePointersRef.current.values());
      const dist = pointerDistance(pts[0], pts[1]);
      const ratio = dist / pinchRef.current.startDist;
      const nextZoom = Math.min(effectiveZoomMax, Math.max(effectiveZoomMin, Math.round(pinchRef.current.startZoom * ratio)));
      const scale = nextZoom / 100;
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      setZoom(nextZoom);
      setPan({
        x: midX - pinchRef.current.cardCenterX - pinchRef.current.contentX * scale,
        y: midY - pinchRef.current.cardCenterY - pinchRef.current.contentY * scale,
      });
      updateDebug({
        lastEventType: "pointermove(pinch)", gestureState: "pinch", activePointerCount: 2,
        zoom: nextZoom, curX: midX, curY: midY, distance: dist, preventDefaultCalled: true,
      });
      return;
    }

    // Landscape fit-width follow-up: a fit-width page is very often
    // taller than the landscape viewport, so a vertical drag needs to
    // pan/scroll through it even at 100% (=fit-width) zoom — a state
    // horizontal swipe-to-turn-page and the existing zoom>100 pan (below)
    // never had to share before. Direction-locks the first ~14px of a
    // still-unclassified single-finger gesture: once it's clearly
    // vertical-dominant, hand off to the SAME live-pan mechanism zoom>100
    // already uses (touchPanRef), locked to the vertical axis only
    // (there's no horizontal slack to pan into at fit-width). A genuinely
    // horizontal gesture (page-turn swipe) or a small movement (tap/
    // long-press) is left completely alone, still classified by
    // finishTapOrSwipe at pointerup exactly as before. Portrait/desktop
    // never reach this branch.
    if (isMobileLandscape && zoom <= 105 && gestureStartRef.current && !touchPanRef.current) {
      const gstart = gestureStartRef.current;
      const gdx = Math.abs(e.clientX - gstart.x);
      const gdy = Math.abs(e.clientY - gstart.y);
      if (gdy > 14 && gdy > gdx * 1.3) {
        if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
        gestureStartRef.current = null;
        touchPanRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: clampLandscapePanY(pan.y), lockX: true };
        updateDebug({ lastEventType: "pointermove(vscroll-start)", gestureState: "pan" });
      }
    }

    if (touchPanRef.current) {
      e.preventDefault();
      const start = touchPanRef.current;
      const nextX = start.lockX ? start.px : start.px + (e.clientX - start.x);
      let nextY = start.py + (e.clientY - start.y);
      if (start.lockX) nextY = clampLandscapePanY(nextY);
      setPan({ x: nextX, y: nextY });
      updateDebug({
        lastEventType: "pointermove(pan)", gestureState: "pan",
        curX: e.clientX, curY: e.clientY,
        distance: Math.hypot(e.clientX - start.x, e.clientY - start.y), preventDefaultCalled: true,
      });
      return;
    }

    const start = gestureStartRef.current;
    if (!start) return;
    const dx = Math.abs(e.clientX - start.x);
    const dy = Math.abs(e.clientY - start.y);
    updateDebug({
      lastEventType: "pointermove", curX: e.clientX, curY: e.clientY, distance: Math.hypot(dx, dy),
      gestureState: longPressFiredRef.current ? "longpress" : (Math.hypot(dx, dy) > GESTURE_TAP_MAX_MOVE ? "swipe" : "tap"),
    });
    if (longPressFiredRef.current || !longPressTimerRef.current) return;
    if (dx > GESTURE_LONGPRESS_MAX_MOVE || dy > GESTURE_LONGPRESS_MAX_MOVE) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handlePointerUp(e: PointerEvent) {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    const wasTracked = activePointersRef.current.has(e.pointerId);
    activePointersRef.current.delete(e.pointerId);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* already released */ }

    if (pinchRef.current) {
      if (activePointersRef.current.size < 2) {
        pinchRef.current = null;
        // One finger lifted mid-pinch: hand off to one-finger panning (if
        // still zoomed) instead of just going dead until the next
        // pointerdown — "after pinch, one-finger drag pans."
        if (activePointersRef.current.size === 1 && zoom > 100) {
          const remaining = Array.from(activePointersRef.current.values())[0];
          touchPanRef.current = { x: remaining.x, y: remaining.y, px: pan.x, py: pan.y };
          updateDebug({ lastEventType: "pointerup(pinch->pan)", gestureState: "pan", activePointerCount: 1 });
        } else {
          updateDebug({ lastEventType: "pointerup(pinch-end)", gestureState: "idle", activePointerCount: activePointersRef.current.size });
        }
      }
      return;
    }

    if (touchPanRef.current) {
      touchPanRef.current = null;
      updateDebug({ lastEventType: "pointerup(pan-end)", gestureState: "idle", activePointerCount: activePointersRef.current.size });
      return;
    }

    if (!wasTracked) return; // was on a control (or a 3rd+ finger) — never started a gesture

    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    const start = gestureStartRef.current;
    gestureStartRef.current = null;
    if (!start || start.onControl || longPressFiredRef.current || interactionMode !== "none") {
      updateDebug({ lastEventType: "pointerup(suppressed)", gestureState: "idle", activePointerCount: activePointersRef.current.size });
      return;
    }
    updateDebug({ lastEventType: "pointerup", gestureState: "idle", activePointerCount: activePointersRef.current.size });
    finishTapOrSwipe(start, e.clientX, e.clientY);
  }

  function handlePointerCancel(e: PointerEvent) {
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    activePointersRef.current.delete(e.pointerId);
    pinchRef.current = null;
    touchPanRef.current = null;
    gestureStartRef.current = null;
    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    updateDebug({ lastEventType: "pointercancel", gestureState: "idle", activePointerCount: activePointersRef.current.size });
  }

  // iOS Safari's long-press callout ("Copy" / save-image menu) would
  // otherwise fight the reader's own long-press selection — suppressed
  // only on this element (the reader surface), never globally.
  function handleContextMenu(e: Event) {
    if (isMobileViewport) e.preventDefault();
  }

  // Attached via a ref-indirection wrapper so the actual DOM listeners
  // are only added/removed when the target element or mobile-mode
  // actually changes, not on every render — a pinch or pan updates zoom/
  // pan state on every pointermove tick, and reattaching real listeners
  // that often would risk jank during exactly the "smooth animation" the
  // pinch-zoom spec asks for. The wrapper always calls through to the
  // latest handler closures, so state is never stale despite the stable
  // listener identity. Dependency array includes `bookAreaMounted` (see
  // the `setBookAreaNode` ref-callback below) — THIS is the fix for the
  // real-device bug: it re-runs at the exact moment the element actually
  // exists in the DOM, instead of relying on `isMobileViewport` (which
  // never changes at that moment) to infer it.
  const pointerHandlersRef = useRef({ handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handleContextMenu });
  pointerHandlersRef.current = { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel, handleContextMenu };

  useEffect(() => {
    const el = bookAreaRef.current;
    if (!el || !isMobileViewport) { updateDebug({ listenerMounted: false }); return; }
    const onDown = (e: PointerEvent) => pointerHandlersRef.current.handlePointerDown(e);
    const onMove = (e: PointerEvent) => pointerHandlersRef.current.handlePointerMove(e);
    const onUp = (e: PointerEvent) => pointerHandlersRef.current.handlePointerUp(e);
    const onCancel = (e: PointerEvent) => pointerHandlersRef.current.handlePointerCancel(e);
    const onContextMenu = (e: Event) => pointerHandlersRef.current.handleContextMenu(e);
    el.addEventListener("pointerdown", onDown, { passive: false });
    el.addEventListener("pointermove", onMove, { passive: false });
    el.addEventListener("pointerup", onUp, { passive: false });
    el.addEventListener("pointercancel", onCancel, { passive: false });
    el.addEventListener("contextmenu", onContextMenu);
    updateDebug({ listenerMounted: true });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      el.removeEventListener("contextmenu", onContextMenu);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobileViewport, bookAreaMounted]);

  // AI panel starts compact on ENTERING fullscreen (per spec), same
  // "force once on the false→true edge" pattern as ReaderNav's own
  // auto-collapse — the user's manual toggle keeps working normally
  // afterward, in or out of fullscreen.
  useEffect(() => {
    if (isFullscreenLayout && !wasFullscreenRef.current) setAiPanelCompact(true);
    wasFullscreenRef.current = isFullscreenLayout;
  }, [isFullscreenLayout]);

  function toggleAiPanelCompact() {
    setAiPanelCompact((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(AI_PANEL_COMPACT_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // Tracks drag start (screen coords) — SHARED by both Text Select and
  // Image Select. Which one of the two "uses" the resulting drag is
  // decided entirely in handleMouseUp based on interactionMode, not by
  // having two separate trackers.
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Snapshot of selectionRects taken the moment "⭐ Highlight" / "📝 Add
  // Note" is clicked — NOT read live inside addHighlight/saveNote. Those
  // buttons live inside the same mouse-up-handling area as the page, so
  // clicking them fires a native mouseup that bubbles to handleMouseUp
  // BEFORE the button's own click handler runs; handleMouseUp's "this
  // mouseup landed on a UI control" guard already clears selectionRects
  // to [] on that bubble. By the time addHighlight/saveNote actually run
  // (on the later click event), selectionRects in state is already empty
  // — which silently saved highlights/notes with an empty rectsPct/
  // rectPct, so they showed up in Study but never rendered on the page.
  // Capturing the rects here, before that mouseup can clear them, fixes it.
  const pendingSelectionRectsRef = useRef<ScreenRect[]>([]);

  // ── Page text cache ───────────────────────────────────────────────
  const [pageTexts, setPageTexts] = useState<Record<number, string>>({});

  // ── Language ──────────────────────────────────────────────────────
  const [language, setLanguage] = useState<Lang>("English");
  // Sync the AI response language FROM the platform UI language whenever
  // uiLanguage changes (initial hydration settling from localStorage,
  // cross-tab storage events, or a future platform-wide selector) — this
  // is what keeps the two in sync on first load/refresh, not just after
  // the user opens LanguagePopover. LanguagePopover's own onClick handler
  // already sets both together going forward, so this effect is a no-op
  // in that case (uiLanguage changes to the value `language` already has).
  useEffect(() => {
    setLanguage(UI_CODE_TO_LANG[uiLanguage]);
  }, [uiLanguage]);
  // Hook call kept unconditional (above every early `return` below) per
  // Rules of Hooks — used by the toolbar's LanguagePopover near the
  // bottom of this component.
  const enabledLanguageCodes = useEnabledLanguages();
  // Platform-wide UI language (Phase D Task 5) — deliberately a separate
  // concept from `language`/`setLanguage` above, which is the AI response
  // / content language driven by LanguagePopover. This one only drives the
  // Reader chrome's own labels (top row, controls strip, bottom bar,
  // Contents modal). Named `uiLanguage` to avoid any collision with the
  // existing `language` state — declared earlier in this component (see
  // the hydration-gate section above) since the uploaded-document
  // fallback title needs it before this point.

  // ── AI ────────────────────────────────────────────────────────────
  const [aiResponse, setAiResponse] = useState<string>(
    t.premiumReaderAskInitialPlaceholder
  );
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // ── Phase C2: scope, depth, follow-up memory, retry ────────────────
  // Scope: what Quick Actions / Ask AI apply to (page/chapter/book) —
  // an active text selection still wins for Ask AI regardless (see
  // askPremiumAI). Depth: reuses the existing server-side study modes.
  // Neither persists across page reloads on purpose — this mirrors how
  // `language` above already behaves, and avoids touching localStorage.
  const [scope, setScope] = useState<"page" | "chapter" | "book">("page");
  const [depth, setDepth] = useState<Depth>("Beginner");

  // Last few Q&A turns from THIS reading session, in memory only — lets
  // a typed follow-up like "explain that more simply" or "give an
  // example" resolve "that" against the previous answer. Reset whenever
  // the book changes (see the bookId effect below).
  const [aiHistory, setAiHistory] = useState<AiTurn[]>([]);
  const AI_HISTORY_LIMIT = 3;

  // True only right after the most recent AI call failed — drives the
  // small inline Retry button. `lastAiCallRef` re-runs the exact call
  // that failed (quick action, chapter/book scope, or Ask AI) without
  // the user having to redo anything.
  const [aiFailed, setAiFailed] = useState(false);
  const lastAiCallRef = useRef<(() => void) | null>(null);
  // Aborts a still-in-flight request when a newer one starts, and caps
  // how long any single request can hang before it's treated as failed.
  const activeAbortControllerRef = useRef<AbortController | null>(null);
  const AI_REQUEST_TIMEOUT_MS = 30000;

  // Full-book text extraction is slow (walks every page of the PDF) —
  // cache the result per book, in memory, so a second "Entire Book"
  // action in the same session never re-extracts from scratch.
  const fullBookCacheRef = useRef<Record<string, { text: string; weak: boolean }>>({});

  // Shared lazily-opened pdf.js document (independent of PdfBookSpread's
  // own rendering pipeline), keyed by book — reused by BOTH entire-book
  // extraction and chapter-scope's bounded page-range extraction below,
  // so switching scopes never opens a second document unnecessarily.
  // Wrapped in useCallback (stable per bookId/pdf). Uses pdfjs-dist's
  // MODERN "generic" build (bare `import("pdfjs-dist")` → its
  // package.json "main", pdfjs-dist/build/pdf.mjs) — NOT used by
  // MobilePdfPage; see getSharedMobilePdfDocument below for why.
  const pdfDocCacheRef = useRef<Record<string, Promise<any>>>({});
  const getSharedPdfDocument = useCallback((): Promise<any> => {
    const existing = pdfDocCacheRef.current[bookId];
    if (existing) return existing;
    const promise = (async () => {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjsLib.getDocument(currentBook.pdf).promise;
    })();
    pdfDocCacheRef.current[bookId] = promise;
    return promise;
  }, [bookId, currentBook.pdf]);

  // ── Mobile pdf.js document loader ──────────────────────────────────
  // Uses pdfjs-dist's LEGACY build (pdfjs-dist/legacy/build/pdf.mjs),
  // not the modern "generic" one getSharedPdfDocument above uses — the
  // modern build relies on a JS engine feature iOS Safari's WebKit
  // doesn't implement. Same public API either way (getDocument/getPage/
  // render/getTextContent), so nothing in MobilePdfPage itself depends
  // on which build produced the document. Its worker must be the
  // matching legacy build too (public/pdf.worker.legacy.min.mjs, a
  // version-matched twin of public/pdf.worker.min.mjs) — pdf.js warns
  // against mixing worker/API versions.
  //
  // A fully separate cache + module import from getSharedPdfDocument —
  // desktop's PdfBookSpread and AI text extraction never touch this
  // cache or the legacy module; only MobilePdfPage does, and only below
  // 640px.
  //
  // Takes an EXPLICIT (bookId, pdfUrl) pair rather than reading them
  // from closure, and caches by the composite `${bookId}:${pdfUrl}` —
  // never `bookId` alone — so a document can never be resolved or
  // reused for the wrong book. `<MobilePdfPage key={...}>` below uses
  // the same composite key, forcing a full unmount/remount on every
  // book switch so no ref or in-flight promise from the previous book
  // can carry into the next render cycle.
  const mobilePdfDocCacheRef = useRef<Record<string, Promise<any>>>({});
  const getSharedMobilePdfDocument = useCallback((forBookId: string, pdfUrl: string): Promise<any> => {
    const cacheKey = `${forBookId}:${pdfUrl}`;
    const existing = mobilePdfDocCacheRef.current[cacheKey];
    if (existing) return existing;
    const promise = (async () => {
      const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.legacy.min.mjs";
      return pdfjsLib.getDocument(pdfUrl).promise;
    })();
    mobilePdfDocCacheRef.current[cacheKey] = promise;
    return promise;
  }, []);

  // Zero-arg wrapper for the prop MobilePdfPage actually expects
  // (`getPdfDocument: () => Promise<any>`) — deliberately kept stable
  // (via useCallback) across renders where bookId/currentBook.pdf are
  // unchanged, so unrelated parent re-renders (zoom, pan, AI panel
  // state, …) can never make MobilePdfPage's own render effect think a
  // new document load is needed. Only recreated — same as before this
  // fix — when the book itself actually changes.
  const getMobilePdfDocument = useCallback((): Promise<any> => {
    return getSharedMobilePdfDocument(bookId, currentBook.pdf);
  }, [bookId, currentBook.pdf, getSharedMobilePdfDocument]);

  // Dev-only visibility into what each AI scope actually sent — never
  // shown in the UI, gated on NODE_ENV so it's a no-op in production.
  function logScopeDebug(info: { scope: string; source: string; pages: number; chars: number }) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.debug("[AI Scope]", info);
    }
  }

  // ── SINGLE INTERACTION MODE — the only thing that decides which AI
  //    context (text vs image) a floating-toolbar action uses. ─────────
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("none");

  // ── SINGLE ACTIVE SELECTION ───────────────────────────────────────
  const [activeSelection, setActiveSelection] = useState<ActiveSelection>(null);

  // ── DRAG / HIGHLIGHT VISUAL STATE ─────────────────────────────────
  // Purely presentational — never read by the AI router. What the AI
  // actually uses comes only from activeSelection, gated by interactionMode.
  //   - liveDragRect: rectangle shown WHILE the mouse is down (either mode).
  //   - selectionRects: final highlight box(es) for TEXT mode — either the
  //     real selection's getClientRects(), or (OCR path) the drag rect.
  //   - capturedImageRect: final highlight box for IMAGE mode, shown with
  //     the amber "📷 Selected" badge, same as before.
  const [liveDragRect, setLiveDragRect] = useState<ScreenRect | null>(null);
  const [selectionRects, setSelectionRects] = useState<ScreenRect[]>([]);
  const [capturedImageRect, setCapturedImageRect] = useState<ScreenRect | null>(null);

  // ── Read AI Response — a separate, one-off player untouched by this
  // unification (reads the AI Companion's current output, never Read
  // Page/Chapter/Book text). Starting it pauses the unified reader (see
  // handleReadAiResponse) since only one can really be speaking at a
  // time — they still share the one browser speechSynthesis queue.
  const [aiSpeechState, setAiSpeechState] = useState<SpeechState>("idle");
  // Set only when the AI response's language has no closely-matching
  // installed voice — shown next to the Read AI Response button so a
  // fallback voice/accent is never silently substituted without
  // explanation (Phase C2 fix — Hindi/Indic read-aloud).
  const [aiVoiceNotice, setAiVoiceNotice] = useState<string | null>(null);
  const aiSpeechStoppedRef = useRef(false);

  // ── Unified Reading Engine: Read Page / Read Chapter / Read Book ──────
  // Mobile-only for the PLAYER UI (see the Read menu's render site below)
  // — desktop keeps its own single Read Page button, driven by this exact
  // same engine/state so the text-resolution fix applies everywhere, just
  // without the rich player card (established "desktop reader unchanged"
  // precedent from earlier rounds). One state machine for all three
  // modes: playerMode identifies which one is active, playerStatus is
  // idle/starting/playing/paused/completed/error.
  const [readMenuOpen, setReadMenuOpen] = useState(false);
  // P0 regression fix: wraps the Read menu's trigger + dropdown (both
  // portrait and landscape headers share this one ref/effect — only one
  // can ever be mounted at a time). Used by the outside-click effect
  // below, replacing the old full-viewport invisible backdrop <div>,
  // which the reader's own touch-gesture layer treated as a plain
  // (non-control) tap target and swallowed via preventDefault before the
  // backdrop's onClick could ever fire on a real touch device.
  const readMenuRef = useRef<HTMLDivElement>(null);
  const [playerMode, setPlayerMode] = useState<ReadMode | null>(null);
  const [playerStatus, setPlayerStatus] = useState<ReaderStatus>("idle");
  const [playerSpeed, setPlayerSpeed] = useState(1);
  const [playerEndPage, setPlayerEndPage] = useState<number | null>(null);
  // Set only in the "error" status — the reason shown in the player's
  // inline error state (Retry/Close, +Skip Page for Read Book).
  const [playerErrorMessage, setPlayerErrorMessage] = useState<string | null>(null);
  // Minimize/expand — playback is completely unaffected by this; it only
  // changes which of the two player layouts renders (see the JSX below).
  const [playerMinimized, setPlayerMinimized] = useState(false);
  const [chapterUnavailableOpen, setChapterUnavailableOpen] = useState(false);
  const [resumePromptPage, setResumePromptPage] = useState<number | null>(null);
  const [sleepTimerOption, setSleepTimerOption] = useState<SleepTimerOption>("off");
  const readerStoppedRef = useRef(false);
  const readerTokenRef = useRef(0);
  // Kept in sync with playerMode via the effect below — read from the
  // accessibility-panel-state window listener, which is registered once
  // on mount and would otherwise close over a stale (always-null) value.
  const playerModeRef = useRef<ReadMode | null>(null);
  useEffect(() => { playerModeRef.current = playerMode; }, [playerMode]);
  // The page the engine itself is about to navigate TO, set immediately
  // before every auto-turn — the "manual page change" interruption
  // effect below treats any OTHER readerPage change as user-driven
  // (swipe, Prev/Next, page strip, voice command) and stops.
  const readerExpectedPageRef = useRef<number | null>(null);
  // Preloads the NEXT page's text while the current one is still
  // speaking — {page, promise}, consumed (and cleared) by
  // getPageTextWithPreload once the engine actually reaches that page.
  // Only ever armed AFTER the current page's first utterance has
  // actually started (see speakChunksContinuous's onFirstAudibleStart),
  // never before — preload must never compete with/delay current speech.
  const nextPageTextCacheRef = useRef<{ page: number; promise: Promise<PageTextResolution> } | null>(null);
  const sleepTimerHandleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTimerEndPageRef = useRef<number | null>(null);
  // Live playback-speed ref (always current, unlike a value captured
  // once when a page's chunk sequence started) plus the chunk-level
  // restart machinery below, so changing speed while actively speaking
  // takes effect on the very next utterance instead of waiting for the
  // current page to finish.
  const playerSpeedRef = useRef(1);
  useEffect(() => { playerSpeedRef.current = playerSpeed; }, [playerSpeed]);
  // { chunks, index } for whichever page is currently being spoken —
  // read/written by speakChunksContinuous below and by
  // restartCurrentChunkAtNewSpeed (triggered from the speed <select>).
  const chunkStateRef = useRef<{ chunks: string[]; index: number } | null>(null);
  // Holds speakChunksContinuous's own speakCurrent closure while a page
  // is actively being spoken, so restartCurrentChunkAtNewSpeed can
  // re-invoke that EXACT continuation (not a parallel one) after a
  // speed-triggered cancel(). Null whenever nothing is in-flight.
  const speakCurrentChunkFnRef = useRef<(() => void) | null>(null);
  // Bumped every time the CURRENT chunk is manually restarted at a new
  // speed — lets an in-flight utterance's onend/onerror recognize it's
  // been superseded (by the cancel() that restart triggers) and quietly
  // no-op instead of either double-advancing or prematurely resolving
  // the whole page's speech promise.
  const chunkSessionRef = useRef(0);
  // Remembers the last startReading(...) call so Retry (from the error
  // state) can re-run the exact same request without the caller having
  // to re-derive mode/startPage/endPage.
  const lastReadingRequestRef = useRef<{ mode: ReadMode; startPage: number; endPage: number } | null>(null);
  // One-time speech-engine warm-up — see the effect near the bottom of
  // this state block.
  const voiceWarmupRef = useRef(false);

  // Speech engine warm-up (mobile Safari especially): fires once on
  // mount, purely to prime speechSynthesis.getVoices()/voiceschanged
  // well before the user's first tap — loadVoices() already implements
  // "listen once for voiceschanged, fall back after a short timeout"
  // (lib/premium-reader/speech.ts). No audible dummy utterance is ever
  // spoken, and this never blocks a later speak() call — the unified
  // engine's own utterances never await this promise, they just use
  // whichever default voice is available at speak() time; this only
  // reduces the odds that the FIRST real speak() call is also the one
  // that has to wait for the voice list to populate.
  useEffect(() => {
    if (voiceWarmupRef.current) return;
    voiceWarmupRef.current = true;
    loadVoices();
  }, []);

  // ── Go To Page ────────────────────────────────────────────────────
  // Input always means the PRINTED page number — there is no PDF-page
  // mode. PDF page indexes are purely internal.
  const [goToInput, setGoToInput] = useState("");

  // ── Voice Assistant: "Open Study tab" signal — undefined until the
  //    first voice command fires, so AICompanion's effect never forces
  //    the tab on initial mount. ────────────────────────────────────
  const [openStudyTabSignal, setOpenStudyTabSignal] = useState<number | undefined>(undefined);
  // Mobile bottom-nav "Bookmarks" (replaces Contents — see the removal
  // comment further down): opens the SAME Study tab as the signal above,
  // but also needs Study Workspace's own internal sub-tab to land on
  // "bookmarks" specifically, which openStudyTabSignal alone can't do
  // (it only flips AICompanion's outer "companion"/"study" tab). A
  // second counter, threaded down through AICompanion into
  // StudyWorkspace, does that — same "increment to fire" pattern, so any
  // repeat tap re-fires even if the value would otherwise be unchanged.
  const [openBookmarksSignal, setOpenBookmarksSignal] = useState(0);
  function openMobileBookmarks() {
    setAiPanelCompact(false);
    setOpenStudyTabSignal(s => (s || 0) + 1);
    setOpenBookmarksSignal(s => s + 1);
  }

  // ── Ask About Image — custom question UI state ────────────────────
  const [askImageInput, setAskImageInput] = useState("");
  const [showAskInput, setShowAskInput] = useState(false);

  // ══════════════════════════════════════════════════════════════════
  // PHASE 2 STATE — Highlights, Notes, Bookmarks, Study Workspace.
  // Entirely additive: none of this is read by the selection engine,
  // the page-turn engine, zoom, fullscreen, or the existing AI router
  // above. It only reads activeSelection/selectionRects/readerPage as
  // inputs once the user explicitly taps a Phase 2 button.
  // ══════════════════════════════════════════════════════════════════
  const [highlights, setHighlights] = useState<StoredHighlight[]>([]);
  const [notes, setNotes] = useState<StoredNote[]>([]);
  const [bookmarks, setBookmarks] = useState<StoredBookmark[]>([]);

  // Load from localStorage once on mount — this is what makes highlights/
  // notes/bookmarks "persist after refresh".
  useEffect(() => {
    setHighlights(loadHighlights());
    setNotes(loadNotes());
    setBookmarks(loadBookmarks());
  }, []);

  // Small popovers anchored near the current selection (shown only while
  // a text selection's floating toolbar is already showing).
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showNotePopover, setShowNotePopover] = useState(false);
  const [noteImproving, setNoteImproving] = useState(false);
  const [lastNoteWasImproved, setLastNoteWasImproved] = useState(false);

  // Which highlight is currently generating a revision card (Study tab),
  // so we can show a small per-item loading state without touching the
  // main aiLoading/aiResponse pipeline's own presentation.
  const [studyGeneratingId, setStudyGeneratingId] = useState<string | null>(null);

  // Briefly pulses the matching highlight/note overlay after "jump to
  // page" from the Study tab, as a lightweight stand-in for "scroll to
  // highlight" in a reader where each page IS the viewport.
  const [flashItemId, setFlashItemId] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────
  //  SWITCH INTERACTION MODE — the ONLY way to change modes.
  //  Every toolbar button calls this. Never set individual flags directly.
  // ─────────────────────────────────────────────────────────────────
  function switchInteractionMode(newMode: InteractionMode) {
    setInteractionMode(prev => {
      if (prev === newMode) return prev; // no-op if already in this mode
      if (newMode === "image") {
        // Image Select must never let a pre-existing native text selection
        // linger into the new mode — clear it the instant the mode turns on.
        window.getSelection()?.removeAllRanges();
      }
      // Text mode / "none": deliberately do NOT touch window.getSelection()
      // here — Text Select is allowed to coexist with whatever the browser
      // is doing, and the AI router only ever reads activeSelection anyway.
      return newMode;
    });

    // ── Clear activeSelection when switching modes ─────────────────
    // A selection belongs to the mode that created it. Switching modes
    // makes it stale — clear it so no cross-mode menu leakage occurs.
    setActiveSelection(null);
    setSelectionRects([]);
    setLiveDragRect(null);
    setCapturedImageRect(null);
    setIsPanning(false);
    dragStartRef.current = null;
  }

  // Convenience: toggle a mode (same mode → "none", different mode → that mode)
  function toggleMode(mode: InteractionMode) {
    switchInteractionMode(interactionMode === mode ? "none" : mode);
  }

  // ── Derive boolean flags from interactionMode ──────────────────────
  // PdfBookSpread still accepts these as props. They are NOT state —
  // they are computed from the single source of truth.
  const textSelectMode  = interactionMode === "text";
  const imageSelectMode = interactionMode === "image";

  // ── Floating menu is visible ONLY when selection matches mode ──────
  const showFloatingMenu =
    activeSelection !== null &&
    ((activeSelection.type === "text"  && interactionMode === "text")  ||
     (activeSelection.type === "image" && interactionMode === "image"));

  // ── resetInteractionState: clears transient drag flags ─────────────
  // Does NOT clear activeSelection or interactionMode.
  function resetInteractionState() {
    setIsPanning(false);
  }

  // ── Clear selection explicitly ──────────────────────────────────────
  function clearActiveSelection() {
    setActiveSelection(null);
    setShowAskInput(false);
    setAskImageInput("");
    setSelectionRects([]);
    setLiveDragRect(null);
    setCapturedImageRect(null);
    setShowColorPicker(false);
    setShowNotePopover(false);
  }

  // ── Page / book change cleanup ──────────────────────────────────────
  // Runs on EVERY page turn (Next/Previous/Go-to-page) and book switch.
  // Must fully reset drag/selection state — otherwise a drag that was
  // (even accidentally) left mid-flight can resurface as a phantom
  // selection once the new page has rendered and the mouse next moves,
  // with no new mousedown/drag having happened on the new page at all.
  useEffect(() => {
    // Read Page/Chapter/Book (the unified reader) is stopped by the
    // dedicated "manual page change" interruption effect right below —
    // it correctly tells an engine-driven auto-turn (Chapter/Book) apart
    // from a genuinely manual one (which Read Page's own single-page
    // session always counts as, once it's done). The AI response player
    // keeps narrating across a page turn since aiResponse itself doesn't
    // change until a new AI call completes.
    clearActiveSelection();   // activeSelection, highlights, ask-input, floating toolbar
    resetInteractionState();  // isPanning
    dragStartRef.current = null; // drag anchor — never carry a stale one to the new page
    setLiveDragRect(null);
    window.getSelection()?.removeAllRanges(); // native browser selection
    setPan({ x: 0, y: 0 });
    // P0 regression fix: a page turn or book switch closes the Read
    // menu, per spec — it doesn't make sense to leave a page-scoped menu
    // open across content changing underneath it.
    setReadMenuOpen(false);
  }, [readerPage, bookId]); // eslint-disable-line

  // Unified reading engine — interrupt on a MANUAL page change. The
  // engine records the page it's about to navigate TO in
  // readerExpectedPageRef immediately before every navigation (including
  // Read Page's own single-page jump, if it needed one); any readerPage
  // change that doesn't match that expectation (swipe, Prev/Next tap,
  // page-strip jump, voice command, Go to Page) is necessarily
  // user-driven and closes the reader, per spec.
  useEffect(() => {
    if (playerMode && readerExpectedPageRef.current !== null && readerPage !== readerExpectedPageRef.current) {
      closeReader();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readerPage]);

  // Interrupt the reader when the AI Companion panel opens —
  // openMobileBookmarks (Bookmarks) and the "Notes" tab both open this
  // same panel (just on a different starting tab), so watching
  // aiPanelCompact covers "opens AI" / "opens Notes" / "opens Bookmarks"
  // in one place.
  useEffect(() => {
    if (!aiPanelCompact) {
      if (playerMode) closeReader();
      setReadMenuOpen(false); // P0 regression fix: opening AI/Notes/Bookmarks closes the Read menu too
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiPanelCompact]);

  // P0 regression fix: opening the More sheet, Contents, or the page-
  // strip sheet also closes the Read menu — only one of Read menu/modal
  // dialog/panel should be active at a time, per spec.
  useEffect(() => {
    if (mobileMoreOpen || contentsOpen || pageStripOpen) {
      setReadMenuOpen(false);
      // Issue 4 explicitly calls out "More" alongside Accessibility/AI/
      // Notes/Bookmarks as an interruption trigger — extended to
      // Contents/page-strip too since they're the same class of local
      // full-attention sheet.
      if (playerMode) closeReader();
    }
  }, [mobileMoreOpen, contentsOpen, pageStripOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // P0 regression fix: rotating the phone closes the Read menu — a
  // portrait-anchored (or landscape-anchored) dropdown makes no sense
  // once the header it was anchored to has been replaced by the other
  // orientation's completely different header layout.
  useEffect(() => {
    setReadMenuOpen(false);
  }, [isMobileLandscape]);

  // P0 regression fix: Escape closes the Read menu where supported
  // (physical/Bluetooth keyboard, desktop browser testing) — real
  // iPhone touch users close it via the outside-click effect below.
  useEffect(() => {
    if (!readMenuOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setReadMenuOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [readMenuOpen]);

  // P0 regression fix: replaces the old full-viewport invisible backdrop
  // <div> (which the touch-gesture layer swallowed — see the
  // handleGestureDown/handlePointerDown guard comments above) with a
  // plain document-level pointerdown listener + ref-contains check, the
  // same proven pattern AccessibilityToolbar already uses for its own
  // outside-click dismissal. This renders NOTHING while closed (no
  // stray element, nothing to intercept pointer events) and reacts to
  // the real native pointerdown event directly, so it can never be
  // preempted by the reader's own gesture classification.
  useEffect(() => {
    if (!readMenuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (readMenuRef.current && !readMenuRef.current.contains(e.target as Node)) setReadMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [readMenuOpen]);

  // Interrupt the reader when the Accessibility panel opens — same
  // ndl-accessibility-panel-state broadcast the gesture layer already
  // listens to (see accessibilityPanelOpenRef above). Registered once on
  // mount, so it reads playerModeRef (kept fresh by the effect declared
  // alongside it) rather than the state directly.
  useEffect(() => {
    function onA11yPanelState(e: Event) {
      const open = !!(e as CustomEvent<{ open: boolean }>).detail?.open;
      if (open) {
        if (playerModeRef.current) closeReader();
        setReadMenuOpen(false); // P0 regression fix: opening Accessibility closes the Read menu too
      }
    }
    window.addEventListener("ndl-accessibility-panel-state", onA11yPanelState);
    return () => window.removeEventListener("ndl-accessibility-panel-state", onA11yPanelState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Interrupt the reader (and cancel any pending speech) when the reader
  // itself unmounts — leaving the reader page entirely (Back, browser
  // navigation, closing the tab).
  useEffect(() => {
    return () => {
      readerStoppedRef.current = true;
      readerTokenRef.current += 1;
      window.speechSynthesis?.cancel();
    };
  }, []);

  // Also applies a validated `?page=` — read fresh from `searchParams`
  // every time this effect runs, rather than a "do it once, ever" ref
  // guard. That guard was tried first, but a Link-driven client-side
  // transition into this page from another route (e.g. Notes → Return
  // to Book) doesn't remount this component fresh the way a full
  // navigation does, so a once-only ref could end up permanently
  // "spent" by the time `bookId`/`searchParams` actually reflected the
  // requested book — silently leaving the reader on the cover with the
  // right URL but the wrong visible page. Re-deriving from `searchParams`
  // on every `bookId` change (mount or a genuine book switch) has no such
  // race, and a plain in-book page turn never changes `bookId`, so it
  // can't re-trigger this from an unrelated cause. The `readerPage`/
  // `bookOpened` state declarations above already resolve the same
  // `?page=` synchronously into the FIRST render (so there's no cover
  // flash) — this effect exists for genuine subsequent book changes and
  // to run the rest of the book-change reset below, and lands on the
  // exact same value the initial state already used, so it's a no-op
  // repeat on mount, not a second competing source of truth.
  //
  // A requested page also bypasses the cover-click gate: `bookOpened`
  // is otherwise only ever flipped true by the user clicking the cover,
  // so without this an explicit `?page=` was silently ignored on the
  // visible screen even though readerPage was set correctly underneath.
  // Skips the opening animation deliberately — that's for a deliberate
  // "click to begin reading" moment, not a direct/restored deep link.
  //
  // `saveCurrentBook` is also called directly here (with the freshly
  // resolved target page, not the possibly-still-stale `readerPage`
  // state) rather than relying solely on the separate effect below —
  // that effect reacts to `readerPage` generically and, on this exact
  // same commit, would otherwise still be holding the PREVIOUS book's
  // last page for one render until `setReaderPage` here takes effect,
  // risking a transient wrong-page write to `ndl_current_book` between
  // the two. Writing the correct value directly here removes that gap
  // rather than depending on effect order to self-correct one render
  // later.
  useEffect(() => {
    setBookOpening(false);
    setZoom(100);
    setPan({ x: 0, y: 0 });
    setAiResponse(t.premiumReaderAskInitialPlaceholder);
    autoFitDone.current = false;
    switchInteractionMode("none");
    // A new book means a new conversation and a new scope — carrying
    // either over would ground follow-ups in the wrong book, or apply
    // "Entire Book" scope to a book the user hasn't even opened yet.
    setAiHistory([]);
    setScope("page");
    setAiFailed(false);
    // A book change invalidates both "players" — the AI response about
    // to be cleared, and the unified reader (Read Page/Chapter/Book),
    // which belonged to the book being left. "Changes book" is one of
    // the spec's explicit interruption triggers.
    window.speechSynthesis?.cancel();
    aiSpeechStoppedRef.current = true;
    setAiSpeechState("idle");
    setAiVoiceNotice(null);
    if (playerMode) closeReader();

    const urlPage = Number(searchParams.get("page"));
    let resolvedPage = 1;
    if (Number.isFinite(urlPage) && urlPage >= 1) {
      // Phase C1F (corrected): honor the URL's exact page — see the
      // initial readerPage state above for why.
      const clamped = Math.min(Math.max(1, Math.floor(urlPage)), totalPages || urlPage);
      resolvedPage = isSpreadBook && clamped > 1 ? (clamped % 2 === 0 ? clamped : clamped - 1) : clamped;
      setReaderPage(resolvedPage);
      setBookOpened(true);
      // A resolved deep-link page for the (possibly new) book — same
      // "already genuine, persist immediately" reasoning as the initial
      // hasEngagedRef state above.
      hasEngagedRef.current = true;
    } else {
      setReaderPage(1);
      setBookOpened(false);
      hasEngagedRef.current = false;
    }

    if (bookId && totalPages) {
      saveCurrentBook({
        route: "/reader-premium",
        bookId,
        title: currentBook.title,
        page: resolvedPage,
        source: isUploadedBook ? "upload" : undefined,
      });
    }
  }, [bookId]); // eslint-disable-line

  useEffect(() => { if (zoom <= 100) setPan({ x: 0, y: 0 }); }, [zoom]);

  // ── Auto-fit ────────────────────────────────────────────────────────
  const handlePageRendered = useCallback((cssW: number, cssH: number, cardW: number, cardH: number) => {
    if (autoFitDone.current) return;
    autoFitDone.current = true;
    if (cssW <= 0 || cssH <= 0 || cardW <= 0 || cardH <= 0) return;
    const innerW = cardW - 56, innerH = cardH - 56;
    const fitZoom = Math.min(Math.floor((innerW / cssW) * 100), Math.floor((innerH / cssH) * 100), 100);
    const snapped = Math.max(40, Math.floor(fitZoom / 5) * 5);
    if (snapped < 100) setZoom(snapped);
  }, []);

  const handleTextExtracted = useCallback((texts: Record<number, string>) => {
    setPageTexts(prev => ({ ...prev, ...texts }));
  }, []);

  // ── Visible page text ───────────────────────────────────────────────
  function getVisiblePageText(): string {
    if (isSpreadBook && readerPage > 1) {
      const l = pageTexts[readerPage] || "", r = pageTexts[readerPage + 1] || "";
      return [l, r].filter(Boolean).join("\n\n--- Next Page ---\n\n");
    }
    return pageTexts[readerPage] || "";
  }

  // ── Mobile UX Polish: robust current-page context for AI ─────────────
  // Priority, per that phase's explicit spec:
  //   1. Already-extracted text for the current page (pageTexts) — the
  //      existing, unchanged path when extraction succeeded.
  //   2. The currently-rendered page canvas itself, captured the exact
  //      same way Image Select already captures a crop (canvas.toDataURL
  //      at line ~217) and sent through the SAME image-AI path
  //      runImageSelectionAction already uses — this is not a new
  //      backend capability, just reusing the existing vision path as a
  //      fallback source instead of requiring the user to crop-select
  //      first. No PDF pipeline or rendering code is touched; this only
  //      *reads* whichever <canvas> is already on screen via a plain DOM
  //      query, which works for both MobilePdfPage's single canvas and
  //      PdfBookSpread's.
  //   3. The prior graceful "Viewing Page X" text-only fallback, exactly
  //      as before, only when neither of the above is available.
  // Purely additive: tier 1 is byte-for-byte the previous behavior, so
  // desktop (where extraction is already reliable) sees no change in the
  // common case — this only improves the case that was previously
  // silently falling straight to tier 3.
  function getCurrentPageContentForAI(): { content: string; imageDataUrl?: string } {
    const visibleText = getVisiblePageText();
    if (visibleText.length > 50) {
      return { content: `Content from ${pageDescription(readerPage)} of "${book}":\n\n${cleanOcrTextForAi(visibleText)}` };
    }
    const canvas = bookAreaRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      try {
        const imageDataUrl = canvas.toDataURL("image/png");
        return {
          content: `Viewing ${pageDescription(readerPage)} of "${book}". No extracted text was available for this page — read the attached page image directly and answer using what's visible in it.`,
          imageDataUrl,
        };
      } catch { /* canvas unreadable (rare) — fall through to tier 3 */ }
    }
    return { content: `Viewing ${pageDescription(readerPage)} of "${book}".` };
  }

  // ══════════════════════════════════════════════════════════════════
  // ENTIRE BOOK scope — full-book text extraction with a graceful
  // metadata-based fallback for image-heavy/scanned books (e.g. Nalanda),
  // where per-page extraction yields little or no real text. This is
  // self-contained (its own pdfjs-dist load, independent of
  // PdfBookSpread's own rendering pipeline) so it never touches or risks
  // the existing page-rendering code.
  // ══════════════════════════════════════════════════════════════════
  const FULL_BOOK_EXTRACT_CAP = 24000;
  const WEAK_BOOK_TEXT_THRESHOLD = 300;
  // Kept well under typical model context limits even at 3 chunks + 1
  // combine call — each chunk is its own request, not stacked together.
  const BOOK_CHUNK_SIZE = 8000;
  // "Current chapter" scope prefers ALREADY-CACHED page text (pageTexts)
  // when there's enough of it; otherwise it does its own small, bounded
  // text-layer extraction for just this window (see getChapterText) —
  // never a full-book extraction.
  const CHAPTER_WINDOW_PAGES = 5;

  async function extractFullBookText(): Promise<{ text: string; weak: boolean }> {
    try {
      const pdf = await getSharedPdfDocument();
      const numPages = pdf.numPages || totalPages;

      let combined = "";
      let pagesWithText = 0;

      for (let i = 1; i <= numPages; i++) {
        if (combined.length >= FULL_BOOK_EXTRACT_CAP) break;
        try {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const rawText = (textContent.items as any[])
            .map((item: any) => item.str)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
          const pageText = cleanOcrTextForAi(rawText);
          if (pageText.length > 10) {
            pagesWithText++;
            combined += `\n\n[Page ${i}]\n${pageText}`;
          }
        } catch {
          // One unreadable page shouldn't abort the whole extraction —
          // skip it and keep going.
        }
      }

      const trimmed = combined.trim().slice(0, FULL_BOOK_EXTRACT_CAP);
      // "Weak" covers both a mostly-empty extraction AND a book where only
      // a handful of pages produced any real text at all (e.g. an
      // illustrated/scanned book where embedded text is sparse or absent) —
      // either way, page-by-page extraction alone isn't a reliable basis
      // for a whole-book action.
      const weak = trimmed.length < WEAK_BOOK_TEXT_THRESHOLD || pagesWithText < Math.max(1, Math.ceil(numPages * 0.15));
      return { text: trimmed, weak };
    } catch (err) {
      console.error("[EntireBookAI] Full-book extraction failed:", err);
      return { text: "", weak: true };
    }
  }

  // Reuses a per-book cache (in memory only) so repeated Entire Book
  // actions in the same session never re-walk the PDF from scratch.
  async function getFullBookText(): Promise<{ text: string; weak: boolean }> {
    const cached = fullBookCacheRef.current[bookId];
    if (cached) return cached;
    const result = await extractFullBookText();
    fullBookCacheRef.current[bookId] = result;
    return result;
  }

  // Fallback grounding for weak/scanned books: book metadata (title,
  // author, description, language) plus any page text ALREADY cached
  // from pages the user has actually viewed (pageTexts) — every bit of
  // real content helps ground the response rather than relying purely on
  // guesswork from the title alone.
  function buildBookMetadataContext(): string {
    const metaLines = [
      `Book Title: ${currentBook.title}`,
      currentBook.author ? `Author: ${currentBook.author}` : "",
      currentBook.description ? `Description: ${currentBook.description}` : "",
      currentBook.language ? `Language: ${currentBook.language}` : "",
    ].filter(Boolean).join("\n");

    const cachedPages = Object.entries(pageTexts)
      .filter(([, txt]) => txt && txt.trim().length > 10)
      .map(([pageNum, txt]) => `[Page ${pageNum}]\n${cleanOcrTextForAi(txt.trim())}`)
      .join("\n\n");

    return [metaLines, cachedPages].filter(Boolean).join("\n\n");
  }

  // ── Chapter scope ────────────────────────────────────────────────
  // A window of pages around the current one. Three tiers, in order:
  //  1. Already-cached page text (pageTexts, populated as the user
  //     reads) when there's enough of it — free and instant.
  //  2. A SMALL, BOUNDED extraction for just this window: text layer
  //     first, then OCR (via pageTextExtractor's resolvePageText, which
  //     already caches by page — shared with whatever the reader itself
  //     OCRs as the user scrolls) ONLY for pages the text layer came up
  //     empty on. This is what makes chapter scope actually work for
  //     scanned/illustrated books (Nalanda, Chandrayaan-3) that have no
  //     embedded text layer at all — a plain getTextContent() pass
  //     alone always came back empty for those, which is why chapter
  //     summaries there kept coming back "not available in the provided
  //     content": the context sent to the AI genuinely WAS empty.
  //  3. If, even after both, there still isn't enough real text, this
  //     returns whatever partial/best-effort text WAS found (source:
  //     "partial") rather than silently padding out to a full chapter
  //     claim — or "empty" if there's truly nothing, so the caller can
  //     skip the AI call entirely instead of sending it nothing.
  // Every tier runs through dedupeChapterText so repeated running
  // headers/footers or repeated OCR fragments don't pad out the count.
  const MIN_CHAPTER_CONTEXT_CHARS = 250; // enough to confidently call it a "chapter" summary
  const MIN_USEFUL_CONTEXT_CHARS = 30;   // below this, there's nothing worth sending to the AI at all
  const CHAPTER_OCR_CONCURRENCY = 2;     // bounded — OCR is expensive, this is Tesseract's own known-safe fan-out
  const CHAPTER_EXTRACT_TIMEOUT_MS = 20000; // never let a slow/stuck OCR pass hang the UI with no Retry

  async function getChapterText(centerPage: number): Promise<{ text: string; source: "cache" | "extracted" | "partial" | "empty"; pages: number }> {
    const start = Math.max(1, centerPage - CHAPTER_WINDOW_PAGES);
    const end = Math.min(totalPages, centerPage + CHAPTER_WINDOW_PAGES);

    const cachedPagesInRange = Object.keys(pageTexts).filter((p) => {
      const n = Number(p);
      return n >= start && n <= end && (pageTexts[n] || "").trim().length > 10;
    });
    const cachedWindowText = dedupeChapterText(cleanOcrTextForAi(buildChapterWindowText(pageTexts, centerPage, CHAPTER_WINDOW_PAGES)));

    if (cachedWindowText.length >= MIN_CHAPTER_CONTEXT_CHARS && cachedPagesInRange.length >= 2) {
      return { text: cachedWindowText, source: "cache", pages: cachedPagesInRange.length };
    }

    // Tier 2 — bounded direct extraction (never OCR the whole book, and
    // never re-OCR a page pageTextExtractor already has cached). Wrapped
    // in withTimeout so a stuck/slow page render or OCR pass (Tesseract
    // is slow at best, and this codebase has documented environments
    // where pdf.js's page.render() itself stalls) can never hang the UI
    // forever with no Retry — it just falls through to whatever's best
    // between this and the cache tier, same as if extraction found
    // nothing. Any pages that DO finish later are still cached by
    // pageTextExtractor for next time, even though this call stopped
    // waiting for them.
    let extractedText = "";
    let extractedPages = 0;
    try {
      const pdf = await getSharedPdfDocument();
      setAiResponse(t.premiumReaderReadingNearbyPages);
      const pageNumbers: number[] = [];
      for (let p = start; p <= end; p++) pageNumbers.push(p);
      const perPage = await withTimeout(
        mapWithConcurrency(pageNumbers, CHAPTER_OCR_CONCURRENCY, async (p) => {
          try {
            const { text } = await resolvePageText(pdf, currentBook.pdf, p);
            const cleaned = cleanOcrTextForAi(text);
            return cleaned.length > 10 ? `[Page ${p}]\n${cleaned}` : null;
          } catch {
            return null; // one unreadable/un-OCR-able page shouldn't abort the rest
          }
        }),
        CHAPTER_EXTRACT_TIMEOUT_MS,
        [] as (string | null)[]
      );
      const found = perPage.filter((t): t is string => t !== null);
      extractedText = dedupeChapterText(found.join("\n\n"));
      extractedPages = found.length;
    } catch (err) {
      console.error("[ChapterScope] range extraction failed:", err);
    }

    const best = extractedText.length > cachedWindowText.length
      ? { text: extractedText, pages: extractedPages, viaExtraction: true }
      : { text: cachedWindowText, pages: cachedPagesInRange.length, viaExtraction: false };

    if (best.text.length >= MIN_CHAPTER_CONTEXT_CHARS && best.pages >= 2) {
      return { text: best.text, source: best.viaExtraction ? "extracted" : "cache", pages: best.pages };
    }
    if (best.text.length >= MIN_USEFUL_CONTEXT_CHARS) {
      return { text: best.text, source: "partial", pages: best.pages };
    }
    return { text: "", source: "empty", pages: 0 };
  }

  // ── Entire-book scope, generalized ────────────────────────────────
  // Used by ALL Quick Actions (Explain/Summarize/Translate/Quiz/
  // Flashcards/Notes) and Ask AI when scope === "book" — not just quiz.
  // For a book with real extractable text, this "chunks safely": the
  // extracted text is split on page boundaries into a few pieces, each
  // gets its own AI call in parallel, and a final call combines those
  // partial results into one polished, non-repetitive answer. A short
  // book that fits in one chunk skips straight to a single call.
  // `useHistory` defaults to false: Quick Actions / scope-driven calls
  // are each a FRESH, discrete request, not a conversation turn. Passing
  // history into them was the root cause of Page/Chapter/Entire Book
  // producing near-identical answers — the prompt text for e.g.
  // "Summarize" is the same regardless of scope, so with recent history
  // attached the model saw what looked like a repeated question and
  // anchored to its previous answer instead of processing the new
  // (larger) content block. Only askPremiumAI's free-text follow-ups
  // pass true. Every call still WRITES to history regardless (so a
  // later Ask AI follow-up can still reference a Quick Action's result)
  // — only whether history is SENT to the model is gated.
  async function runEntireBookAction(
    action: string, basePrompt: string, useHistory: boolean = false, onSuccess?: () => void
  ): Promise<boolean> {
    resetInteractionState();
    setAiLoading(true);
    setAiFailed(false);
    setAiResponse(t.premiumReaderReadingEntireBook);
    lastAiCallRef.current = () => { runEntireBookAction(action, basePrompt, useHistory, onSuccess); };

    try {
      const { text, weak } = await getFullBookText();

      if (weak) {
        const context = buildBookMetadataContext();
        const scopeInstruction = `IMPORTANT: Page-by-page text extraction for this book was limited or unavailable — it is likely an illustrated or scanned book. You have been given the book's title, description, and any page context that IS cached instead. Using ONLY this context: ${basePrompt} Do NOT say you only have access to one page, do NOT ask the user to provide more page content, and do NOT refuse — always produce a complete, useful response grounded in the available context.`;
        logScopeDebug({ scope: "book", source: "weak-fallback (metadata + cached pages)", pages: Object.keys(pageTexts).length, chars: context.length });
        return await runAI(scopeInstruction, context, undefined, "Entire Book (limited extraction available)", action, "entire book", useHistory, onSuccess);
      }

      const chunks = chunkBookText(text, BOOK_CHUNK_SIZE);
      const pagesExtracted = (text.match(/\[Page \d+\]/g) || []).length;

      if (chunks.length <= 1) {
        const scopeInstruction = `You have been given text extracted from across the entire book (possibly capped for length). ${basePrompt} Draw from the WHOLE book, not just one page — never say you only have access to a single page.`;
        logScopeDebug({ scope: "book", source: "full extraction (single chunk)", pages: pagesExtracted, chars: text.length });
        return await runAI(scopeInstruction, `Full text extracted from "${book}":\n\n${text}`, undefined, "Entire Book", action, "entire book", useHistory, onSuccess);
      }

      logScopeDebug({ scope: "book", source: `full extraction (chunked x${chunks.length})`, pages: pagesExtracted, chars: text.length });
      setAiResponse(t.premiumReaderReadingEntireBookChunks.replace("{count}", String(chunks.length)));
      const partials = await Promise.all(chunks.map((chunk, i) =>
        callAskAI(
          `From ONLY this section of the book "${book}": ${basePrompt} Be concise — this is one part of a larger combined result, so skip a full intro/outro.`,
          book, readerPage, `Book section ${i + 1} of ${chunks.length}:\n\n${chunk}`, language, undefined,
          `Entire Book — Section ${i + 1}/${chunks.length}`, DEPTH_TO_STUDY_MODE[depth], undefined, "entire book"
        )
      ));

      setAiResponse(t.premiumReaderCombiningSections);
      const combinePrompt = `You were given ${chunks.length} partial results, each generated independently from a different section of the same book "${book}" for the same request: "${basePrompt}". Combine them into ONE polished, non-repetitive, well-organized final result. Remove duplicate items, resolve inconsistencies, and present a single coherent output — do not mention that it was assembled from parts.`;
      const combinedContent = partials.map((p, i) => `--- Section ${i + 1} result ---\n${p}`).join("\n\n");
      const finalAnswer = await callAskAI(
        combinePrompt, book, readerPage, combinedContent, language, undefined,
        "Entire Book — Combined", DEPTH_TO_STUDY_MODE[depth], undefined, "entire book"
      );

      setAiResponse(finalAnswer);
      setAiHistory(prev => [...prev, { question: basePrompt, answer: finalAnswer }].slice(-AI_HISTORY_LIMIT));
      const feature = mapActionToAIFeature(action);
      if (feature) {
        trackAIUsage(feature);
        logActivity("ai", `AI ${action} (entire book) used while reading "${book}"`);
      }
      onSuccess?.();
      return true;
    } catch (err) {
      console.error("[EntireBookAction] failed:", err);
      setAiResponse(t.premiumReaderAiUnavailable);
      setAiFailed(true);
      return false;
    } finally {
      setAiLoading(false);
    }
  }

  // ── Page / chapter / (dispatch to) book scope — shared by Quick
  // Actions and Ask AI's free-text questions. Selected text is handled
  // separately by the floating toolbar / askPremiumAI, never here.
  // `useHistory` — see the comment on runEntireBookAction above. ───────
  async function runScopedContentAI(
    prompt: string, action: string, useHistory: boolean = false, onSuccess?: () => void
  ): Promise<boolean> {
    if (scope === "book") return runEntireBookAction(action, prompt, useHistory, onSuccess);

    if (scope === "chapter") {
      // Chapter's own extraction pass (tier 2, when the cache is thin)
      // can take real time — set the busy state HERE, before it starts,
      // not just once runAI is reached, so Quick Actions are disabled
      // and the UI reads as "working" for the whole pipeline, not just
      // the network call at the end of it.
      resetInteractionState();
      setAiLoading(true);
      setAiFailed(false);
      const { text: chapterText, source, pages } = await getChapterText(readerPage);
      const label = `Chapter around ${pageDescription(readerPage)}`;
      logScopeDebug({ scope: "chapter", source, pages, chars: chapterText.length });

      if (source === "empty") {
        // Never send an effectively-empty context to the API — that's
        // exactly what produced bare "not available in the provided
        // content" replies. A clear, honest local message instead, no
        // AI call at all. Still a SUCCESSFUL resolution (not a failure —
        // no Retry needed), so onSuccess still fires (e.g. clears Ask
        // AI's input the same as any other resolved turn).
        setAiResponse(
          `We couldn't find readable text near ${pageDescription(readerPage)} of "${book}" yet — this section may be image-only. ` +
          `Try Explain/Summarize on a page you've already viewed, or switch to Entire Book scope.`
        );
        setAiLoading(false);
        onSuccess?.();
        return true;
      }

      const confident = source === "cache" || source === "extracted";
      const content = `Content from ${label} of "${book}" (${pages} nearby page(s) combined):\n\n${chapterText}`;
      const scopeInstruction = confident
        ? `Answer using CHAPTER-level scope — a window of pages around ${pageDescription(readerPage)}, not just the single visible page. Never say you only have access to one page. ${prompt}`
        : `IMPORTANT: Only partial/limited text could be found for the pages near ${pageDescription(readerPage)} — likely an illustrated or lightly-texted section. Using ONLY this context: ${prompt} Begin your response with exactly: "Based on the nearby pages currently available, here is what I can share:" — do not call this a complete chapter summary, do NOT say the content is not available, and do NOT refuse; always produce a useful response from what's given, however partial.`;
      return runAI(scopeInstruction, content, undefined, label, action, "current chapter", useHistory, onSuccess);
    }

    const { content, imageDataUrl } = getCurrentPageContentForAI();
    logScopeDebug({
      scope: "page",
      source: imageDataUrl ? "canvas image fallback" : (getVisiblePageText().length > 50 ? "visible page cache" : "no cached text yet"),
      pages: isSpreadBook && readerPage > 1 ? 2 : 1,
      chars: content.length,
    });
    return runAI(prompt, content, imageDataUrl, undefined, action, "current page/spread", useHistory, onSuccess);
  }

  // ── Navigation ──────────────────────────────────────────────────────
  // Page-state updates immediately on click — no artificial delay before
  // the page number itself changes. PdfBookSpread derives its own
  // enter-transition direction from the raw page-number delta, so there
  // is nothing left for this component to orchestrate around a flip.
  function goNext() {
    autoFitDone.current = false;
    setReaderPage(p => getNextSpreadCursor(p, totalPages, currentBook.layout));
  }
  function goPrev() {
    autoFitDone.current = false;
    setReaderPage(p => getPrevSpreadCursor(p, currentBook.layout));
  }
  function fitScreen() { setZoom(100); setPan({ x: 0, y: 0 }); autoFitDone.current = false; }

  // Navigates directly by the internal PDF page index — no printed-page
  // resolution involved. Used once a target pdfPage is already known
  // (Go to Page after it resolves, Study Workspace jump-to-highlight,
  // which already stores the stable pdfPage key).
  function navigateToPdfPage(target: number) {
    autoFitDone.current = false;
    const pdfPage = Math.min(Math.max(1, target), totalPages);
    setReaderPage(snapSpreadCursor(pdfPage, currentBook.layout));
  }

  // "Go to page" always means the printed page number — for a book with
  // a verified static map that's a real printed-page label; for a book
  // with no map at all it falls back to the raw PDF page number (see
  // resolvePrintedPageTarget), which is the only sensible number to
  // accept when there's no printed-page data to translate against.
  // Resolved entirely synchronously against the book's static map
  // (lib/printedPageMap.ts) — no OCR, no background indexing, nothing
  // to wait for, so there is no window in which a second, overlapping
  // request could resolve out of order and show a stale result (that was
  // the root cause of a previous "typed 10, saw an error about 15" bug:
  // the old version awaited an indexing result, so typing a new page
  // before the first request finished left two in flight at once, and
  // whichever settled last won regardless of which the user typed most
  // recently). Every call here runs start-to-finish in one synchronous
  // pass: parse the CURRENT input, clear any previous message, resolve,
  // done.
  function goToPage(raw: string) {
    const n = parseInt(raw.trim(), 10);
    if (isNaN(n) || n < 1) return;
    setGoToInput("");
    setAiResponse(""); // clear any previous Go to Page message before showing a new one

    const pdfPage = resolvePrintedPageTarget(n, printedPageMap, totalPages);
    if (pdfPage !== null) {
      navigateToPdfPage(pdfPage);
    } else {
      setAiResponse(t.premiumReaderPageNotFound.replace("{page}", String(n)).replace("{book}", book));
    }
  }

  // ── AI ───────────────────────────────────────────────────────────────
  // The single funnel every AI call in this file ultimately goes
  // through — Quick Actions, chapter/book scope, selection actions, and
  // Ask AI. Threads in the current depth (study mode) and follow-up
  // history, records the retry thunk, and NEVER leaves aiResponse blank
  // on failure. Returns whether the call succeeded so callers that hold
  // their own transient state (e.g. askPremiumAI's typed question) can
  // restore it after a failure.
  // A fully-resolved, self-contained copy of everything one AI call
  // needs — captured ONCE at call time so Retry replays the EXACT
  // original request (question, scope, depth/study-mode, response
  // language, content) even if the user changes the scope/depth/
  // language selectors between the failure and clicking Retry.
  type AiCallSnapshot = {
    prompt: string; content: string; imageDataUrl?: string; chapterOverride: string;
    action?: string; scopeLabel: string; language: Lang; studyMode: string; history?: AiTurn[];
    /** Called once, only after a CONFIRMED successful response — never
     *  on failure. Captured in the same frozen snapshot Retry replays,
     *  so e.g. askPremiumAI's "clear the input" only ever fires once the
     *  request actually succeeds, whether that's the first attempt or a
     *  later Retry — Retry bypasses askPremiumAI entirely (it calls this
     *  snapshot directly), so relying on askPremiumAI's own call site to
     *  clear the input would silently stop working after any retry. */
    onSuccess?: () => void;
  };

  async function executeAiCall(snapshot: AiCallSnapshot): Promise<boolean> {
    resetInteractionState();
    setAiLoading(true);
    setAiFailed(false);
    setAiResponse(t.aiCompanionThinking);
    lastAiCallRef.current = () => { executeAiCall(snapshot); };

    // A brand new call always supersedes whatever was still in flight —
    // its eventual (stale) response should never land after this one.
    activeAbortControllerRef.current?.abort();
    const controller = new AbortController();
    activeAbortControllerRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

    try {
      const answer = await callAskAI(
        snapshot.prompt, book, readerPage, snapshot.content, snapshot.language, snapshot.imageDataUrl,
        snapshot.chapterOverride, snapshot.studyMode, snapshot.history, snapshot.scopeLabel, controller.signal
      );
      setAiResponse(answer);
      setAiHistory(prev => [...prev, { question: snapshot.prompt, answer }].slice(-AI_HISTORY_LIMIT));
      const feature = mapActionToAIFeature(snapshot.action);
      if (feature) {
        trackAIUsage(feature);
        logActivity("ai", `AI ${snapshot.action} used while reading "${book}"`);
      }
      snapshot.onSuccess?.();
      return true;
    } catch (err) {
      // Deliberately ONE message for every failure type (network error,
      // non-200 response, invalid JSON, timeout, or an aborted request)
      // — no implementation-detail wording, and the previous successful
      // response (if any) stays exactly as it was until Retry succeeds,
      // since this only ever calls setAiResponse with the error text,
      // never clears it to blank.
      console.error("[AI] request failed:", err);
      setAiResponse(t.premiumReaderAiUnavailable);
      setAiFailed(true);
      return false;
    } finally {
      clearTimeout(timeoutId);
      if (activeAbortControllerRef.current === controller) activeAbortControllerRef.current = null;
      setAiLoading(false);
    }
  }

  async function runAI(
    prompt: string, content?: string, imageDataUrl?: string,
    chapterOverride?: string, action?: string, scopeLabel: string = "current page",
    /** Whether to send recent conversation history to the model. Only
     *  askPremiumAI's free-text follow-ups pass true — see the comment
     *  on runEntireBookAction for why Quick Actions/scope calls don't. */
    useHistory: boolean = false,
    onSuccess?: () => void
  ): Promise<boolean> {
    // Same tier-1/2/3 fallback as the page-scope caller above — only
    // actually invoked (and only captures a canvas) when a caller didn't
    // already build its own `content`, e.g. Quick Actions with no
    // explicit scope handling falling through to here.
    const usingFallback = content === undefined;
    const fallback = usingFallback ? getCurrentPageContentForAI() : null;
    return executeAiCall({
      prompt, content: content ?? fallback!.content, imageDataUrl: imageDataUrl ?? fallback?.imageDataUrl,
      chapterOverride: chapterOverride ?? pageDescription(readerPage),
      action, scopeLabel, language, studyMode: DEPTH_TO_STUDY_MODE[depth],
      history: useHistory ? aiHistory : undefined,
      onSuccess,
    });
  }

  // ── QUICK ACTION RUNNER — shared by AICompanion's sidebar buttons AND
  //    Voice Assistant's "explain/summarize/translate/quiz/flashcards"
  //    commands, so both paths produce identical behavior and AI-usage
  //    tracking instead of two competing implementations. Scope
  //    (page/chapter/book) comes from the `scope` selector, not the
  //    button itself — see runScopedContentAI. ──────────────────────────
  function runQuickAction(label: string, prompt: string) {
    const quickAction = label.includes("Explain") ? "explain"
      : label.includes("Summarize") ? "summarize"
      : label.includes("Translate") ? "translate"
      : label.includes("Quiz") ? "quiz"
      : label.includes("Flashcards") ? "flashcards"
      : label.includes("Notes") ? "notes"
      : undefined;
    runScopedContentAI(prompt, quickAction ?? "ask");
  }

  // ── TEXT-MODE ACTION RUNNER ───────────────────────────────────────────
  // Uses ONLY the selected text. Never touches imageData, even if an
  // image crop happens to exist internally alongside it.
  function runTextSelectionAction(text: string, pageNumber: number, action: string) {
    const content = `SELECTED TEXT (${pageDescription(pageNumber)} of "${book}"):\n"""\n${cleanOcrTextForAi(text)}\n"""\nUse ONLY the text above. Do not use any other page content.`;
    let prompt = "";
    switch (action) {
      case "explain":   prompt = `Explain the SELECTED TEXT above clearly for a student. Respond ONLY in: ${language}.`; break;
      case "summarize": prompt = `Summarize the SELECTED TEXT above in concise bullet points. Respond ONLY in: ${language}.`; break;
      case "translate": prompt = `Translate the SELECTED TEXT above into ${language}. Return only the translation. Respond ONLY in: ${language}.`; break;
      case "quiz":      prompt = `Create 3 quiz questions with answers from the SELECTED TEXT above. Respond ONLY in: ${language}.`; break;
      case "notes":     prompt = `Convert the SELECTED TEXT above into clean study notes. Respond ONLY in: ${language}.`; break;
      case "flashcards": prompt = `Create 5 flashcards (FRONT: / BACK: format) from the SELECTED TEXT above. Respond ONLY in: ${language}.`; break;
      case "mcqs":       prompt = `Create 5 multiple-choice questions (with 4 options each and the correct answer marked) from the SELECTED TEXT above. Respond ONLY in: ${language}.`; break;
      case "revision":   prompt = `Create concise revision notes (headings + short bullet points) from the SELECTED TEXT above, suitable for quick exam revision. Respond ONLY in: ${language}.`; break;
      default:          prompt = `${action} Respond ONLY in: ${language}.`;
    }
    return runAI(prompt, content, undefined, "Selected Text", action, "selected text");
  }

  // ── IMAGE-MODE ACTION RUNNER ──────────────────────────────────────────
  // Uses ONLY the cropped image. Never touches selected text, even if a
  // browser text selection happens to exist internally alongside it.
  function runImageSelectionAction(imageData: string, pageNumber: number, action: string, customQuestion?: string) {
    const content = `SELECTED IMAGE from ${pageDescription(pageNumber)} of "${book}". Analyze ONLY this image.`;
    let prompt = "";
    switch (action) {
      case "explain":   prompt = `Explain what is shown in this SELECTED IMAGE clearly for a student. Respond ONLY in: ${language}.`; break;
      case "summarize": prompt = `Describe and summarize the key parts of this SELECTED DIAGRAM in bullet points. Respond ONLY in: ${language}.`; break;
      case "ask":
        prompt = customQuestion
          ? `${customQuestion} Focus on this specific image/diagram. Respond ONLY in: ${language}.`
          : `Analyze this SELECTED IMAGE and answer student questions. Respond ONLY in: ${language}.`;
        break;
      default:          prompt = `${action} Respond ONLY in: ${language}.`;
    }
    return runAI(prompt, content, imageData, `Selected Image (${pageDescription(pageNumber)})`, action, "selected image");
  }

  // ── THE ROUTER — every floating-toolbar button goes through this. ────
  // No button, anywhere, directly inspects window.getSelection() or an
  // image crop. This function alone decides, based on interactionMode,
  // which of the two mode-specific runners above gets called. This is
  // the ONLY place that maps "which mode is on" → "which AI context to use".
  function handleSelectionAction(action: string, customQuestion?: string) {
    if (!activeSelection) return;
    resetInteractionState();

    if (interactionMode === "text") {
      // Defensive: activeSelection should always already be type "text"
      // here (it's only ever created that way while in text mode), but we
      // never trust anything other than the mode itself for routing.
      if (activeSelection.type !== "text") return;
      return runTextSelectionAction(activeSelection.text, activeSelection.pageNumber, action);
    }

    if (interactionMode === "image") {
      if (activeSelection.type !== "image") return;
      return runImageSelectionAction(activeSelection.imageData, activeSelection.pageNumber, action, customQuestion);
    }
  }

  // Free-text "Ask AI". An active text selection always wins here (the
  // most specific context available for a custom question); otherwise
  // falls back to the current scope selector (page/chapter/book), same
  // as the Quick Action buttons. The typed question is NEVER cleared
  // speculatively — it stays in the input for the entire round trip and
  // is only cleared once the request actually succeeds, so a failure
  // never loses (or even briefly blanks) what the user typed. `aiLoading`
  // guards against a second submit (e.g. mashing Enter) firing a
  // duplicate request while one is already in flight.
  async function askPremiumAI() {
    if (!aiQuestion.trim() || aiLoading) return;
    const q = aiQuestion;
    // Passed as onSuccess rather than checked after the call returns —
    // Retry calls the frozen snapshot directly (bypassing this function
    // entirely), so only a callback captured IN the snapshot fires
    // consistently on every eventual success, first attempt or retry.
    const clearInput = () => setAiQuestion("");

    activeSelection && activeSelection.type === "text"
      ? await runAI(
          q,
          `SELECTED TEXT (${pageDescription(activeSelection.pageNumber)} of "${book}"):\n"""\n${cleanOcrTextForAi(activeSelection.text)}\n"""\nAnswer the user's question using this selected text as the primary basis.`,
          undefined, "Selected Text", "ask", "selected text", true, clearInput
        )
      : await runScopedContentAI(q, "ask", true, clearInput);
  }

  // ── Read Aloud ────────────────────────────────────────────────────────
  // Speaks a sequence of chunks one after another via the browser's
  // native speechSynthesis queue. Chunked (rather than one long
  // utterance) because Chrome/Edge — especially on Windows, and
  // especially with non-English voices — are known to silently cut off
  // a single long utterance after only a few words; short sentence-
  // bounded chunks sidestep that. Pause/resume work unmodified since
  // they act on whichever chunk is currently speaking; `stoppedRef`
  // stops the chain from advancing to the next chunk after an explicit
  // Stop (as opposed to a chunk finishing normally).
  function speakSequence(
    chunks: string[],
    voice: SpeechSynthesisVoice | null,
    langCode: string | undefined,
    setState: (s: SpeechState) => void,
    stoppedRef: { current: boolean }
  ) {
    const synth = window.speechSynthesis;
    stoppedRef.current = false;
    let i = 0;
    function speakNext() {
      if (stoppedRef.current) return;
      if (i >= chunks.length) { setState("idle"); return; }
      const utt = new SpeechSynthesisUtterance(chunks[i]);
      if (langCode) utt.lang = langCode;
      if (voice) utt.voice = voice;
      utt.rate = 0.92;
      utt.onend = () => { i += 1; speakNext(); };
      utt.onerror = () => { setState("idle"); };
      synth.speak(utt);
    }
    setState("speaking");
    speakNext();
  }

  // "Read AI Response" (below) is a separate, one-off player untouched
  // by this unification — stopAiSpeech is still what the unified reading
  // engine calls before it starts speaking, since both ultimately share
  // the one browser speechSynthesis queue.
  function stopAiSpeech() {
    aiSpeechStoppedRef.current = true;
    setAiSpeechState("idle");
  }

  // "Read AI Response" — reads ONLY the AI Companion's current output
  // (markdown stripped first), in the response's own language via the
  // existing response-language selector, with proper Hindi/Indic voice
  // selection (Phase C2 fix). Starting this pauses the unified reader
  // (Read Page/Chapter/Book) first — same one-speaker-at-a-time rule.
  async function handleReadAiResponse() {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (aiSpeechState === "speaking") { synth.pause(); setAiSpeechState("paused"); return; }
    if (aiSpeechState === "paused")  { synth.resume(); setAiSpeechState("speaking"); return; }
    if (!aiResponse.trim() || aiLoading) return;

    if (playerMode) pauseReader();
    synth.cancel();
    setAiVoiceNotice(null);
    setAiSpeechState("loading");

    const plainText = stripMarkdownForSpeech(aiResponse);
    const langCode = getSpeechLanguage(language);
    const voices = await loadVoices();
    const { voice, tier } = pickVoiceForLanguage(voices, langCode);

    // Only non-English languages get a notice — an exact/prefix match
    // (or simply "English", which virtually every engine supports)
    // never needs one. Never silently fall back to an English voice
    // for a non-English response without saying so.
    if (language !== "English" && tier !== "exact" && tier !== "prefix") {
      setAiVoiceNotice(t.premiumReaderVoiceNotInstalled.replace("{language}", language));
    }

    const chunks = splitIntoSpeechChunks(plainText);
    if (chunks.length === 0) { setAiSpeechState("idle"); return; }

    speakSequence(chunks, voice, langCode, setAiSpeechState, aiSpeechStoppedRef);
  }
  function handleStopAiResponse() {
    stopAiSpeech();
    window.speechSynthesis?.cancel();
  }

  // ══════════════════════════════════════════════════════════════════
  // Enhanced Read Aloud — Read Chapter / Read Book (continuous mode)
  // Mobile only. Reuses the exact same primitives "Read Page" and the
  // AI scope pipeline already established above: resolvePageText (per-
  // page cache + OCR fallback, so a page is never re-OCR'd), pageTexts
  // (populated as the reader renders pages, read here first before
  // falling back to extraction), sanitizeForSpeech/cleanOcrTextForAi,
  // splitIntoSpeechChunks. No new PDF pipeline.
  // ══════════════════════════════════════════════════════════════════

  // ── Shared page-text resolution pipeline ─────────────────────────────
  // The ONE resolver ALL THREE modes (Page/Chapter/Book) call — this is
  // the actual fix for "Read Page says no text while Read Book reads the
  // same page fine": Read Page used to read only from the passive
  // pageTexts cache (embedded-text-only, populated by the page renderer
  // as it draws pages), with no OCR fallback at all. Order, per spec:
  //   1. Valid cached text (pageTexts) — free/instant.
  //   2. Embedded PDF text (resolvePageText's own getSelectableText).
  //   3. OCR fallback, ONLY if embedded text was empty — resolvePageText
  //      already sequences this correctly and cleans the OCR result
  //      (cleanOcrText) before caching it.
  //   4. A typed "none" result if both genuinely failed — callers must
  //      treat this as "no text," never speak an empty string silently.
  // Caching is book-scoped: resolvePageText's own cache key is
  // `${pdfPath}::${page}` (lib/premium-reader/pageTextExtractor.ts), and
  // pageTexts itself is fully cleared on every book change (see the
  // page/book-change effect), so neither cache can ever leak text from
  // one book into another.
  async function resolveReadingPageText(pageNum: number): Promise<PageTextResolution> {
    const cached = pageTexts[pageNum];
    if (cached && cached.trim().length > 0) return { text: cached, source: "cache" };
    try {
      const pdf = await getSharedPdfDocument();
      const { text, source } = await resolvePageText(pdf, currentBook.pdf, pageNum);
      if (text && text.trim().length > 0) {
        setPageTexts(prev => (prev[pageNum] ? prev : { ...prev, [pageNum]: text }));
        return { text, source };
      }
      return { text: "", source: "none" };
    } catch {
      return { text: "", source: "none" };
    }
  }
  // Kicks off extraction for the NEXT page in the background — but only
  // ever called AFTER the current page's first utterance has actually
  // started (see startReading's onFirstAudibleStart below), never
  // before, so preload can never compete with or delay current speech.
  function preloadPageText(pageNum: number) {
    if (nextPageTextCacheRef.current?.page === pageNum) return;
    nextPageTextCacheRef.current = { page: pageNum, promise: resolveReadingPageText(pageNum) };
  }
  async function getPageTextWithPreload(pageNum: number): Promise<PageTextResolution> {
    if (nextPageTextCacheRef.current?.page === pageNum) {
      const { promise } = nextPageTextCacheRef.current;
      nextPageTextCacheRef.current = null;
      return promise;
    }
    return resolveReadingPageText(pageNum);
  }

  // Promise-based chunk speaker (speakSequence above is callback/state-
  // driven only, no way to await completion) — resolves once every
  // chunk has finished, OR immediately once stopped/superseded (checked
  // via BOTH the stoppedRef flag and a generation token, since a brand
  // new reading session bumping the token is exactly as valid a "stop
  // the old one" signal as an explicit Close tap).
  //
  // Reads playerSpeedRef.current (not a `speed` parameter captured once
  // at call time) for EVERY utterance, and stashes its own speakCurrent
  // closure in speakCurrentChunkFnRef so restartCurrentChunkAtNewSpeed
  // (below) can re-invoke the EXACT SAME continuation — same chunk
  // index, same eventual `resolve` — instead of running a second,
  // parallel chain that would never settle this promise. The chosen
  // restart granularity is "current sentence," not word-level (not
  // recoverable from the Web Speech API once an utterance is cancelled).
  //
  // onFirstAudibleStart fires once, for chunk index 0 of THIS call only
  // — on the browser's real 'start' event when available (fires once
  // audio genuinely begins), with a short fallback timer in case a
  // browser/environment never fires it, so playerStatus can never get
  // stuck on "starting" and next-page preload always eventually arms.
  function speakChunksContinuous(
    chunks: string[], stoppedRef: { current: boolean },
    token: number, tokenRef: { current: number },
    onFirstAudibleStart?: () => void
  ): Promise<void> {
    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      chunkStateRef.current = { chunks, index: 0 };
      let firstStartFired = false;
      function fireFirstStartOnce() {
        if (firstStartFired) return;
        firstStartFired = true;
        onFirstAudibleStart?.();
      }
      function speakCurrent() {
        const state = chunkStateRef.current;
        if (!state || stoppedRef.current || tokenRef.current !== token) {
          chunkStateRef.current = null;
          speakCurrentChunkFnRef.current = null;
          resolve();
          return;
        }
        if (state.index >= state.chunks.length) {
          chunkStateRef.current = null;
          speakCurrentChunkFnRef.current = null;
          resolve();
          return;
        }
        const mySession = ++chunkSessionRef.current;
        const utt = new SpeechSynthesisUtterance(state.chunks[state.index]);
        utt.rate = playerSpeedRef.current;
        if (state.index === 0) {
          utt.onstart = fireFirstStartOnce;
          // Fallback: not every browser/environment reliably fires
          // 'start' — this guarantees playerStatus still advances
          // "starting" → "playing" (and next-page preload still arms)
          // within a bounded time even then, while still preferring the
          // real event when it does fire (fires within a few ms on a
          // real device).
          setTimeout(fireFirstStartOnce, 150);
        }
        utt.onend = () => {
          // A speed-triggered restart bumps chunkSessionRef and starts a
          // fresh utterance before this one's onend/onerror can fire —
          // if the session moved on without us, this utterance was
          // superseded, not genuinely finished, so don't double-advance.
          if (chunkSessionRef.current !== mySession || !chunkStateRef.current) return;
          chunkStateRef.current.index += 1;
          speakCurrent();
        };
        utt.onerror = () => {
          // Also fires for the cancel() a speed-change restart performs
          // on the outgoing utterance — same supersession check, so that
          // expected cancellation doesn't prematurely resolve the whole
          // page's speech promise.
          if (chunkSessionRef.current !== mySession) return;
          chunkStateRef.current = null;
          speakCurrentChunkFnRef.current = null;
          resolve();
        };
        synth.speak(utt);
      }
      speakCurrentChunkFnRef.current = speakCurrent;
      speakCurrent();
    });
  }

  // Called from the speed <select>'s onChange while actively playing —
  // cancels the currently-playing utterance and immediately re-invokes
  // the SAME speakCurrent closure speakChunksContinuous is already
  // running (same chunk index, same continuation/resolve), just with a
  // fresh utterance built from the new playerSpeedRef value. While
  // paused/starting/idle there's nothing in-flight to restart; the new
  // rate simply applies to whichever utterance starts next (resume, or
  // the next chunk/page).
  function restartCurrentChunkAtNewSpeed() {
    if (playerStatus !== "playing" || !chunkStateRef.current || !speakCurrentChunkFnRef.current) return;
    chunkSessionRef.current += 1; // invalidate the outgoing utterance's handlers before cancelling it
    window.speechSynthesis.cancel();
    speakCurrentChunkFnRef.current();
  }

  // ── Chapter-end detection ────────────────────────────────────────
  // No chapter/TOC metadata exists anywhere in this app (confirmed
  // elsewhere in this file — Contents only ever listed raw page
  // numbers). Per spec: never invent a chapter boundary. This is a
  // best-effort HEADING scan bounded to CHAPTER_HEADING_SCAN_CAP pages
  // ahead — a page whose first text line either matches a plain
  // "Chapter/Part/Section N" pattern, or is set in a visibly larger
  // font than the rest of that page's own body text, is treated as the
  // start of the NEXT section; the current one is read through the page
  // just before it. Returns null (never a guess) if nothing plausible
  // turns up within the scan cap — callers must show the honest
  // "not available" prompt in that case, not fall back to totalPages
  // silently.
  const CHAPTER_HEADING_SCAN_CAP = 60;
  async function findChapterEndPage(startPage: number): Promise<number | null> {
    try {
      const pdf = await getSharedPdfDocument();
      const lastScan = Math.min(totalPages, startPage + CHAPTER_HEADING_SCAN_CAP);
      for (let p = startPage + 1; p <= lastScan; p++) {
        let items: any[];
        try {
          const page = await pdf.getPage(p);
          const textContent = await page.getTextContent();
          items = textContent.items as any[];
        } catch { continue; }
        if (!items.length) continue;
        const heights = items
          .map((it) => Math.hypot(it.transform?.[2] || 0, it.transform?.[3] || 0))
          .filter((h) => h > 0);
        if (!heights.length) continue;
        const sorted = [...heights].sort((a, b) => a - b);
        const medianH = sorted[Math.floor(sorted.length / 2)];
        const first = items[0];
        const firstText = String(first?.str || "").trim();
        const firstH = Math.hypot(first?.transform?.[2] || 0, first?.transform?.[3] || 0);
        const looksLikeHeadingText = /^(chapter|part|section)\s+[\divxlcdm]+/i.test(firstText)
          || /^(chapter|part)\s+\w+/i.test(firstText);
        const looksLikeLargeFont = firstH > medianH * 1.3 && firstText.length > 0 && firstText.length < 60;
        if (looksLikeHeadingText || looksLikeLargeFont) return p - 1;
      }
    } catch (err) {
      console.error("[ReadChapter] heading scan failed:", err);
    }
    return null;
  }

  // ── Sleep timer (optional) ───────────────────────────────────────
  function clearSleepTimer() {
    if (sleepTimerHandleRef.current) { clearTimeout(sleepTimerHandleRef.current); sleepTimerHandleRef.current = null; }
    sleepTimerEndPageRef.current = null;
  }
  async function applySleepTimer(option: SleepTimerOption) {
    clearSleepTimer();
    setSleepTimerOption(option);
    // "off" and "End of Book" are functionally identical — no early
    // cutoff, reading continues naturally to whatever this session's own
    // end page already is (totalPages for Read Book, the detected
    // chapter end for Read Chapter). Kept as a separate, clearly-labeled
    // menu option rather than aliasing it away in the UI, per spec.
    if (option === "off" || option === "endOfBook") return;
    if (option === "endOfChapter") {
      // Reuses the chapter-mode end page if already reading a chapter;
      // otherwise runs the same honest heading scan from the current
      // page. If that scan also can't find a boundary, the timer simply
      // has nothing to trigger on (never invents one) — reading
      // continues normally to the end of the book.
      const target = playerMode === "chapter" && playerEndPage != null
        ? playerEndPage
        : await findChapterEndPage(readerPage);
      sleepTimerEndPageRef.current = target;
      return;
    }
    const minutes = Number(option);
    sleepTimerHandleRef.current = setTimeout(() => closeReader(), minutes * 60 * 1000);
  }

  // ── Unified reading engine core ────────────────────────────────────
  // Close ends the session entirely: cancels speech, hides the player,
  // clears transient error/menu state. Page-level Read Book progress is
  // DELIBERATELY left alone here (only a natural full-book completion
  // clears it, below) — per spec, Close must preserve it for later
  // resume, exactly like every other interruption already does.
  function closeReader() {
    // Guards on the REF, not the playerMode state directly — this
    // function is called from the accessibility-panel-state window
    // listener, which is registered once on mount ([] deps) and so
    // always invokes whichever closure existed at that first render.
    // playerModeRef is kept fresh independently (see the effect by its
    // declaration) specifically so a state check here can't ever read a
    // permanently-stale "null" and silently no-op.
    if (playerModeRef.current === null) return;
    readerStoppedRef.current = true;
    readerTokenRef.current += 1;
    window.speechSynthesis?.cancel();
    setPlayerStatus("idle");
    setPlayerMode(null);
    setPlayerEndPage(null);
    setPlayerErrorMessage(null);
    setPlayerMinimized(false);
    readerExpectedPageRef.current = null;
    nextPageTextCacheRef.current = null;
    chunkStateRef.current = null;
    speakCurrentChunkFnRef.current = null;
    clearSleepTimer();
    setSleepTimerOption("off");
  }
  // Pause/Resume use the browser's own most direct pause/resume — no
  // extraction, no OCR, no rebuilt speech pipeline, so Resume is instant
  // and continues from the exact same utterance (mobile Safari's own
  // limits on how long a pause can be held aside — outside this app's
  // control, and the chunk-level restart machinery above already covers
  // the one case genuinely within it: a live SPEED change).
  function pauseReader() {
    window.speechSynthesis?.pause();
    setPlayerStatus("paused");
  }
  function resumeReader() {
    window.speechSynthesis?.resume();
    setPlayerStatus("playing");
  }
  function togglePlayerMinimized() {
    setPlayerMinimized((v) => !v);
  }

  // Mobile shows the full inline error state (message + Retry + Close,
  // +Skip Page for Read Book); desktop has no player card to show that
  // in, so it falls back to speaking the same honest fallback message
  // Read Page always used to, then returns to idle — unchanged desktop
  // behavior, just routed through the same engine/token machinery.
  function enterReadingError(token: number) {
    if (readerTokenRef.current !== token) return;
    if (!isMobileViewport) {
      const chunks = splitIntoSpeechChunks(t.premiumReaderNoReadableText);
      const finish = () => { if (readerTokenRef.current === token) { setPlayerStatus("idle"); setPlayerMode(null); setPlayerEndPage(null); } };
      if (chunks.length > 0) speakChunksContinuous(chunks, readerStoppedRef, token, readerTokenRef).then(finish);
      else finish();
      return;
    }
    window.speechSynthesis?.cancel();
    setPlayerStatus("error");
    setPlayerErrorMessage(t.premiumReaderNoReadableTextOnPage);
  }

  // The ONE entry point Read Page, Read Chapter and Read Book all call.
  // mode "page" is simply startPage === endPage — no other special-
  // casing exists anywhere below; the loop naturally speaks one page and
  // stops. Player appears (playerMode/playerStatus "starting") the
  // instant this is called, per spec — never after extraction completes.
  async function startReading({ mode, startPage, endPage }: { mode: ReadMode; startPage: number; endPage: number }) {
    // Only one "player" speaks at a time — starting a reading session
    // pauses Read AI Response exactly like starting that already pauses
    // this (see handleReadAiResponse above).
    stopAiSpeech();
    window.speechSynthesis?.cancel();

    lastReadingRequestRef.current = { mode, startPage, endPage };
    const token = ++readerTokenRef.current;
    readerStoppedRef.current = false;
    setPlayerMode(mode);
    setPlayerEndPage(endPage);
    setPlayerStatus("starting");
    setPlayerErrorMessage(null);
    setReadMenuOpen(false);

    let page = startPage;
    // Set unconditionally, even when starting from the already-current
    // page (the common case) — leaving this at its initial `null` until
    // the first auto-turn meant a manual page change made BEFORE that
    // first turn went undetected, since the interruption effect only
    // checks readerPage against this ref when it's non-null.
    readerExpectedPageRef.current = page;
    if (page !== readerPage) {
      navigateToPdfPage(page);
      await new Promise((r) => setTimeout(r, 250)); // let the jump settle before extracting/speaking
    }

    while (page <= endPage) {
      if (readerStoppedRef.current || readerTokenRef.current !== token) return;
      setPlayerStatus("starting");
      const resolution = await getPageTextWithPreload(page);
      if (readerTokenRef.current !== token) return;

      // Page-level resume, persisted BEFORE speaking starts — so even if
      // the tab closes mid-page, resume lands on this page, never a
      // half-read one silently skipped.
      if (mode === "book") saveReadBookResume(bookId, page);

      if (resolution.text.trim().length === 0) { enterReadingError(token); return; }
      const spoken = sanitizeForSpeech(cleanOcrTextForAi(resolution.text));
      const chunks = splitIntoSpeechChunks(spoken);
      if (chunks.length === 0) { enterReadingError(token); return; }

      await speakChunksContinuous(chunks, readerStoppedRef, token, readerTokenRef, () => {
        // Fires once, right as this page's speech genuinely becomes
        // audible — never before. Only NOW does status flip to
        // "playing" and next-page preload arm, per spec: preload must
        // never compete with or delay the current page's speech start.
        if (readerTokenRef.current !== token) return;
        setPlayerStatus("playing");
        if (page < endPage) preloadPageText(page + 1);
      });
      if (readerStoppedRef.current || readerTokenRef.current !== token) return;

      if (sleepTimerEndPageRef.current !== null && page >= sleepTimerEndPageRef.current) { closeReader(); return; }
      if (page >= endPage) break;

      page += 1;
      readerExpectedPageRef.current = page;
      navigateToPdfPage(page);
      await new Promise((r) => setTimeout(r, 200)); // brief settle before the next page's text/render
    }

    if (readerTokenRef.current === token) {
      if (mode === "book") clearReadBookResume(bookId);
      readerExpectedPageRef.current = null;
      clearSleepTimer();
      setSleepTimerOption("off");
      if (mode === "page") {
        // A single page read is a quick one-shot action, not an ongoing
        // session — return fully to idle rather than lingering as
        // "completed" (that status is for Chapter/Book reaching their
        // own natural end, where the player stays up so the user can
        // see it finished and decide what's next).
        setPlayerStatus("idle");
        setPlayerMode(null);
        setPlayerEndPage(null);
      } else {
        setPlayerStatus("completed");
      }
    }
  }

  // Re-runs the exact last startReading(...) request — used by the
  // error state's Retry action.
  function retryReader() {
    const req = lastReadingRequestRef.current;
    if (!req) { closeReader(); return; }
    startReading(req);
  }
  // Read Book only, from the error state: skips past whatever page just
  // failed and restarts the engine fresh from the next one. readerPage
  // already reflects the failed page — the engine always navigates to a
  // page before attempting to resolve its text.
  function skipFailedPageInBook() {
    const req = lastReadingRequestRef.current;
    if (!req || req.mode !== "book") return;
    const nextPage = readerPage + 1;
    if (nextPage > req.endPage) { closeReader(); return; }
    startReading({ mode: "book", startPage: nextPage, endPage: req.endPage });
  }

  // ── Read menu actions ────────────────────────────────────────────
  function startReadPageFromMenu() {
    setReadMenuOpen(false);
    startReading({ mode: "page", startPage: readerPage, endPage: readerPage });
  }
  async function startReadChapter() {
    setReadMenuOpen(false);
    if (playerMode) closeReader();
    // Player appears immediately, even during the heading scan below —
    // per spec, the user should never stare at an unresponsive screen
    // while chapter-boundary detection (up to CHAPTER_HEADING_SCAN_CAP
    // pages) runs.
    setPlayerMode("chapter");
    setPlayerStatus("starting");
    setPlayerErrorMessage(null);
    const endPage = await findChapterEndPage(readerPage);
    if (endPage === null || endPage <= readerPage) {
      setPlayerStatus("idle");
      setPlayerMode(null);
      setChapterUnavailableOpen(true);
      return;
    }
    startReading({ mode: "chapter", startPage: readerPage, endPage });
  }
  function startReadBook() {
    setReadMenuOpen(false);
    const resume = getReadBookResume(bookId);
    if (resume && resume.page !== readerPage && resume.page >= 1 && resume.page <= totalPages) {
      setResumePromptPage(resume.page);
      return;
    }
    startReading({ mode: "book", startPage: readerPage, endPage: totalPages });
  }
  function confirmResumeFromSaved() {
    const p = resumePromptPage;
    setResumePromptPage(null);
    if (p) startReading({ mode: "book", startPage: p, endPage: totalPages });
  }
  function confirmStartFromCurrentPage() {
    setResumePromptPage(null);
    startReading({ mode: "book", startPage: readerPage, endPage: totalPages });
  }
  function continueBookAfterChapterUnavailable() {
    // Closes the dialog, then invokes the SAME startReadBook() Read Book
    // itself uses — same function, no second menu interaction, player
    // appears immediately (or the resume prompt does, exactly as if the
    // user had picked Read Book directly).
    setChapterUnavailableOpen(false);
    startReadBook();
  }
  // Header's quick-access red button (portrait/landscape/desktop) —
  // pauses the active session without destroying it, mirroring the
  // player's own Pause control.
  function handleStopAnyReadAloud() {
    pauseReader();
  }

  // ── Voice Assistant integration ─────────────────────────────────────
  // VoiceAssistant (rendered inside AccessibilityToolbar below) never
  // imports anything from this file — it only ever broadcasts a
  // "ndl-voice-command" CustomEvent on window. This is the ONLY place
  // that turns that event into calls to this reader's OWN existing
  // functions (goNext, fitScreen, startReadPageFromMenu, runQuickAction,
  // …). Nothing about page rendering or the page-turn engine itself
  // changes. Voice "read"/"pause"/"resume"/"stop" now drive the SAME
  // unified reading engine everything else does — "read" always means
  // Read Page (a single explicit voice phrase never implies Chapter/
  // Book's multi-page scope), "stop" fully closes (matching the literal
  // word), "pause"/"resume" mirror the player's own controls.
  //
  // A ref kept fresh every render (rather than depending on these
  // functions directly) means the listener below can be registered ONCE
  // on mount without ever acting on stale state — the same stale-closure
  // pitfall already fixed in AccessibilityToolbar's font-size buttons.
  const voiceStateRef = useRef({
    playerMode, playerStatus, language,
    goNext, goPrev, goToPage, setZoom, fitScreen,
    startReadPageFromMenu, pauseReader, resumeReader, closeReader, runQuickAction, setLanguage,
  });
  useEffect(() => {
    voiceStateRef.current = {
      playerMode, playerStatus, language,
      goNext, goPrev, goToPage, setZoom, fitScreen,
      startReadPageFromMenu, pauseReader, resumeReader, closeReader, runQuickAction, setLanguage,
    };
  });

  useEffect(() => {
    function onVoiceCommand(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const v = voiceStateRef.current;

      if (detail.kind === "reader") {
        switch (detail.action) {
          case "nextPage": v.goNext(); break;
          case "prevPage": v.goPrev(); break;
          // Voice "go to page N" always means the printed page — there
          // is only one meaning for "go to page" now.
          case "goToPage": if (detail.page) v.goToPage(String(detail.page)); break;
          case "zoomIn": v.setZoom(z => Math.min(ZOOM_MAX, z + ZOOM_STEP)); break;
          case "zoomOut": v.setZoom(z => Math.max(ZOOM_MIN, z - ZOOM_STEP)); break;
          case "fitPage": v.fitScreen(); break;
          case "fullscreen": if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); break;
          case "exitFullscreen": if (document.fullscreenElement) document.exitFullscreen(); break;
          case "read": if (v.playerMode === null) v.startReadPageFromMenu(); break;
          case "pause": if (v.playerStatus === "playing") v.pauseReader(); break;
          case "resume": if (v.playerStatus === "paused") v.resumeReader(); break;
          case "stop": v.closeReader(); break;
        }
      } else if (detail.kind === "ai") {
        const lang = v.language;
        switch (detail.action) {
          case "explain":
            v.runQuickAction("🧠 Explain", `Explain this clearly for a student in simple language. Respond ONLY in: ${lang}.`);
            break;
          case "summarize":
            v.runQuickAction("📝 Summarize", `Summarize this in at most 8 concise bullet points. Respond ONLY in: ${lang}.`);
            break;
          case "translate": {
            const target = LANGUAGES.find(l => l.toLowerCase() === (detail.language || "").toLowerCase());
            const targetLang = target || lang;
            if (target) v.setLanguage(target);
            v.runQuickAction("🌍 Translate", `Rewrite and explain the content in ${targetLang}. Write entirely in ${targetLang}. Respond ONLY in: ${targetLang}.`);
            break;
          }
          case "quiz":
            v.runQuickAction("❓ Quiz", `Create multiple-choice quiz questions — 5 for a page or chapter, 8 for the entire book. Respond ONLY in: ${lang}.`);
            break;
          case "flashcards":
            v.runQuickAction("🎴 Flashcards", `Create flashcards (FRONT: / BACK: format) — 5 for a page or chapter, 10 for the entire book. Respond ONLY in: ${lang}.`);
            break;
          case "studyTab":
            setOpenStudyTabSignal(s => (s || 0) + 1);
            break;
        }
      }
    }
    window.addEventListener("ndl-voice-command", onVoiceCommand);
    return () => window.removeEventListener("ndl-voice-command", onVoiceCommand);
  }, []);

  // ══════════════════════════════════════════════════════════════════
  // PHASE 2 — Highlights, Notes, Bookmarks, Study Workspace, Revision
  // Cards. Everything in this block is additive: it reads the existing
  // activeSelection/selectionRects/readerPage (produced by the untouched
  // selection engine below) as INPUT, and calls the existing runAI-style
  // machinery for revision cards, but never modifies how a selection or
  // a page turn is created.
  // ══════════════════════════════════════════════════════════════════

  // Convert a screen-space rect into a fraction of the CURRENT page's
  // own bounding box, so it can be re-projected correctly later
  // regardless of zoom level or window size.
  //
  // Measures the canvas's PARENT (the position:relative PageBox wrapper
  // — the exact box PdfBookSpread positions highlight/note overlays
  // against via percentage left/top/width/height), not the canvas
  // element itself. In principle the two are always the same size/
  // position (paintEntry sets canvas.style.width/height to match the
  // same singleSize/leftSize/rightSize the wrapper's inline style uses)
  // — but they're set independently: one via a direct ref mutation
  // (paintEntry), the other via a React state update (setSingleSize).
  // If a highlight/note is created in a moment where those two haven't
  // both landed yet, or the canvas is retained from a differently-sized
  // previous page/cache entry, measuring the canvas produces a rect
  // scaled against the WRONG box — percentages far outside 0–1, placing
  // the overlay off-page (this reproduced exactly as "highlight created,
  // never visible" when tested with a deliberately desynced canvas).
  // Measuring the wrapper directly removes that dependency entirely: it
  // is, by construction, the same box the resulting percentages get
  // applied to.
  function screenRectToPct(rect: ScreenRect, pageNumber: number): RectPct | null {
    const canvas = document.querySelector<HTMLCanvasElement>(`canvas[data-pdf-page="${pageNumber}"]`);
    const box = canvas?.parentElement;
    if (!box) return null;
    const c = box.getBoundingClientRect();
    if (c.width <= 0 || c.height <= 0) return null;
    return {
      left:   (rect.left - c.left) / c.width,
      top:    (rect.top  - c.top)  / c.height,
      width:  rect.width  / c.width,
      height: rect.height / c.height,
    };
  }

  // Note: the inverse (percentage → screen rect) is no longer needed here.
  // PdfBookSpread now renders highlight/note overlays directly from the
  // stored percentages, inside its own page container — there is no
  // separate "project back to screen coordinates" step anymore.

  // ── FEATURE 1: Kindle-style Highlights ──────────────────────────────
  function addHighlight(color: HighlightColor) {
    if (!activeSelection || activeSelection.type !== "text") return;
    // Use the snapshot captured when "⭐ Highlight" was clicked, NOT live
    // selectionRects state — see pendingSelectionRectsRef's comment for why.
    let sourceRects = pendingSelectionRectsRef.current.length > 0
      ? pendingSelectionRectsRef.current
      : selectionRects;
    // Defensive fallback: if it's STILL empty when the color is picked
    // (should not normally happen, but a highlight must never be silently
    // saved with zero visible area), fall back to whatever the browser's
    // live selection reports right now.
    if (sourceRects.length === 0) {
      try {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          sourceRects = Array.from(sel.getRangeAt(0).getClientRects()).map(r => ({
            left: r.left, top: r.top, width: r.width, height: r.height,
          }));
        }
      } catch {}
    }
    const rectsPct = sourceRects
      .map(r => screenRectToPct(r, activeSelection.pageNumber))
      .filter((r): r is RectPct => r !== null);
    const highlight: StoredHighlight = {
      id: newId(),
      bookId,
      page: activeSelection.pageNumber,
      selectedText: activeSelection.text,
      color,
      createdAt: Date.now(),
      rectsPct,
    };
    setHighlights(prev => {
      const next = [...prev, highlight];
      saveHighlights(next);
      return next;
    });
    setShowColorPicker(false);
    pendingSelectionRectsRef.current = [];
  }

  function removeHighlight(id: string) {
    setHighlights(prev => {
      const next = prev.filter(h => h.id !== id);
      saveHighlights(next);
      return next;
    });
  }

  // ── FEATURE 2 & 3: Notes + AI Notes ─────────────────────────────────
  function saveNote(text: string, aiImproved: boolean) {
    if (!activeSelection || activeSelection.type !== "text") return;
    // Same snapshot-ref fix as addHighlight — see pendingSelectionRectsRef.
    const noteSourceRect = pendingSelectionRectsRef.current[0] ?? selectionRects[0];
    const rectPct = noteSourceRect ? screenRectToPct(noteSourceRect, activeSelection.pageNumber) ?? undefined : undefined;
    const note: StoredNote = {
      id: newId(),
      bookId,
      page: activeSelection.pageNumber,
      selectedText: activeSelection.text,
      note: text,
      createdAt: Date.now(),
      rectPct,
      aiImproved,
    };
    setNotes(prev => {
      const next = [...prev, note];
      saveNotes(next);
      return next;
    });
    setShowNotePopover(false);
    pendingSelectionRectsRef.current = [];
  }

  function removeNote(id: string) {
    setNotes(prev => {
      const next = prev.filter(n => n.id !== id);
      saveNotes(next);
      return next;
    });
  }

  // "✨ Improve with AI" inside the note popover — expand / simplify /
  // exam notes / revision notes, all grounded in the SAME selected text
  // the note is attached to (never the whole page).
  async function improveNoteWithAI(action: NoteAIAction, currentText: string): Promise<string> {
    if (!activeSelection || activeSelection.type !== "text") return currentText;
    setNoteImproving(true);
    try {
      const basis = currentText.trim()
        ? `The student's current note is:\n"""\n${currentText}\n"""\nIt is based on this passage from the book:\n"""\n${activeSelection.text}\n"""`
        : `Base this on the following passage from the book:\n"""\n${activeSelection.text}\n"""`;
      let instruction = "";
      switch (action) {
        case "expand":   instruction = "Expand the note with more helpful detail and context."; break;
        case "simplify": instruction = "Simplify the note into short, plain-language sentences."; break;
        case "exam":     instruction = "Rewrite the note as focused exam-prep notes (key facts, definitions, likely exam points)."; break;
        case "revision": instruction = "Rewrite the note as concise revision notes (headings + short bullet points)."; break;
      }
      const res = await fetch("/api/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: `${basis}\n\n${instruction} Respond ONLY in: ${language}. Return ONLY the note text — no preamble.`,
          book, chapter: "Note", content: activeSelection.text,
        }),
      });
      const data = await res.json();
      const improved = (data?.answer as string) ?? currentText;
      setLastNoteWasImproved(true);
      trackAIUsage("revision");
      logActivity("ai", `AI improved a note ("${action}") for "${book}"`);
      return improved;
    } catch {
      return currentText;
    } finally {
      setNoteImproving(false);
    }
  }

  // ── FEATURE 4: Bookmarks ────────────────────────────────────────────
  function addBookmark(title?: string) {
    const bookmark: StoredBookmark = {
      id: newId(), bookId, page: readerPage, title, createdAt: Date.now(),
    };
    setBookmarks(prev => {
      const next = [...prev, bookmark];
      saveBookmarks(next);
      return next;
    });
  }
  function removeBookmark(id: string) {
    setBookmarks(prev => {
      const next = prev.filter(b => b.id !== id);
      saveBookmarks(next);
      return next;
    });
  }
  const isCurrentPageBookmarked = bookmarks.some(b => b.bookId === bookId && b.page === readerPage);
  function toggleBookmarkCurrentPage() {
    const existing = bookmarks.find(b => b.bookId === bookId && b.page === readerPage);
    if (existing) removeBookmark(existing.id);
    else addBookmark();
  }

  // ── FEATURE 5: Study Workspace — jump + "scroll to" (flash) ─────────
  function studyJumpToPage(page: number, flashId?: string) {
    // `page` here is already the stable internal pdfPage a highlight/
    // note/bookmark is keyed by — navigate directly, no printed-page
    // resolution (that's only for user-typed/spoken Go to Page input).
    if (page !== readerPage) navigateToPdfPage(page);
    if (flashId) {
      setFlashItemId(flashId);
      setTimeout(() => setFlashItemId(id => (id === flashId ? null : id)), 1800);
    }
  }

  // ── FEATURE 6: Revision Cards from any highlight ────────────────────
  // Reuses the EXISTING text-mode action runner unchanged for the actions
  // it already supports (flashcards); "mcqs" and "revision" are new cases
  // added to that runner's switch statement (additive only — see
  // runTextSelectionAction above).
  async function generateFromHighlight(highlight: StoredHighlight, action: RevisionAction) {
    setStudyGeneratingId(highlight.id);
    try {
      runTextSelectionAction(highlight.selectedText, highlight.page, action);
    } finally {
      setStudyGeneratingId(null);
    }
  }

  // ── Persisted highlights/notes → PdfBookSpread's page-local overlay
  // props ──────────────────────────────────────────────────────────────
  // No effects, no getBoundingClientRect(), no fixed-position math, no
  // recompute timing to get right — these are just plain derived values,
  // recalculated fresh on every render like any other derived JSX data.
  // PdfBookSpread renders them INSIDE its own PageBox (the exact container
  // that owns the canvas), as percentage-based absolute positioning, which
  // is why none of that machinery is needed anymore: percentages inside
  // the same box automatically stay correct across zoom, fullscreen, and
  // page turns with zero extra JS.
  // Perf pass (Phase C1): PdfBookSpread's PageBox is now React.memo'd
  // (canvas + PDF text-layer rendering — genuinely expensive), but that
  // only helps if the arrays it receives keep the SAME reference across
  // renders that don't actually touch highlights/notes — e.g. every pan
  // or zoom tick. Without useMemo here, .filter()/.map() built a brand
  // new array every single render regardless, defeating the memo.
  const currentBookHighlights = useMemo(
    () => highlights.filter(h => h.bookId === bookId),
    [highlights, bookId]
  );
  const currentBookNotes = useMemo(
    () => notes.filter(n => n.bookId === bookId && n.rectPct),
    [notes, bookId]
  );

  const pageHighlightsForSpread: PageOverlayHighlight[] = useMemo(
    () => currentBookHighlights.map(h => ({
      id: h.id,
      page: h.page,
      fill: HIGHLIGHT_COLOR_HEX[h.color].fill,
      border: HIGHLIGHT_COLOR_HEX[h.color].border,
      rectsPct: h.rectsPct,
      flashing: flashItemId === h.id,
    })),
    [currentBookHighlights, flashItemId]
  );
  const pageNotesForSpread: PageOverlayNote[] = useMemo(
    () => currentBookNotes.map(n => ({
      id: n.id,
      page: n.page,
      rectPct: n.rectPct as RectPct,
      flashing: flashItemId === n.id,
    })),
    [currentBookNotes, flashItemId]
  );


  // ── Resolve which physical page a screen point falls on ─────────────
  // In double-page/spread layout (a real textbook laid out two pages at
  // a time), `readerPage`
  // is only ever the LEFT page's number — the right page is readerPage+1,
  // rendered as a completely separate canvas. Every selection/crop path
  // below used to hardcode `readerPage`, which meant: (a) a highlight/
  // selection made on the RIGHT page got stored under the LEFT page's
  // number, so it could never render back in the right place (or at all,
  // since PageBox only paints a highlight on the page whose number
  // matches), and (b) cropCanvasRegion — which clamps the drag rect to
  // the target canvas's own bounding box — clamped every right-page drag
  // against the LEFT canvas's bounds, producing a zero-width/degenerate
  // region and silently returning null, which is why image selection (and
  // the OCR text fallback) never worked on the right page at all. Single-
  // page books (Nalanda, Chandrayaan-3) only ever have one candidate
  // canvas, so this resolves to `readerPage` for them exactly as before —
  // zero behavior change there.
  function resolveInteractionPageNumber(x: number, y: number): number {
    const rightCanvas = document.querySelector<HTMLCanvasElement>(`canvas[data-pdf-page="${readerPage + 1}"]`);
    if (rightCanvas) {
      const r = rightCanvas.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return readerPage + 1;
    }
    return readerPage;
  }

  // ── Unified drag finalize (mouseup) ───────────────────────────────────
  // ONE handler for BOTH modes. It always knows both what a drag physically
  // covered on screen; which of the two things it produces (text selection
  // vs image crop) is decided purely by interactionMode — never by what's
  // physically under the drag (text, image, diagram, mixed all behave the
  // same way).
  function handleMouseUp(e: React.MouseEvent) {
    if (interactionMode !== "text" && interactionMode !== "image") return;

    // Clear drag-tracking state FIRST, unconditionally — before any early
    // return below. Previously this happened AFTER the "was this a click
    // on a UI control" check, so releasing the mouse over the Next/Previous
    // button (a completely normal thing to do while a select mode is on)
    // left dragStartRef pointing at stale coordinates. The next mousemove
    // — even with no new mousedown — would then see a "drag in progress"
    // and could go on to fabricate a selection out of nothing.
    const dragStart = dragStartRef.current;
    dragStartRef.current = null;
    const endX = e.clientX, endY = e.clientY;
    setLiveDragRect(null);

    // A mouseup that lands on a UI control (button/input/select/link) is a
    // click, not a selection drag — abort here, but only AFTER the drag
    // state above has already been reset.
    let node: HTMLElement | null = e.target as HTMLElement;
    while (node) {
      if (["BUTTON","INPUT","SELECT","A"].includes(node.tagName)) {
        setSelectionRects([]);
        setCapturedImageRect(null);
        if (interactionMode === "image") window.getSelection()?.removeAllRanges();
        return;
      }
      node = node.parentElement;
    }

    // ── HARD GATE: require a real drag before anything is finalized ────
    // Applies identically to both modes — a plain click never produces a
    // selection, a crop, a highlight, or the floating toolbar.
    const dragDistance = dragStart
      ? Math.hypot(endX - dragStart.x, endY - dragStart.y)
      : 0;
    if (!dragStart || dragDistance < MIN_DRAG_PX) {
      setSelectionRects([]);
      setCapturedImageRect(null);
      return;
    }

    const mode = interactionMode; // snapshot — OCR path below is async
    // Which physical page (left or right, in spread layout) this specific
    // drag actually happened on — see resolveInteractionPageNumber's
    // comment above for why this can no longer just be `readerPage`.
    const targetPage = resolveInteractionPageNumber(endX, endY);

    // ══════════════════════════════════════════════════════════════════
    // IMAGE SELECT MODE — always produce an image crop from the drag,
    // regardless of what's underneath (text, diagram, mixed content).
    // A browser text selection may exist internally at the same time;
    // it is never read here.
    // ══════════════════════════════════════════════════════════════════
    if (mode === "image") {
      // Image mode must never surface a text selection — clear anything
      // the browser may have created internally during the drag (the
      // pointerdown/move preventDefault below should already stop most of
      // it, but this guarantees it) and never look at it again.
      window.getSelection()?.removeAllRanges();
      const cropped = cropCanvasRegion(dragStart, { x: endX, y: endY }, targetPage);
      if (!cropped) { setCapturedImageRect(null); return; }
      setCapturedImageRect(cropped.rect);
      setActiveSelection({
        type: "image",
        id: Date.now().toString(),
        imageData: cropped.dataUrl,
        pageNumber: targetPage,
      });
      return;
    }

    // ══════════════════════════════════════════════════════════════════
    // TEXT SELECT MODE — always produce selected TEXT from the drag,
    // regardless of what's underneath. An image crop may be computed
    // internally as a fallback path (below), but the AI never sees it —
    // only activeSelection.text is ever used by the router.
    // ══════════════════════════════════════════════════════════════════
    const sel = window.getSelection();
    const selText = sel?.toString().trim() || "";
    if (selText.length >= 2 && selText.length <= 1200) {
      let rects: ScreenRect[] = [];
      try {
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          rects = Array.from(range.getClientRects()).map(r => ({
            left: r.left, top: r.top, width: r.width, height: r.height,
          }));
        }
      } catch {}
      setSelectionRects(rects);
      setActiveSelection({
        type: "text", id: Date.now().toString(),
        text: selText, pageNumber: targetPage, x: endX, y: endY,
      });
      return;
    }

    // No native browser selection came back (e.g. Nalanda pages with no
    // embedded text layer) — fall back to OCR on the dragged region. The
    // crop here is used ONLY to extract text; the resulting activeSelection
    // is still type "text", never type "image".
    const cropped = cropCanvasRegion(dragStart, { x: endX, y: endY }, targetPage);
    if (!cropped) return;
    setSelectionRects([cropped.rect]);

    setAiLoading(true);
    setAiResponse(t.premiumReaderExtractingRegion);
    (async () => {
      try {
        const ocrText = await callAskAI(
          "Extract all readable text from this image region exactly as it appears. " +
          "Return ONLY the extracted text, preserving line breaks and spacing. " +
          "No explanation, no commentary, no formatting — just the text.",
          book, targetPage,
          `Image region from ${pageDescription(targetPage)} of "${book}".`,
          language, cropped.dataUrl,
          "Selected Region"
        );
        const cleaned = ocrText.trim();
        if (cleaned.length > 1) {
          setActiveSelection({
            type: "text", id: Date.now().toString(),
            text: cleaned, pageNumber: targetPage, x: endX, y: endY,
          });
          setAiResponse(t.premiumReaderTextExtracted);
        } else {
          setAiResponse(t.premiumReaderNoTextInRegion);
          setSelectionRects([]);
        }
      } catch {
        setAiResponse(t.premiumReaderExtractionFailed);
        setSelectionRects([]);
      } finally {
        setAiLoading(false);
      }
    })();
  }

  // ── Wheel zoom (Phase C1) — Ctrl/Cmd+scroll, matching the OS trackpad-
  // pinch convention, so it never hijacks a plain scroll gesture. Calls
  // the exact same setZoom the +/- buttons already use — no new zoom
  // behavior, just a second input path to the existing one.
  function onCenterWheel(e: React.WheelEvent) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    setZoom(z => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z + delta)));
  }

  // ── Pan / drag-start ──────────────────────────────────────────────────
  function onCenterMouseDown(e: React.MouseEvent) {
    if (interactionMode === "text" || interactionMode === "image") {
      if (e.button !== 0) return;

      // A mousedown on a UI control (Next/Previous/zoom/Go-to-page/mode
      // buttons, etc.) must behave like a plain click, never seed a drag.
      // Without this guard, dragStartRef gets set to the button's screen
      // position; if the paired mouseup also lands on that button it used
      // to bail out before clearing the ref (fixed below too, but this is
      // the real first line of defense) — leaving a STALE drag anchor that
      // a later mousemove (e.g. right after the page-turn animation, with
      // no new mousedown at all) would mistake for an in-progress drag.
      let node: HTMLElement | null = e.target as HTMLElement;
      while (node) {
        if (["BUTTON","INPUT","SELECT","A"].includes(node.tagName)) return;
        node = node.parentElement;
      }

      if (interactionMode === "image") {
        // Image mode: never let a native text selection seed itself.
        // Clear anything present and stop the browser's own
        // selection-start default right at the source.
        window.getSelection()?.removeAllRanges();
        e.preventDefault();
      }

      dragStartRef.current = { x: e.clientX, y: e.clientY };
      // A new drag replaces whatever was previously shown, in either mode.
      setSelectionRects([]);
      setCapturedImageRect(null);
      setLiveDragRect({ left: e.clientX, top: e.clientY, width: 0, height: 0 });
      return; // never start pan while a select mode is active
    }
    if (interactionMode !== "none" || activeSelection) return;
    if (e.button !== 0) return;

    // Pan must never start from a click on a toolbar button, zoom control,
    // Go-to-page input, mode toggle, Bookmark button, etc. Without this
    // guard, every button click while idle also kicked off a phantom
    // pan-drag (setIsPanning(true) with whatever tiny mouse movement
    // happened during the click), which is exactly the kind of thing that
    // makes panning feel broken/inconsistent.
    let node: HTMLElement | null = e.target as HTMLElement;
    while (node) {
      if (["BUTTON","INPUT","SELECT","A"].includes(node.tagName)) return;
      node = node.parentElement;
    }

    setIsPanning(true);
    panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }
  function onCenterMouseMove(e: React.MouseEvent) {
    if ((interactionMode === "text" || interactionMode === "image") && dragStartRef.current) {
      if (interactionMode === "image") {
        // Keep suppressing native selection extension for the whole drag —
        // some browsers re-evaluate/extend a selection on every mousemove
        // even after an initial preventDefault on mousedown.
        e.preventDefault();
      }
      const s = dragStartRef.current;
      setLiveDragRect({
        left: Math.min(s.x, e.clientX),
        top: Math.min(s.y, e.clientY),
        width: Math.abs(e.clientX - s.x),
        height: Math.abs(e.clientY - s.y),
      });
    }
    // Pan continuation now happens in the window-level effect below —
    // React's onMouseMove/onMouseUp props only fire while the cursor stays
    // within this div's bounds, so a fast drag that leaves the reader area
    // (over the AI panel, left panel, or outside the browser content
    // during a big zoomed-in pan) used to "get stuck" mid-drag. window
    // listeners keep firing anywhere in the viewport, including while
    // fullscreen is active, regardless of which element fullscreen wraps.
  }
  function onCenterMouseUp() { setIsPanning(false); }

  // Robust pan-drag: attach move/up listeners to the window for the
  // duration of an active pan, instead of relying solely on this div's
  // own onMouseMove/onMouseUp. This is what makes panning work reliably
  // at any zoom level and while fullscreen is active — window-level
  // listeners aren't scoped to any particular element's visible bounds.
  useEffect(() => {
    if (!isPanning) return;
    function onWindowMouseMove(e: MouseEvent) {
      setPan({
        x: panStart.current.px + (e.clientX - panStart.current.mx),
        y: panStart.current.py + (e.clientY - panStart.current.my),
      });
    }
    function onWindowMouseUp() { setIsPanning(false); }
    window.addEventListener("mousemove", onWindowMouseMove);
    window.addEventListener("mouseup", onWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", onWindowMouseMove);
      window.removeEventListener("mouseup", onWindowMouseUp);
    };
  }, [isPanning]);

  // ── Open book ─────────────────────────────────────────────────────────
  function openBookWithAnimation() {
    // This only ever runs from the cover's own click handler (BookCover is
    // only rendered while `!bookOpened`, i.e. no valid `?page=` resolved) —
    // so by definition `readerPage` is still page 1 and this is NOT a
    // deep-link open. Explicit here (already false from the resolvers
    // above) so a plain cover-open can never be mistaken for one.
    hasEngagedRef.current = false;
    setBookOpening(true);
    // A real click on the cover is itself a genuine user gesture — if the
    // phone is already in landscape at this moment, this is the earliest
    // legitimate opportunity to request fullscreen (see
    // requestImmersiveFullscreenOnce's file-top comment).
    requestImmersiveFullscreenOnce();
    setTimeout(() => { setBookOpened(true); setBookOpening(false); }, 900);
  }

  // Upload intended (?source=upload with a pointer id already in
  // sessionStorage) but the IndexedDB payload hasn't resolved yet —
  // show a small loading state instead of flashing the default catalog
  // book (Nalanda) while the read is in flight.
  if (isHydrated && uploadedSource && uploadedPdfId && !uploadedPdfData && !uploadedPdfLoadFailed) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-sm font-semibold text-slate-300">{t.premiumReaderLoadingDocument}</p>
      </div>
    );
  }
  if (uploadedPdfLoadFailed) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-slate-950 text-white">
        <p className="text-sm font-semibold text-red-300">{t.premiumReaderUploadedLoadFailed}</p>
        <a href="/read" className="ndl-press rounded-full bg-white/10 px-4 py-2 text-xs font-bold hover:bg-white/20">← {t.premiumReaderBackToUpload}</a>
      </div>
    );
  }

  if (bookOpening) return <BookOpeningAnimation title={book} />;
  if (!bookOpened) {
    return (
      <BookCover
        title={currentBook.title} subtitle="National Digital Library AI"
        author={currentBook.author} description={currentBook.description}
        onOpen={openBookWithAnimation}
      />
    );
  }

  // P0 desktop-regression fix: the desktop toolbar's Read control used to
  // be a single button that only ever started/toggled mode "page" — Read
  // Chapter/Book were unreachable on desktop, and the persistent player
  // below was only ever mounted from the mobile branch. Desktop now uses
  // the exact same Read menu trigger + `readMenuOpen`/`readMenuRef` state,
  // and the exact same startReadPageFromMenu/startReadChapter/
  // startReadBook handlers, as mobile — see the desktop controls-strip
  // JSX below. No new engine, no new handlers, no new player state.
  const readDesktopIcon = playerStatus === "starting" ? `⏳ ${t.readerPreparing}`
    : playerStatus === "playing" ? `⏸ ${t.premiumReaderPause}`
    : playerStatus === "paused" ? `▶ ${t.premiumReaderResume}`
    : `🔊 ${t.premiumReaderReadPage}`;

  // Printed-page label — the SAME pure lookup PdfBookSpread used to do
  // internally (Phase C3 moved the surrounding chrome, not the lookup
  // itself: same printedPageMap, same getDisplayLabel/getSpreadDisplayLabel).
  const safePageForLabel = Math.max(1, readerPage || 1);
  const rightPageForLabel = safePageForLabel + 1;
  const isSpreadForLabel = isSpreadBook && safePageForLabel > 1;
  const displayLabel = isSpreadForLabel
    ? getSpreadDisplayLabel(safePageForLabel, rightPageForLabel <= totalPages ? rightPageForLabel : null, printedPageMap)
    : getDisplayLabel(safePageForLabel, printedPageMap);

  const availableToolbarLanguages = LANGUAGES.filter((l) => enabledLanguageCodes.includes(LANGUAGE_NAME_TO_CODE[l]));

  // Mobile: no permanent AI-panel column at all — it either shows as a
  // full-screen overlay (explicitly opened) or not at all (a small
  // floating trigger reopens it), so the book always gets the full
  // viewport width on a phone-sized screen.
  const aiPanelWidthPx = isMobileViewport ? 0 : (aiPanelCompact ? AI_PANEL_COMPACT_PX : AI_PANEL_EXPANDED_PX);
  const aiPanelOverlay = isMobileViewport && !aiPanelCompact;

  // ── Phase D Task 4: fullscreen-only compact chrome ──────────────────
  // Static size/spacing tokens only — no control is removed, no state
  // changes, no page/zoom/pan/selection logic touched. Normal mode is
  // untouched (these all resolve to the exact same classes Tasks 1–3
  // already shipped). In fullscreen, the same three chrome bars render
  // with tighter margins and slightly smaller buttons so the freed
  // height goes to the book — PdfBookSpread's own flex-1 column already
  // reclaims whatever height these bars give up, with zero changes to
  // that component.
  const fsBtnH = isFullscreenLayout ? "h-8" : "h-9";
  const fsSquareW = isFullscreenLayout ? "w-8" : "w-9";
  const fsBtnText = isFullscreenLayout ? "text-[11px]" : "text-xs";
  const fsBarGapY = isFullscreenLayout ? "mb-1" : "mb-1.5";
  const fsGroupGap = isFullscreenLayout ? "gap-2" : "gap-2.5";
  const fsBottomMt = isFullscreenLayout ? "mt-1" : "mt-1.5";
  const fsBottomPy = isFullscreenLayout ? "py-1.5" : "py-2";
  // Portrait-only bottom-nav button layout (stacked icon-over-label).
  // Landscape now renders its own separate floating dock (see below) with
  // its own icon-only buttons, so this no longer needs a landscape branch.
  const mobileNavBtnCls = "flex-col gap-0.5 px-1 py-1.5";

  // ── Unified Reading Engine: persistent Reading Player + its resume/
  // chapter-unavailable dialogs — extracted to a single shared JSX value
  // so desktop and mobile render the EXACT same markup/handlers from one
  // definition (no second player, no second state machine, per the P0
  // desktop-regression fix's explicit requirement). Positioning is
  // `fixed`/viewport-relative throughout, so it's equally correct
  // whether it's mounted from the desktop branch or the mobile one.
  const readingEngineOverlays = (
    <>
      {playerMode && (
        <div
          className="pointer-events-none fixed inset-x-0 z-40 flex justify-center"
          // The two-row full player is taller than a single-row
          // pill, and this wrapper's `bottom` offset pins the
          // CARD'S BOTTOM edge, not its top — so it needs real
          // clearance from the bottom dock here. Verified against
          // the dock's real on-screen rect: 5rem leaves a clear
          // gap in both portrait and landscape, and the (shorter)
          // mini-player only ever needs LESS room, never more.
          // Desktop has no bottom dock to clear, so this is simply
          // unused breathing room there — not an obstruction.
          style={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}
        >
          {playerStatus === "error" ? (
            // ── Error state — "Do not silently hang": shown
            // inline in the SAME player shell so it survives no
            // matter how the failure was reached, with the exact
            // required message, Retry, Close, and — Read Book
            // only — Skip Page.
            <div
              className="ndl-fade-in-scale pointer-events-auto flex w-[272px] max-w-[92vw] flex-col gap-2.5 rounded-[26px] px-4 py-3 backdrop-blur-2xl shadow-lg"
              style={{ background: "rgba(15,13,11,0.92)", border: "1px solid rgba(212,175,110,0.22)", boxShadow: "0 12px 32px rgba(0,0,0,0.4)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[12px] font-semibold leading-snug text-amber-50">⚠️ {playerErrorMessage}</p>
                <button onClick={closeReader} title={t.commonClose} aria-label={t.commonClose}
                  className="ndl-press flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-xs text-amber-50 hover:bg-white/25">✕</button>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={retryReader}
                  className="ndl-press flex-1 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-amber-50 hover:bg-white/25">
                  {t.commonRetry}
                </button>
                {playerMode === "book" && (
                  <button onClick={skipFailedPageInBook}
                    className="ndl-press flex-1 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-amber-50 hover:bg-white/25">
                    {t.premiumReaderSkipPage}
                  </button>
                )}
                <button onClick={closeReader}
                  className="ndl-press flex-1 rounded-full bg-red-600/90 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-red-600">
                  {t.commonClose}
                </button>
              </div>
            </div>
          ) : playerMinimized ? (
            // ── Mini-player — playback is completely unaffected
            // by minimizing (no state here at all, just less of
            // it rendered); tapping the label expands back.
            <div
              className="ndl-fade-in-scale pointer-events-auto flex max-w-[92vw] items-center gap-2 rounded-full px-3 py-2 backdrop-blur-2xl shadow-lg"
              style={{ background: "rgba(15,13,11,0.92)", border: "1px solid rgba(212,175,110,0.22)", boxShadow: "0 12px 32px rgba(0,0,0,0.4)" }}
            >
              <button
                onClick={() => (playerStatus === "playing" ? pauseReader() : resumeReader())}
                disabled={playerStatus === "starting"}
                title={playerStatus === "playing" ? t.premiumReaderPause : t.premiumReaderResume}
                aria-label={playerStatus === "playing" ? t.premiumReaderPause : t.premiumReaderResume}
                className="ndl-press flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-sm text-amber-50 hover:bg-white/25 disabled:opacity-40"
              >
                {playerStatus === "starting" ? "⏳" : playerStatus === "playing" ? "⏸" : "▶"}
              </button>
              <button onClick={togglePlayerMinimized} title={t.premiumReaderExpand} aria-label={t.premiumReaderExpand}
                className="ndl-press flex min-w-0 items-center gap-1 truncate text-[11px] font-semibold text-amber-50">
                <span className="min-w-0 max-w-[42vw] truncate">
                  {(playerMode === "book" ? t.premiumReaderReadingBook : playerMode === "chapter" ? t.premiumReaderReadingChapter : t.premiumReaderReadingPage)}
                  {" · "}
                  {playerStatus === "starting" ? t.premiumReaderStarting
                    : playerStatus === "completed" ? t.premiumReaderCompleted
                    : t.premiumReaderPageXofY.replace("{page}", String(displayLabel || readerPage)).replace("{total}", String(totalPages))}
                </span>
                <span aria-hidden className="flex-shrink-0 text-amber-100/70">↑</span>
              </button>
              <button onClick={closeReader} title={t.commonClose} aria-label={t.commonClose}
                className="ndl-press flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-xs text-amber-50 hover:bg-white/25">✕</button>
            </div>
          ) : (
            // ── Full player
            <div
              className="ndl-fade-in-scale pointer-events-auto flex w-[272px] max-w-[92vw] flex-col gap-2.5 rounded-[26px] px-4 py-3 backdrop-blur-2xl shadow-lg"
              style={{ background: "rgba(15,13,11,0.92)", border: "1px solid rgba(212,175,110,0.22)", boxShadow: "0 12px 32px rgba(0,0,0,0.4)" }}
            >
              <div className="flex items-center gap-3">
                <button
                  onClick={() => (playerStatus === "playing" ? pauseReader() : resumeReader())}
                  disabled={playerStatus === "starting"}
                  title={playerStatus === "playing" ? t.premiumReaderPause : t.premiumReaderResume}
                  aria-label={playerStatus === "playing" ? t.premiumReaderPause : t.premiumReaderResume}
                  className="ndl-press flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-lg text-amber-50 hover:bg-white/25 disabled:opacity-40"
                >
                  {playerStatus === "starting" ? "⏳" : playerStatus === "playing" ? "⏸" : "▶"}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-bold leading-tight text-amber-50">
                    {playerMode === "book" ? t.premiumReaderReadingBook : playerMode === "chapter" ? t.premiumReaderReadingChapter : t.premiumReaderReadingPage}
                  </div>
                  <div className="truncate text-[11px] font-medium leading-tight text-amber-100/65 tabular-nums">
                    {playerStatus === "starting" ? t.premiumReaderStarting
                      : playerStatus === "completed" ? t.premiumReaderCompleted
                      : t.premiumReaderPageXofY
                          .replace("{page}", String(displayLabel || readerPage))
                          .replace("{total}", String(totalPages))}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button onClick={togglePlayerMinimized} title={t.premiumReaderMinimize} aria-label={t.premiumReaderMinimize}
                    className="ndl-press flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs text-amber-50 hover:bg-white/20">−</button>
                  <button onClick={closeReader} title={t.commonClose} aria-label={t.commonClose}
                    className="ndl-press flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs text-amber-50 hover:bg-white/20">✕</button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-2.5">
                <select
                  value={playerSpeed}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    // Applied to the ref synchronously (not just
                    // via setState, which only reaches
                    // playerSpeedRef a render later through its
                    // own effect) so the restart below builds its
                    // new utterance at the right rate
                    // immediately, not the stale one.
                    playerSpeedRef.current = next;
                    setPlayerSpeed(next);
                    restartCurrentChunkAtNewSpeed();
                  }}
                  aria-label={t.premiumReaderPlaybackSpeed} title={t.premiumReaderPlaybackSpeed}
                  className="ndl-chrome-fade flex-shrink-0 rounded-full border-none bg-white/15 px-2.5 py-1 text-[11px] font-bold tabular-nums text-amber-50 hover:bg-white/20"
                >
                  <option value={0.75}>0.75×</option>
                  <option value={1}>1.0×</option>
                  <option value={1.25}>1.25×</option>
                  <option value={1.5}>1.5×</option>
                  <option value={2}>2.0×</option>
                </select>
                {/* Sleep Timer — optional per spec, kept
                    intentionally minimal (one native <select>) to
                    stay compact. */}
                <select
                  value={sleepTimerOption}
                  onChange={(e) => applySleepTimer(e.target.value as SleepTimerOption)}
                  aria-label={t.premiumReaderSleepTimer} title={t.premiumReaderSleepTimer}
                  className="ndl-chrome-fade flex-shrink-0 rounded-full border-none bg-white/15 px-2.5 py-1 text-[10px] font-bold text-amber-50 hover:bg-white/20"
                >
                  <option value="off">⏰ {t.premiumReaderSleepOff}</option>
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                  <option value="45">45 min</option>
                  <option value="60">60 min</option>
                  <option value="endOfChapter">{t.premiumReaderSleepEndOfChapter}</option>
                  <option value="endOfBook">{t.premiumReaderSleepEndOfBook}</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Enhanced Read Aloud: page-level resume prompt — shown
          only when Read Book is started and a previously saved
          position exists for THIS book at a different page.
          Intentionally simple per spec: page number only, no
          sentence/timestamp state. ─────────────────────────────── */}
      {resumePromptPage !== null && (
        <div className="ndl-fade-in-scale fixed inset-0 z-[161] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl">
            <p className="mb-4 text-sm font-bold text-slate-800">
              {t.premiumReaderResumeFromPage.replace("{page}", String(resumePromptPage))}
            </p>
            <div className="flex flex-col gap-2">
              <button onClick={confirmResumeFromSaved}
                className="ndl-press w-full rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800">
                {t.premiumReaderResume}
              </button>
              <button onClick={confirmStartFromCurrentPage}
                className="ndl-press w-full rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">
                {t.premiumReaderStartFromCurrentPage}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Enhanced Read Aloud: chapter-unavailable prompt — shown
          when Read Chapter's heading scan (findChapterEndPage)
          genuinely can't find a plausible chapter boundary, per
          the spec's exact required message. Never invents a
          boundary instead. ──────────────────────────────────────── */}
      {chapterUnavailableOpen && (
        <div className="ndl-fade-in-scale fixed inset-0 z-[161] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 text-center shadow-xl">
            <p className="mb-4 text-sm font-bold text-slate-800">{t.premiumReaderChapterUnavailableMsg}</p>
            <div className="flex flex-col gap-2">
              <button onClick={continueBookAfterChapterUnavailable}
                className="ndl-press w-full rounded-full bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800">
                {t.premiumReaderContinueBookInstead}
              </button>
              <button onClick={() => setChapterUnavailableOpen(false)}
                className="ndl-press w-full rounded-full bg-slate-100 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200">
                {t.commonCancel}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
    <PremiumReaderLayout
      ref={layoutRef}
      aiPanelWidthPx={aiPanelWidthPx}
      aiPanelOverlay={aiPanelOverlay}
      hideNav={isMobileViewport}
      onCloseAiPanel={() => setAiPanelCompact(true)}
      center={
        <div
          ref={setBookAreaNode}
          onMouseDown={(e) => { onCenterMouseDown(e); if (isMobileViewport) handleGestureDown(e); }}
          onMouseMove={(e) => { onCenterMouseMove(e); if (isMobileViewport) handleGestureMove(e); }}
          onMouseUp={(e) => { onCenterMouseUp(); handleMouseUp(e); if (isMobileViewport) handleGestureUp(e); }}
          onWheel={onCenterWheel}
          style={{
            // True immersive landscape: escapes PremiumReaderLayout's
            // flex/section chrome entirely (fixed positioning is relative
            // to the true viewport, not any ancestor's h-dvh/flex-1 box —
            // no transformed ancestor sits between this div and <body>,
            // confirmed by reading PremiumReaderLayout.tsx, so this
            // anchors to the real screen, not a layout approximation of
            // it). This is what the "black side strips" / "page doesn't
            // fill the screen" reports were actually about — the old
            // in-flow div was always exactly as accurate as its ancestors'
            // box models, which drift slightly from the true visual
            // viewport on Safari during address-bar show/hide. Portrait
            // and desktop keep the original in-flow height:100% — same
            // gesture handlers, same element, only its OWN CSS position
            // changes, so swipe/pinch/long-press (attached to this exact
            // node) are completely unaffected.
            ...(isMobileLandscape
              ? { position: "fixed" as const, inset: 0, width: "100vw", height: "100dvh", zIndex: 40 }
              : { height: "100%" }),
            display: "flex", flexDirection: "column",
            cursor: imageSelectMode ? "crosshair"
              : textSelectMode ? "text"
              : isPanning ? "grabbing" : "grab",
            // Prevent panning from ever turning into a full browser-page
            // scroll/touch gesture — panning moves the inner book content
            // via the pan.x/y transform only, never the page itself.
            // Scoped to the reader surface only (mobile gesture fix):
            // desktop/tablet keep the browser's default touch-action so a
            // touch-capable laptop/tablet in the desktop layout isn't
            // stripped of native scroll/pinch it might still want.
            touchAction: isMobileViewport ? "none" : "auto",
            overscrollBehavior: "contain",
            // Suppresses iOS Safari's long-press text/image callout only
            // on this element — never globally — so it doesn't fight the
            // reader's own long-press selection.
            WebkitTouchCallout: isMobileViewport ? "none" : undefined,
            WebkitUserSelect: isMobileViewport ? "none" : undefined,
          } as React.CSSProperties}
        >
          {!isMobileViewport ? (
            <>
              {/* ── Top row: Back / title / printed-page badge. Same component
                  in both modes — fullscreen only compacts sizing/spacing via
                  the fs* tokens above, nothing is removed or hidden. ──────── */}
              <div className={`mx-auto ${fsBarGapY} flex w-full max-w-[1340px] flex-shrink-0 items-center justify-between gap-3 px-1`}>
                  <div className="flex min-w-0 items-center gap-3">
                    <Link href="/"
                      title={t.commonHome}
                      aria-label={t.commonHome}
                      className={`ndl-press inline-flex ${fsBtnH} ${fsSquareW} items-center justify-center rounded-full bg-white ${fsBtnText} font-bold text-slate-700 shadow ring-1 ring-slate-200 hover:bg-amber-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-500`}>
                      <span aria-hidden="true">🏠</span>
                    </Link>
                    <Link href="/library"
                      className={`ndl-press inline-flex ${fsBtnH} items-center gap-1 rounded-full bg-white px-3 ${fsBtnText} font-bold text-slate-700 shadow ring-1 ring-slate-200 hover:bg-amber-50`}>
                      ← {t.commonBack}
                    </Link>
                    <h1 className={`truncate font-black text-slate-900 ${isFullscreenLayout ? "text-sm" : "text-base"}`}>{book}</h1>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {isUploadedBook && (
                      <Link href={`/read?source=upload&id=${bookId}&page=${readerPage}`}
                        title={t.readerReadNormally}
                        className={`ndl-press inline-flex ${fsBtnH} items-center gap-1 rounded-full bg-white px-3 ${fsBtnText} font-bold text-slate-700 shadow ring-1 ring-slate-200 hover:bg-amber-50`}>
                        📖 {t.readerReadNormally}
                      </Link>
                    )}
                    {displayLabel && (
                      <span className={`rounded-full bg-white px-3 ${isFullscreenLayout ? "py-1" : "py-1.5"} ${fsBtnText} font-bold text-slate-600 shadow ring-1 ring-amber-100`}>
                        {displayLabel}
                      </span>
                    )}
                  </div>
                </div>

              {/* ── Controls strip — page-level tools, grouped into logical
                  clusters (Read Aloud / View / Navigate / Selection / Save)
                  separated by whitespace + a hairline divider rather than one
                  long row of visually identical buttons. Zoom lives here ONLY
                  — the bottom reading bar no longer duplicates it (Phase D
                  Task 1). Same component and handlers in fullscreen — only
                  sizing/spacing compacts via the fs* tokens (Phase D Task 4),
                  no control is removed. ──────────────────────────────────── */}
              <div className={`mx-auto ${fsBarGapY} flex w-full max-w-[1340px] flex-shrink-0 flex-wrap items-center ${fsGroupGap} px-1`}>
                <div className="flex items-center gap-1.5">
                  {/* P0 desktop-regression fix: was a single "Read Page"
                      button that could never reach Chapter/Book. Now the
                      same Read menu trigger as mobile — same
                      `readMenuOpen`/`readMenuRef` state, same three
                      handlers (startReadPageFromMenu/startReadChapter/
                      startReadBook), just desktop-styled (white popover,
                      icon+label trigger) instead of mobile's icon-only
                      dark-glass menu. */}
                  <div ref={readMenuRef} className="relative flex-shrink-0">
                    <button onClick={() => setReadMenuOpen((v) => !v)} disabled={playerStatus === "starting"}
                      title={t.premiumReaderReadMenu} aria-label={t.premiumReaderReadMenu}
                      aria-haspopup="menu" aria-expanded={readMenuOpen}
                      className={`ndl-press inline-flex ${fsBtnH} items-center gap-1.5 rounded-full bg-slate-900 px-4 ${fsBtnText} font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50`}>
                      {readDesktopIcon}
                    </button>
                    {readMenuOpen && (
                      <div
                        role="menu" aria-label={t.premiumReaderReadMenu}
                        className="absolute left-0 top-full z-[161] mt-1.5 w-48 max-w-[min(224px,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white py-1 shadow-xl ring-1 ring-black/5"
                      >
                        <button role="menuitem" onClick={startReadPageFromMenu}
                          className="flex min-h-[40px] w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-amber-50">
                          📄 {t.premiumReaderReadPage}
                        </button>
                        <button role="menuitem" onClick={startReadChapter}
                          className="flex min-h-[40px] w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-amber-50">
                          📖 {t.premiumReaderReadChapter}
                        </button>
                        <button role="menuitem" onClick={startReadBook}
                          className="flex min-h-[40px] w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-amber-50">
                          📚 {t.premiumReaderReadBook}
                        </button>
                      </div>
                    )}
                  </div>
                  {(playerStatus === "playing" || playerStatus === "paused") && (
                    <button onClick={handleStopAnyReadAloud}
                      title={t.premiumReaderPause} aria-label={t.premiumReaderPause}
                      className={`ndl-press inline-flex ${fsBtnH} items-center gap-1.5 rounded-full bg-red-600 px-4 ${fsBtnText} font-bold text-white shadow hover:bg-red-700`}>⏹ {t.premiumReaderPause}</button>
                  )}
                </div>
                <span className="h-5 w-px bg-amber-200/70" />

                <div className="flex items-center gap-1.5">
                  <button onClick={() => setZoom(z => Math.max(z - ZOOM_STEP, ZOOM_MIN))} disabled={zoom <= ZOOM_MIN}
                    title={t.premiumReaderZoomOutTitle}
                    className={`ndl-press inline-flex ${fsBtnH} ${fsSquareW} items-center justify-center rounded-full bg-amber-50/70 ${fsBtnText} font-bold text-slate-700 ring-1 ring-amber-100 hover:bg-amber-100 disabled:opacity-40`}>−</button>
                  <span className="min-w-[40px] text-center text-xs font-bold tabular-nums text-slate-600 transition-all duration-150">{zoom}%</span>
                  <button onClick={() => setZoom(z => Math.min(z + ZOOM_STEP, ZOOM_MAX))} disabled={zoom >= ZOOM_MAX}
                    title={t.premiumReaderZoomInTitle}
                    className={`ndl-press inline-flex ${fsBtnH} ${fsSquareW} items-center justify-center rounded-full bg-amber-50/70 ${fsBtnText} font-bold text-slate-700 ring-1 ring-amber-100 hover:bg-amber-100 disabled:opacity-40`}>+</button>
                  <button onClick={fitScreen}
                    className={`ndl-press inline-flex ${fsBtnH} items-center rounded-full bg-amber-50/70 px-4 ${fsBtnText} font-bold text-slate-700 ring-1 ring-amber-100 hover:bg-amber-100`}>{t.premiumReaderFit}</button>
                </div>
                <span className="h-5 w-px bg-amber-200/70" />

                <form onSubmit={(e) => { e.preventDefault(); goToPage(goToInput); }} className="flex items-center gap-1.5">
                  <input type="number" min={1}
                    value={goToInput}
                    onChange={(e) => setGoToInput(e.target.value)}
                    placeholder={t.premiumReaderGoToPagePlaceholder}
                    title={t.premiumReaderGoToPageTitle}
                    className={`${fsBtnH} w-20 rounded-full bg-white px-3 ${fsBtnText} text-slate-800 ring-1 ring-slate-200 outline-none transition-shadow focus:ring-2 focus:ring-amber-400`} />
                  <button type="submit"
                    className={`ndl-press inline-flex ${fsBtnH} items-center rounded-full bg-amber-50/70 px-3 ${fsBtnText} font-bold text-slate-700 ring-1 ring-amber-100 hover:bg-amber-100`}>{t.premiumReaderGo}</button>
                </form>
                <span className="h-5 w-px bg-amber-200/70" />

                {/* Mode buttons — ALL use switchInteractionMode via toggleMode */}
                <div className="flex items-center gap-1.5">
                  <button onClick={() => toggleMode("text")}
                    className={`ndl-press inline-flex ${fsBtnH} items-center gap-1.5 rounded-full px-4 ${fsBtnText} font-bold ${
                      textSelectMode ? "bg-orange-600 text-white shadow" : "bg-amber-50/70 text-slate-700 ring-1 ring-amber-100 hover:bg-amber-100"}`}>
                    {textSelectMode ? `📖 ${t.premiumReaderPageTurn}` : `📝 ${t.premiumReaderTextSelect}`}
                  </button>
                  <button onClick={() => toggleMode("image")}
                    className={`ndl-press inline-flex ${fsBtnH} items-center gap-1.5 rounded-full px-4 ${fsBtnText} font-bold ${
                      imageSelectMode ? "bg-slate-900 text-white shadow" : "bg-amber-50/70 text-slate-700 ring-1 ring-amber-100 hover:bg-amber-100"}`}>
                    {imageSelectMode ? `✕ ${t.commonCancel}` : `📐 ${t.premiumReaderImageSelect}`}
                  </button>
                </div>
                <span className="h-5 w-px bg-amber-200/70" />

                <div className="flex items-center gap-1.5">
                  {/* Phase 2 — Feature 4: Bookmarks. Bookmarks the CURRENT page;
                      tapping again while already bookmarked removes it. */}
                  <button onClick={toggleBookmarkCurrentPage}
                    className={`ndl-press inline-flex ${fsBtnH} items-center gap-1.5 rounded-full px-4 ${fsBtnText} font-bold ${
                      isCurrentPageBookmarked ? "bg-amber-500 text-white shadow" : "bg-amber-50/70 text-slate-700 ring-1 ring-amber-100 hover:bg-amber-100"}`}>
                    {isCurrentPageBookmarked ? `🔖 ${t.premiumReaderBookmarked}` : `🔖 ${t.premiumReaderBookmark}`}
                  </button>
                  <LanguagePopover language={language} onLanguageChange={setLanguage} availableLanguages={availableToolbarLanguages} />
                </div>
              </div>

              {/* P0 desktop-regression fix: the persistent Reading Player
                  (and its resume/chapter-unavailable dialogs) was only
                  ever mounted from the mobile branch below — desktop had
                  no Minimize/Close/speed/sleep-timer surface at all once
                  a session started. Same shared value, same state, same
                  handlers as mobile — see its definition above `return`. */}
              {readingEngineOverlays}
            </>
          ) : (
            <>
              {/* ── RC1 P1 fix #6: single-row header. Was two full 40px
                  rows (identity row + a second row for Read Page/Zoom) —
                  now one row of 36px (h-9) icon-first controls, roughly
                  halving the chrome's vertical footprint so the page
                  itself stays the visual focus. Zoom's dedicated +/−
                  buttons moved to the More sheet below: RC1 P0 fix #3
                  added real pinch-to-zoom, so the header no longer needs
                  to spend a whole row on a control most mobile users will
                  now reach via the gesture instead — the buttons still
                  exist (never removed outright) for anyone who can't
                  pinch, just relocated to a secondary surface. Read Page
                  goes icon-only here (was icon+label) for the same
                  space reason; its title/aria-label still carry the full
                  text for screen readers. Same handlers throughout — no
                  functionality removed, only regrouped. Phase D3: fades
                  on a single tap anywhere on the reading area (immersive
                  mode, handleGestureUp above); the More sheet itself is
                  NOT inside this wrapper so it always stays fully
                  visible/interactive once opened. ───────────────────── */}
              {/* Premium landscape redesign: the portrait header below is
                  an in-flow flex-shrink-0 row (reserves its height even
                  while faded via mobileChromeCls, by design — portrait
                  has room to spare). Landscape instead renders NOTHING
                  in-flow here — see the `position:fixed` bar rendered
                  further down as a sibling of the whole mobile branch —
                  so the book's flex:1 area claims the full column height
                  regardless of chrome visibility, per "controls overlay
                  the page, never resize it." Portrait is byte-for-byte
                  unchanged. */}
              {!isMobileLandscape && (
              <div className={`flex-shrink-0 ndl-chrome-fade ${mobileChromeCls}`}>
                <div className="mx-auto flex w-full max-w-[1340px] flex-shrink-0 items-center gap-1 px-0 py-1">
                  <Link href="/library" title={t.commonBack} aria-label={t.commonBack}
                    className="ndl-press inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-700 shadow ring-1 ring-slate-200 hover:bg-amber-50">
                    ←
                  </Link>
                  <h1 className="min-w-0 flex-1 truncate text-center text-sm font-black text-slate-900">{book}</h1>
                  {/* Phase D3 point 4: page indicator is now interactive —
                      tapping it opens the page strip (reuses goToPage,
                      the same navigation primitive the "Go to page" form
                      in the More sheet already calls). */}
                  {displayLabel && (
                    <button onClick={() => setPageStripOpen(true)}
                      title={t.premiumReaderGoToPageTitle} aria-label={t.premiumReaderGoToPageTitle}
                      className="ndl-press flex h-9 flex-shrink-0 items-center rounded-full bg-white px-2 text-[10px] font-bold text-slate-600 shadow ring-1 ring-amber-100 hover:bg-amber-50">
                      {displayLabel}
                    </button>
                  )}
                  {/* Enhanced Read Aloud: "Read Page" replaced with a Read
                      menu (Page/Chapter/Book) per spec — all three now
                      call the SAME unified startReading engine
                      (startReadPageFromMenu just closes the menu and
                      calls it with mode "page"). The icon reflects
                      playerStatus, whichever of the three modes is
                      currently active (Read AI Response is separate,
                      untouched). */}
                  {/* P0 regression fix: right-anchored (not left-anchored)
                      since this trigger sits in the right portion of the
                      header (title has flex-1, pushing everything after
                      it rightward) — a left-anchored fixed-width dropdown
                      grew off the right edge of the screen. max-w clamps
                      to the viewport as a hard safety net regardless of
                      where the trigger ends up. No backdrop <div> — see
                      the outside-click/Escape/rotation/panel-open effects
                      above, all of which close this via plain state. */}
                  <div ref={readMenuRef} className="relative flex-shrink-0">
                    <button onClick={() => setReadMenuOpen((v) => !v)} disabled={playerStatus === "starting"}
                      title={t.premiumReaderReadMenu} aria-label={t.premiumReaderReadMenu}
                      aria-haspopup="menu" aria-expanded={readMenuOpen}
                      className="ndl-press inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm text-white shadow hover:bg-slate-800 disabled:opacity-50">
                      {playerStatus === "starting" ? "⏳"
                        : playerStatus === "playing" ? "⏸"
                        : playerStatus === "paused" ? "▶" : "🔊"}
                    </button>
                    {readMenuOpen && (
                      <div
                        role="menu" aria-label={t.premiumReaderReadMenu}
                        className="absolute right-0 top-10 z-[161] w-44 max-w-[min(224px,calc(100vw-2rem))] overflow-hidden rounded-2xl bg-white py-1 shadow-xl ring-1 ring-black/5"
                      >
                        <button role="menuitem" onClick={startReadPageFromMenu}
                          className="flex min-h-[44px] w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-amber-50">
                          📄 {t.premiumReaderReadPage}
                        </button>
                        <button role="menuitem" onClick={startReadChapter}
                          className="flex min-h-[44px] w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-amber-50">
                          📖 {t.premiumReaderReadChapter}
                        </button>
                        <button role="menuitem" onClick={startReadBook}
                          className="flex min-h-[44px] w-full items-center gap-2 px-4 py-2.5 text-left text-xs font-bold text-slate-700 hover:bg-amber-50">
                          📚 {t.premiumReaderReadBook}
                        </button>
                      </div>
                    )}
                  </div>
                  {(playerStatus === "playing" || playerStatus === "paused") && (
                    <button onClick={handleStopAnyReadAloud}
                      title={t.premiumReaderPause}
                      aria-label={t.premiumReaderPause}
                      className="ndl-press inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow hover:bg-red-700">⏹</button>
                  )}
                  <button onClick={toggleBookmarkCurrentPage}
                    title={isCurrentPageBookmarked ? t.premiumReaderBookmarked : t.premiumReaderBookmark}
                    aria-label={isCurrentPageBookmarked ? t.premiumReaderBookmarked : t.premiumReaderBookmark}
                    className={`ndl-press inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm shadow ring-1 ${
                      isCurrentPageBookmarked ? "bg-amber-500 text-white ring-amber-500" : "bg-white text-slate-700 ring-slate-200 hover:bg-amber-50"}`}>
                    🔖
                  </button>
                </div>
              </div>
              )}

              {/* ── Premium landscape redesign: floating overlay header —
                  position:fixed (zero flow footprint, see comment above),
                  deep charcoal/midnight glass with a thin warm-gold hairline,
                  icon-only controls per spec ("no second row… only Back,
                  title, page, Read Page, Bookmark, More"). Same handlers as
                  the portrait header — no new behavior, only a different
                  shell for a landscape-only visual language. Fades with the
                  same mobileChromeCls (tap-to-reveal, 3s auto-hide — RC1 P2
                  landscape auto-hide, unchanged) and never resizes the book
                  underneath it since it's outside the flex flow. ────────── */}
              {isMobileLandscape && (
                <div
                  className={`pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center ndl-chrome-fade ${mobileChromeCls}`}
                  style={{
                    paddingTop: "max(0.4rem, env(safe-area-inset-top))",
                    paddingLeft: "max(0.6rem, env(safe-area-inset-left))",
                    paddingRight: "max(0.6rem, env(safe-area-inset-right))",
                  }}
                >
                  <div
                    className="pointer-events-auto flex max-w-[92vw] items-center gap-1 rounded-full px-2.5 py-1.5 backdrop-blur-2xl"
                    style={{ background: "rgba(15,13,11,0.6)", border: "1px solid rgba(212,175,110,0.16)", boxShadow: "0 10px 28px rgba(0,0,0,0.35)" }}
                  >
                    <Link href="/library" title={t.commonBack} aria-label={t.commonBack}
                      className="ndl-press flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[12px] text-amber-100/80 hover:bg-white/10">
                      ←
                    </Link>
                    <span className="min-w-0 max-w-[34vw] truncate px-1 text-[11px] font-semibold tracking-wide text-amber-50/85">{book}</span>
                    {displayLabel && (
                      <button onClick={() => setPageStripOpen(true)}
                        title={t.premiumReaderGoToPageTitle} aria-label={t.premiumReaderGoToPageTitle}
                        className="ndl-press flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-amber-200/70 hover:bg-white/10">
                        {displayLabel}
                      </button>
                    )}
                    <span className="h-4 w-px flex-shrink-0 bg-white/10" />
                    {/* Landscape fit-width follow-up: Bookmark and More
                        DROPPED from this bar — both already exist in the
                        bottom dock (Bookmarks, More), and having both a
                        top-bar AND a dock entry point for the same two
                        actions was the "two Bookmark controls" / "two
                        More controls" real-device report. Bookmark
                        functionality itself is untouched — still reachable
                        via the dock's Bookmarks button (opens Study
                        Workspace, same as before) and via
                        toggleBookmarkCurrentPage's other existing call
                        sites (portrait header, desktop toolbar). Top bar
                        is now exactly Back / title / page / Read Page —
                        "extremely slim," per spec. */}
                    {/* P0 regression fix: right-anchored + max-w clamp
                        (same reasoning as the portrait menu above) and no
                        backdrop <div> — this trigger sits inside a
                        horizontally-CENTERED floating pill, so its exact
                        on-screen X position varies with content width;
                        right-anchoring plus the viewport clamp keeps the
                        dropdown on-screen regardless. */}
                    <div ref={readMenuRef} className="relative flex-shrink-0">
                      <button onClick={() => setReadMenuOpen((v) => !v)} disabled={playerStatus === "starting"}
                        title={t.premiumReaderReadMenu} aria-label={t.premiumReaderReadMenu}
                        aria-haspopup="menu" aria-expanded={readMenuOpen}
                        className="ndl-press flex h-7 w-7 items-center justify-center rounded-full text-[13px] text-amber-100/80 hover:bg-white/10 disabled:opacity-40">
                        {playerStatus === "starting" ? "⏳"
                          : playerStatus === "playing" ? "⏸"
                          : playerStatus === "paused" ? "▶" : "🔊"}
                      </button>
                      {readMenuOpen && (
                        <div
                          role="menu" aria-label={t.premiumReaderReadMenu}
                          className="absolute right-0 top-9 z-[161] w-40 max-w-[min(200px,calc(100vw-2rem))] overflow-hidden rounded-2xl backdrop-blur-2xl py-1"
                          style={{ background: "rgba(15,13,11,0.92)", border: "1px solid rgba(212,175,110,0.18)" }}
                        >
                          <button role="menuitem" onClick={startReadPageFromMenu}
                            className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-amber-50 hover:bg-white/10">
                            📄 {t.premiumReaderReadPage}
                          </button>
                          <button role="menuitem" onClick={startReadChapter}
                            className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-amber-50 hover:bg-white/10">
                            📖 {t.premiumReaderReadChapter}
                          </button>
                          <button role="menuitem" onClick={startReadBook}
                            className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-semibold text-amber-50 hover:bg-white/10">
                            📚 {t.premiumReaderReadBook}
                          </button>
                        </div>
                      )}
                    </div>
                    {(playerStatus === "playing" || playerStatus === "paused") && (
                      <button onClick={handleStopAnyReadAloud}
                        title={t.premiumReaderPause}
                        aria-label={t.premiumReaderPause}
                        className="ndl-press flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[13px] text-amber-100/80 hover:bg-white/10">⏹</button>
                    )}
                  </div>
                </div>
              )}

              {/* ── Unified Reading Engine: persistent Reading Player +
                  its resume/chapter-unavailable dialogs. Rendered from
                  the single shared `readingEngineOverlays` value defined
                  above `return` — also mounted from the desktop branch —
                  so mobile and desktop share the exact same JSX/handlers,
                  never a second copy or a second state machine. */}
              {readingEngineOverlays}

              {/* ── Honest "Add to Home Screen" hint — see
                  showHomeScreenHint's own comment above for the full
                  reasoning. Fades with the rest of the chrome (same tap-
                  to-reveal/3s-idle schedule) since it only makes sense in
                  the same moment fullscreen was actually attempted; its
                  own dismissal is separate/permanent (localStorage), not
                  tied to the idle timer. */}
              {showHomeScreenHint && (
                <div
                  className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 ndl-chrome-fade ${mobileChromeCls}`}
                  style={{ paddingBottom: "max(3.5rem, calc(3rem + env(safe-area-inset-bottom)))" }}
                >
                  <div
                    className="pointer-events-auto flex max-w-[92vw] items-center gap-2 rounded-full px-3 py-2 backdrop-blur-2xl"
                    style={{ background: "rgba(15,13,11,0.82)", border: "1px solid rgba(212,175,110,0.2)", boxShadow: "0 10px 30px rgba(0,0,0,0.4)" }}
                  >
                    <span className="text-[11px] font-semibold leading-snug text-amber-50">{t.premiumReaderHomeScreenHint}</span>
                    <button onClick={dismissHomeScreenHint} aria-label={t.commonClose} title={t.commonClose}
                      className="ndl-press flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-[10px] text-white/80 hover:bg-white/25">✕</button>
                  </div>
                </div>
              )}

              {/* ── "More" sheet — secondary actions only (frequent
                  actions — Read Page, Zoom, Bookmark — live directly in
                  the header). Final mobile polish: Fit removed (mobile
                  has no pinch-zoom or drag-pan gesture, so pan/zoom
                  practically never drift from center — the button had
                  nothing real to reset, hence "does nothing"); Fullscreen
                  now hides itself when the browser has no Fullscreen API
                  at all (iOS Safari) instead of sitting there inert;
                  Book Information is new — the old Contents modal
                  (title/author/description/pages/language + Open PDF)
                  moved here now that the bottom nav's "Contents" opens
                  the real page list instead (see pageStripOpen below).
                  Opened from the bottom nav's "More" item. Deliberately
                  rendered outside the auto-hide wrapper so it's always
                  fully visible/interactive once opened. ────────────── */}
              {mobileMoreOpen && (isMobileLandscape ? (
                // ── Final mobile cleanup: a completely separate landscape
                // presentation — NOT the portrait bottom sheet resized. A
                // compact centered floating panel (max ~520px/~75dvh,
                // internally scrollable), dark translucent glass matching
                // the landscape header/dock's own visual language, actions
                // grouped into Reading/Study/Tools per spec. Same handlers
                // as the portrait sheet throughout — nothing new is wired,
                // only how it's presented. ─────────────────────────────
                <>
                  <div className="fixed inset-0 z-[160] bg-black/55" onClick={() => setMobileMoreOpen(false)} />
                  <div className="fixed inset-0 z-[161] flex items-center justify-center p-4" onClick={() => setMobileMoreOpen(false)}>
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex w-full flex-col overflow-hidden rounded-2xl backdrop-blur-2xl"
                      style={{
                        maxWidth: 520, maxHeight: "75dvh",
                        background: "rgba(15,13,11,0.86)",
                        border: "1px solid rgba(212,175,110,0.18)",
                        boxShadow: "0 24px 70px rgba(0,0,0,0.5)",
                      }}
                    >
                      <div className="flex flex-shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
                        <h2 className="text-sm font-black text-amber-50">{t.premiumReaderMoreTools}</h2>
                        <button onClick={() => setMobileMoreOpen(false)} aria-label={t.commonClose} title={t.commonClose}
                          className="ndl-press flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white/70 hover:bg-white/20">✕</button>
                      </div>

                      <div className="flex-1 overflow-y-auto px-4 py-3">
                        <div className="flex flex-col gap-4">
                          {/* ── Reading ───────────────────────────────── */}
                          <section>
                            <h3 className="mb-2 px-0.5 text-[10px] font-black uppercase tracking-wider text-amber-200/60">{t.premiumReaderReadingTab}</h3>
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center justify-between rounded-xl bg-white/8 px-3 py-2 ring-1 ring-white/10">
                                <span className="text-xs font-bold text-white/80">🔍 {t.premiumReaderZoomLabel}</span>
                                <div className="flex items-center gap-2">
                                  <button onClick={() => setZoom(z => Math.max(z - ZOOM_STEP, effectiveZoomMin))} disabled={zoom <= effectiveZoomMin}
                                    title={t.premiumReaderZoomOutTitle} aria-label={t.premiumReaderZoomOutTitle}
                                    className="ndl-press inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white/85 hover:bg-white/20 disabled:opacity-30">−</button>
                                  <span className="min-w-[32px] text-center text-xs font-bold tabular-nums text-white/70">{zoom}%</span>
                                  <button onClick={() => setZoom(z => Math.min(z + ZOOM_STEP, effectiveZoomMax))} disabled={zoom >= effectiveZoomMax}
                                    title={t.premiumReaderZoomInTitle} aria-label={t.premiumReaderZoomInTitle}
                                    className="ndl-press inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-bold text-white/85 hover:bg-white/20 disabled:opacity-30">+</button>
                                  <button onClick={fitScreen}
                                    title={t.premiumReaderFit} aria-label={t.premiumReaderFit}
                                    className="ndl-press inline-flex h-8 items-center rounded-full bg-white/10 px-3 text-[11px] font-bold text-white/85 hover:bg-white/20">{t.premiumReaderFit}</button>
                                </div>
                              </div>

                              <form onSubmit={(e) => { e.preventDefault(); goToPage(goToInput); setMobileMoreOpen(false); }}
                                className="flex items-center gap-2">
                                <input type="number" min={1}
                                  value={goToInput}
                                  onChange={(e) => setGoToInput(e.target.value)}
                                  placeholder={t.premiumReaderGoToPagePlaceholder}
                                  title={t.premiumReaderGoToPageTitle}
                                  className="h-9 flex-1 min-w-0 rounded-xl bg-white/8 px-3 text-xs text-white/90 ring-1 ring-white/10 outline-none placeholder:text-white/30 focus:ring-2 focus:ring-amber-400/60" />
                                <button type="submit"
                                  className="ndl-press flex h-9 flex-shrink-0 items-center rounded-xl bg-white/10 px-3 text-xs font-bold text-white/85 hover:bg-white/20">{t.premiumReaderGo}</button>
                              </form>

                              <div className="flex items-center justify-between rounded-xl bg-white/8 px-3 py-2 ring-1 ring-white/10">
                                <span className="text-xs font-bold text-white/80">🌐 {t.navLanguages}</span>
                                <LanguagePopover language={language} onLanguageChange={setLanguage} availableLanguages={availableToolbarLanguages} />
                              </div>

                              {fullscreenSupported && (
                                <button onClick={() => { layoutRef.current?.toggleFullscreen(); setMobileMoreOpen(false); }}
                                  title={isFullscreenLayout ? t.readerExitFullscreen : t.readerFullscreen}
                                  className="ndl-press flex h-9 items-center justify-center gap-1.5 rounded-xl bg-white/8 text-xs font-bold text-white/85 ring-1 ring-white/10 hover:bg-white/15">
                                  ⛶ {isFullscreenLayout ? t.readerExitFullscreen : t.readerFullscreen}
                                </button>
                              )}
                            </div>
                          </section>

                          {/* ── Study ─────────────────────────────────── */}
                          <section>
                            <h3 className="mb-2 px-0.5 text-[10px] font-black uppercase tracking-wider text-amber-200/60">{t.premiumReaderMoreSectionStudy}</h3>
                            <div className="grid justify-center gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, 84px)" }}>
                              {[
                                { href: "/notes", icon: "📝", label: t.navNotes },
                                { href: "/revision", icon: "🔄", label: t.navRevision },
                                { href: "/flashcards", icon: "🃏", label: t.commonFlashcards },
                                { href: "/quiz", icon: "❓", label: t.quizPageTitle },
                              ].map((link) => (
                                <Link key={link.href} href={link.href} onClick={() => setMobileMoreOpen(false)}
                                  className="ndl-press flex flex-col items-center gap-1 rounded-xl bg-white/8 px-1 py-2.5 text-center text-[10px] font-bold text-white/75 ring-1 ring-white/10 hover:bg-white/15">
                                  <span className="text-base leading-none">{link.icon}</span>
                                  <span className="truncate w-full">{link.label}</span>
                                </Link>
                              ))}
                            </div>
                          </section>

                          {/* ── Tools ─────────────────────────────────── */}
                          <section>
                            <h3 className="mb-2 px-0.5 text-[10px] font-black uppercase tracking-wider text-amber-200/60">{t.premiumReaderMoreSectionTools}</h3>
                            <div className="grid justify-center gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, 84px)" }}>
                              <button onClick={() => { setContentsOpen(true); setMobileMoreOpen(false); }}
                                className="ndl-press flex flex-col items-center gap-1 rounded-xl bg-white/8 px-1 py-2.5 text-center text-[10px] font-bold text-white/75 ring-1 ring-white/10 hover:bg-white/15">
                                <span className="text-base leading-none">ℹ️</span>
                                <span className="truncate w-full">{t.premiumReaderBookDetails}</span>
                              </button>
                              {[
                                { href: "/analytics", icon: "📊", label: t.navAnalytics },
                                { href: "/ai-tutor", icon: "🤖", label: t.navAiTutor },
                                { href: "/my-space", icon: "🧠", label: t.navMySpace },
                              ].map((link) => (
                                <Link key={link.href} href={link.href} onClick={() => setMobileMoreOpen(false)}
                                  className="ndl-press flex flex-col items-center gap-1 rounded-xl bg-white/8 px-1 py-2.5 text-center text-[10px] font-bold text-white/75 ring-1 ring-white/10 hover:bg-white/15">
                                  <span className="text-base leading-none">{link.icon}</span>
                                  <span className="truncate w-full">{link.label}</span>
                                </Link>
                              ))}
                              {isUploadedBook && (
                                <Link href={`/read?source=upload&id=${bookId}&page=${readerPage}`}
                                  onClick={() => setMobileMoreOpen(false)}
                                  className="ndl-press flex flex-col items-center gap-1 rounded-xl bg-white/8 px-1 py-2.5 text-center text-[10px] font-bold text-white/75 ring-1 ring-white/10 hover:bg-white/15">
                                  <span className="text-base leading-none">📖</span>
                                  <span className="truncate w-full">{t.readerReadNormally}</span>
                                </Link>
                              )}
                              <Link href="/" onClick={() => setMobileMoreOpen(false)}
                                className="ndl-press flex flex-col items-center gap-1 rounded-xl bg-white/8 px-1 py-2.5 text-center text-[10px] font-bold text-white/75 ring-1 ring-white/10 hover:bg-white/15">
                                <span className="text-base leading-none">🏠</span>
                                <span className="truncate w-full">{t.commonHome}</span>
                              </Link>
                            </div>
                          </section>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="fixed inset-0 z-[160] bg-black/40" onClick={() => setMobileMoreOpen(false)} />
                  <div className="fixed inset-x-0 bottom-0 z-[161] max-h-[70vh] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.25)]" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
                    <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-sm font-black text-slate-900">{t.premiumReaderMoreTools}</h2>
                      <button onClick={() => setMobileMoreOpen(false)} aria-label={t.commonClose} title={t.commonClose}
                        className="ndl-press flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200">✕</button>
                    </div>

                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-2">
                        <Link href="/" onClick={() => setMobileMoreOpen(false)}
                          className="ndl-press flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-bold text-slate-700 shadow ring-1 ring-slate-200">
                          🏠 {t.commonHome}
                        </Link>
                        <button onClick={() => { setContentsOpen(true); setMobileMoreOpen(false); }}
                          className="ndl-press flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-bold text-slate-700 shadow ring-1 ring-slate-200">
                          ℹ️ {t.premiumReaderBookDetails}
                        </button>
                      </div>

                      {/* RC1 P1 fix #6: Zoom's dedicated +/− controls,
                          relocated out of the header now that pinch-to-
                          zoom (RC1 P0 fix #3) is the primary way to zoom
                          on mobile — kept here, not removed, for anyone
                          who prefers buttons over a gesture. */}
                      <div className="flex items-center justify-between rounded-xl bg-amber-50/70 px-3 py-2 ring-1 ring-amber-100">
                        <span className="text-sm font-bold text-slate-700">🔍 {t.premiumReaderZoomLabel}</span>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setZoom(z => Math.max(z - ZOOM_STEP, ZOOM_MIN))} disabled={zoom <= ZOOM_MIN}
                            title={t.premiumReaderZoomOutTitle} aria-label={t.premiumReaderZoomOutTitle}
                            className="ndl-press inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-700 shadow ring-1 ring-amber-100 hover:bg-amber-100 disabled:opacity-40">−</button>
                          <span className="min-w-[34px] text-center text-xs font-bold tabular-nums text-slate-600">{zoom}%</span>
                          <button onClick={() => setZoom(z => Math.min(z + ZOOM_STEP, ZOOM_MAX))} disabled={zoom >= ZOOM_MAX}
                            title={t.premiumReaderZoomInTitle} aria-label={t.premiumReaderZoomInTitle}
                            className="ndl-press inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-700 shadow ring-1 ring-amber-100 hover:bg-amber-100 disabled:opacity-40">+</button>
                          <button onClick={fitScreen}
                            title={t.premiumReaderFit} aria-label={t.premiumReaderFit}
                            className="ndl-press inline-flex h-9 items-center rounded-full bg-white px-3 text-xs font-bold text-slate-700 shadow ring-1 ring-amber-100 hover:bg-amber-100">{t.premiumReaderFit}</button>
                        </div>
                      </div>

                      {fullscreenSupported && (
                        <button onClick={() => { layoutRef.current?.toggleFullscreen(); setMobileMoreOpen(false); }}
                          title={isFullscreenLayout ? t.readerExitFullscreen : t.readerFullscreen}
                          className="ndl-press flex h-11 items-center justify-center gap-1.5 rounded-xl bg-amber-50/70 text-sm font-bold text-slate-700 ring-1 ring-amber-100">
                          ⛶ {isFullscreenLayout ? t.readerExitFullscreen : t.readerFullscreen}
                        </button>
                      )}

                      {isUploadedBook && (
                        <Link href={`/read?source=upload&id=${bookId}&page=${readerPage}`}
                          onClick={() => setMobileMoreOpen(false)}
                          className="ndl-press flex h-11 items-center justify-center gap-1.5 rounded-xl bg-white text-sm font-bold text-slate-700 shadow ring-1 ring-slate-200">
                          📖 {t.readerReadNormally}
                        </Link>
                      )}

                      <form onSubmit={(e) => { e.preventDefault(); goToPage(goToInput); setMobileMoreOpen(false); }}
                        className="flex items-center gap-2">
                        <input type="number" min={1}
                          value={goToInput}
                          onChange={(e) => setGoToInput(e.target.value)}
                          placeholder={t.premiumReaderGoToPagePlaceholder}
                          title={t.premiumReaderGoToPageTitle}
                          className="h-11 flex-1 min-w-0 rounded-xl bg-slate-50 px-3 text-sm text-slate-800 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-amber-400" />
                        <button type="submit"
                          className="ndl-press flex h-11 flex-shrink-0 items-center rounded-xl bg-amber-50/70 px-4 text-sm font-bold text-slate-700 ring-1 ring-amber-100">{t.premiumReaderGo}</button>
                      </form>

                      {/* P0: Text Select / Image Select removed from the
                          mobile sheet for now — both depend on
                          PdfBookSpread's text layer / crop-select target,
                          which MobilePdfPage doesn't render yet (see that
                          component's file-top comment). Untouched on
                          desktop/tablet, where PdfBookSpread still owns
                          both modes exactly as before. */}

                      <div className="flex items-center justify-between rounded-xl bg-amber-50/70 px-3 py-2 ring-1 ring-amber-100">
                        <span className="text-sm font-bold text-slate-700">🌐 {t.navLanguages}</span>
                        <LanguagePopover language={language} onLanguageChange={setLanguage} availableLanguages={availableToolbarLanguages} />
                      </div>

                      {/* ── Phase D3.1 point 1: the rest of ReaderNav's
                          links — the permanent left rail is hidden below
                          640px (hideNav in PremiumReaderLayout), and
                          "Library" is already covered by the header's
                          own Back button above, but Notes/Revision/
                          Flashcards/Quiz/Analytics/AI Tutor/My Space had
                          no mobile entry point until now. Same hrefs and
                          labels ReaderNav.tsx itself uses — not a new
                          navigation system, just this sheet absorbing
                          the rail's remaining destinations. ─────────── */}
                      <div>
                        <div className="mb-2 h-px bg-amber-100" />
                        {/* Final mobile cleanup: fixed grid-cols-4 left a
                            dangling empty cell under this list's 7 items
                            (3,3,1 — the last row's lone tile wasn't
                            centered). auto-fit with a FIXED track width
                            (not 1fr) collapses unused tracks instead of
                            stretching them, and justify-center centers
                            whatever's left in the last row — works for
                            any item count, not just this one, and needs
                            no breakpoint-specific overrides. */}
                        <div className="grid justify-center gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, 84px)" }}>
                          {[
                            { href: "/notes", icon: "📝", label: t.navNotes },
                            { href: "/revision", icon: "🔄", label: t.navRevision },
                            { href: "/flashcards", icon: "🃏", label: t.commonFlashcards },
                            { href: "/quiz", icon: "❓", label: t.quizPageTitle },
                            { href: "/analytics", icon: "📊", label: t.navAnalytics },
                            { href: "/ai-tutor", icon: "🤖", label: t.navAiTutor },
                            { href: "/my-space", icon: "🧠", label: t.navMySpace },
                          ].map((link) => (
                            <Link key={link.href} href={link.href} onClick={() => setMobileMoreOpen(false)}
                              className="ndl-press flex flex-col items-center gap-1 rounded-xl bg-amber-50/70 px-1 py-2.5 text-center text-[10px] font-bold text-slate-600 ring-1 ring-amber-100 hover:bg-amber-100">
                              <span className="text-base leading-none">{link.icon}</span>
                              <span className="truncate w-full">{link.label}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              ))}
            </>
          )}

          {/* ── Page strip — opened by tapping the header's page-
              indicator badge, AND (final mobile polish point 5) now
              also the bottom nav's "Contents" button, as the actual
              page list. A numbered jump list (same cap convention as
              app/read/page.tsx's existing thumbnail sidebar,
              THUMBNAIL_LIMIT=30) rather than rendered PDF-page
              thumbnails — no bitmap-thumbnail pipeline exists anywhere
              in this app to reuse, and building one would be a new
              feature, not an interaction. Each button calls
              navigateToPdfPage — the same primitive goToPage() itself
              calls — so this is one more entry point into existing
              navigation, not a second navigation system. */}
          {isMobileViewport && pageStripOpen && (
            <>
              <div className="fixed inset-0 z-[160] bg-black/40" onClick={() => setPageStripOpen(false)} />
              <div className="fixed inset-x-0 bottom-0 z-[161] max-h-[60vh] overflow-y-auto rounded-t-3xl bg-white p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.25)]" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
                <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" />
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-black text-slate-900">{t.premiumReaderContents}</h2>
                  <button onClick={() => setPageStripOpen(false)} aria-label={t.commonClose} title={t.commonClose}
                    className="ndl-press flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200">✕</button>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {Array.from({ length: Math.min(PAGE_STRIP_LIMIT, totalPages) }, (_, i) => i + 1).map((p) => (
                    <button key={p}
                      onClick={() => { navigateToPdfPage(p); setPageStripOpen(false); }}
                      className={`ndl-press flex h-12 flex-col items-center justify-center rounded-xl text-[11px] font-bold ${
                        p === readerPage ? "bg-slate-900 text-white shadow" : "bg-amber-50/70 text-slate-700 hover:bg-amber-100"}`}>
                      {/* RC1 P0 fix #5 (blank Contents placeholders): most
                          books (everything except Nalanda/Chandrayaan-3 —
                          see lib/printedPageMap.ts) have no printed-page
                          map at all, so getDisplayLabel returns "" for
                          every one of their pages — every button in this
                          grid rendered blank for those books. Falls back
                          to the real PDF page number (never a fabricated
                          chapter name) exactly like resolvePrintedPageTarget
                          already does for Go to Page on an unmapped book. */}
                      {getDisplayLabel(p, printedPageMap) || p}
                    </button>
                  ))}
                </div>
                {totalPages > PAGE_STRIP_LIMIT && (
                  <p className="mt-3 px-1 text-[11px] font-semibold text-slate-400">+{totalPages - PAGE_STRIP_LIMIT} {t.readerMorePages}</p>
                )}
              </div>
            </>
          )}

          {/* ── DRAG / SELECTION VISUAL OVERLAYS ───────────────
              Purely presentational — position:fixed, screen coords,
              same technique as the floating menu below (both live
              outside the zoomed/transformed subtree inside
              PdfBookSpread, so screen coords already match). */}
          {(textSelectMode || imageSelectMode) && liveDragRect && liveDragRect.width > 2 && liveDragRect.height > 2 && (
            <div style={{
              position: "fixed",
              left: liveDragRect.left, top: liveDragRect.top,
              width: liveDragRect.width, height: liveDragRect.height,
              border: "2px dashed #c18a3f",
              background: "rgba(193,138,63,0.15)",
              boxSizing: "border-box", pointerEvents: "none", zIndex: 150,
            }} />
          )}
          {/* TEXT mode result — solid blue box(es), no badge */}
          {textSelectMode && selectionRects.map((r, i) => (
            <div key={i} style={{
              position: "fixed",
              left: r.left, top: r.top, width: r.width, height: r.height,
              background: "rgba(59,130,246,0.35)",
              border: "1px solid rgba(59,130,246,0.65)",
              boxSizing: "border-box", pointerEvents: "none", zIndex: 150,
            }} />
          ))}
          {/* IMAGE mode result — amber box with "Selected" badge */}
          {imageSelectMode && capturedImageRect && (
            <div style={{
              position: "fixed",
              left: capturedImageRect.left, top: capturedImageRect.top,
              width: capturedImageRect.width, height: capturedImageRect.height,
              border: "2px solid #c18a3f",
              background: "rgba(193,138,63,0.12)",
              boxSizing: "border-box", pointerEvents: "none", zIndex: 150,
            }}>
              <div style={{
                position: "absolute", top: -20, left: 0,
                background: "#c18a3f", color: "#fff",
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                whiteSpace: "nowrap",
              }}>
                📷 {t.premiumReaderImageSelectedBadge}
              </div>
            </div>
          )}

          {/* PHASE 2 highlight/note overlays are no longer rendered here —
              they're now passed as pageHighlights/pageNotes props to
              PdfBookSpread below, which paints them INSIDE its own
              PageBox (the same container that owns the canvas), using
              percentage-based absolute positioning. See PdfBookSpread.tsx
              for the actual rendering. */}

          {/* ── UNIFIED FLOATING MENU ─────────────────────────
              Visible ONLY when activeSelection != null AND
              mode matches the selection type.
              Clicking mode buttons always hides the stale menu
              because switchInteractionMode clears activeSelection. */}
          {showFloatingMenu && activeSelection && (() => {
            // Clamp menu to viewport so it never goes off-screen
            const MENU_W = 280;
            const MENU_H = activeSelection.type === "text" ? 170 : 210;
            const PAD = 12;
            const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
            const vh = typeof window !== "undefined" ? window.innerHeight : 800;

            let rawLeft: number, rawTop: number;

            if (activeSelection.type === "text") {
              // Prefer above, fall back to below
              const spaceAbove = activeSelection.y - MENU_H - PAD;
              const showAbove = spaceAbove >= PAD;
              rawTop = showAbove
                ? activeSelection.y - MENU_H - 8
                : activeSelection.y + 24;
              rawLeft = activeSelection.x - MENU_W / 2;
            } else {
              rawLeft = vw / 2 - MENU_W / 2;
              rawTop = vh * 0.28 - MENU_H / 2;
            }

            // Hard clamp to viewport
            const left = Math.max(PAD, Math.min(rawLeft, vw - MENU_W - PAD));
            const top  = Math.max(PAD, Math.min(rawTop,  vh - MENU_H - PAD));

            return (
            <div
              className="ndl-fade-in-scale"
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              style={{
                position: "fixed",
                top, left,
                zIndex: 200,
                background: "rgba(255,255,255,0.97)",
                border: "1px solid #e5e0d0",
                borderRadius: 20,
                padding: "12px 14px",
                boxShadow: "0 16px 50px rgba(0,0,0,0.20)",
                backdropFilter: "blur(16px)",
                width: MENU_W,
                boxSizing: "border-box" as const,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                            marginBottom: 10, gap: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#92774a",
                            letterSpacing: "0.07em", textTransform: "uppercase",
                            maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {activeSelection.type === "text"
                    ? `"${activeSelection.text.slice(0, 40)}${activeSelection.text.length > 40 ? "…" : ""}"`
                    : t.premiumReaderImagePageLabel.replace("{page}", String(activeSelection.pageNumber))}
                </p>
                <button onClick={clearActiveSelection}
                  style={{ background: "#f1f0ee", border: "none", borderRadius: 999,
                            padding: "3px 10px", fontSize: 11, fontWeight: 700,
                            color: "#64748b", cursor: "pointer", flexShrink: 0 }}>
                  ✕ {t.premiumReaderFloatingClear}
                </button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {activeSelection.type === "text" ? (
                  <>
                    {["explain","summarize","translate","quiz","notes","flashcards"].map(action => (
                      <button key={action} className="ndl-press" onClick={() => handleSelectionAction(action)}
                        style={{ background: "#0f172a", color: "#fff", border: "none",
                                  borderRadius: 12, padding: "8px 14px", fontSize: 12,
                                  fontWeight: 700, cursor: "pointer" }}>
                        { action==="explain" ? `🧠 ${t.aiActionExplain}`
                        : action==="summarize" ? `📝 ${t.aiActionSummarize}`
                        : action==="translate" ? `🌍 ${t.aiActionTranslate}`
                        : action==="quiz"      ? `❓ ${t.aiActionQuiz}`
                        : action==="notes"     ? `📌 ${t.aiActionNotes}`
                                               : `🎴 ${t.commonFlashcards}` }
                      </button>
                    ))}
                    {/* Phase 2 — Feature 1 & 2: these open their own small
                        popovers (color picker / note editor) rather than
                        going through the AI router — they don't call an
                        AI action at all. */}
                    <button className="ndl-press" onClick={() => {
                        // Snapshot NOW — before this click's own mouseup
                        // bubbles to handleMouseUp and clears selectionRects.
                        pendingSelectionRectsRef.current = selectionRects;
                        setShowNotePopover(false); setShowColorPicker(true);
                      }}
                      style={{ background: "#c18a3f", color: "#fff", border: "none",
                                borderRadius: 12, padding: "8px 14px", fontSize: 12,
                                fontWeight: 700, cursor: "pointer" }}>
                      ⭐ {t.aiActionHighlight}
                    </button>
                    <button className="ndl-press" onClick={() => {
                        pendingSelectionRectsRef.current = selectionRects;
                        setShowColorPicker(false); setLastNoteWasImproved(false); setShowNotePopover(true);
                      }}
                      style={{ background: "#334155", color: "#fff", border: "none",
                                borderRadius: 12, padding: "8px 14px", fontSize: 12,
                                fontWeight: 700, cursor: "pointer" }}>
                      📝 {t.premiumReaderAddNote}
                    </button>
                  </>
                ) : (
                  // Image selection menu — Explain Image + Summarize Diagram + Ask About Image (custom input)
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
                    {[
                      { action: "explain",   label: `🔍 ${t.aiImageExplain}` },
                      { action: "summarize", label: `📊 ${t.aiImageSummarize}` },
                    ].map(({ action, label }) => (
                      <button key={action} onClick={() => handleSelectionAction(action)}
                        style={{ background: "#0f172a", color: "#fff", border: "none",
                                  borderRadius: 12, padding: "8px 14px", fontSize: 12,
                                  fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
                        {label}
                      </button>
                    ))}

                    {/* Ask About Image — togglable custom question input */}
                    {!showAskInput ? (
                      <button onClick={() => setShowAskInput(true)}
                        style={{ background: "#334155", color: "#e2e8f0", border: "none",
                                  borderRadius: 12, padding: "8px 14px", fontSize: 12,
                                  fontWeight: 700, cursor: "pointer", textAlign: "left" }}>
                        ❓ {t.aiImageAsk}
                      </button>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                        <input
                          autoFocus
                          value={askImageInput}
                          onChange={e => setAskImageInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && askImageInput.trim()) {
                              handleSelectionAction("ask", askImageInput.trim());
                              setAskImageInput(""); setShowAskInput(false);
                            }
                            if (e.key === "Escape") { setShowAskInput(false); setAskImageInput(""); }
                          }}
                          placeholder={t.premiumReaderImageQuestionPlaceholder}
                          style={{ borderRadius: 10, border: "1px solid #c18a3f", padding: "7px 10px",
                                    fontSize: 12, outline: "none", width: "100%", boxSizing: "border-box" }}
                        />
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            disabled={!askImageInput.trim()}
                            onClick={() => {
                              if (askImageInput.trim()) {
                                handleSelectionAction("ask", askImageInput.trim());
                                setAskImageInput(""); setShowAskInput(false);
                              }
                            }}
                            style={{ flex: 1, background: "#0f172a", color: "#fff", border: "none",
                                      borderRadius: 10, padding: "7px 12px", fontSize: 12,
                                      fontWeight: 700, cursor: "pointer", opacity: askImageInput.trim() ? 1 : 0.4 }}>
                            {t.premiumReaderAsk}
                          </button>
                          <button onClick={() => { setShowAskInput(false); setAskImageInput(""); }}
                            style={{ background: "#f1f0ee", color: "#64748b", border: "none",
                                      borderRadius: 10, padding: "7px 12px", fontSize: 12,
                                      fontWeight: 600, cursor: "pointer" }}>
                            {t.commonCancel}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
          })()}

          {/* ── PHASE 2 popovers — only ever shown for a TEXT selection,
              anchored at the same point the floating menu uses. ────── */}
          {showColorPicker && activeSelection && activeSelection.type === "text" && (
            <HighlightColorPicker
              left={activeSelection.x}
              top={activeSelection.y + 24}
              onPick={addHighlight}
              onCancel={() => setShowColorPicker(false)}
            />
          )}
          {showNotePopover && activeSelection && activeSelection.type === "text" && (
            <NotePopover
              left={activeSelection.x}
              top={activeSelection.y + 24}
              initialText=""
              selectedTextPreview={activeSelection.text}
              improving={noteImproving}
              onImprove={improveNoteWithAI}
              onSave={(text) => saveNote(text, lastNoteWasImproved)}
              onCancel={() => setShowNotePopover(false)}
            />
          )}

          {/* ── PDF Spread — Previous/Next as side arrows near the page
              edges rather than inline buttons, per the redesign; same
              goPrev/goNext handlers, nothing about page logic changed.
              Phase D1: on mobile these get a lighter visual treatment
              (smaller, more translucent, softer shadow) so they read as
              a subtle affordance rather than a UI chrome element — same
              onClick/aria wiring, desktop classes untouched. Phase D3
              point 1: on mobile these also fade with the rest of the
              chrome in immersive mode (mobileChromeCls) — desktop's
              opacity/pointer-events are untouched (always visible).
              Premium landscape redesign: a third, even lighter variant —
              thin chevrons that "almost disappear when inactive" instead
              of the portrait pill (no white circle, no shadow), still the
              exact same goPrev/goNext/mobileChromeCls wiring. Desktop and
              portrait classes are untouched. ─────────────────────────── */}
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <button
              onClick={goPrev}
              title={t.commonPrevious}
              aria-label={t.premiumReaderPreviousPage}
              {...(isMobileViewport ? { "data-dock-avoid": true } : {})}
              className={`ndl-press absolute top-1/2 z-30 -translate-y-1/2 flex items-center justify-center rounded-full hover:bg-white ${
                isMobileLandscape
                  ? `left-0 h-10 w-6 text-white/40 text-base hover:text-white/70 hover:bg-transparent ndl-chrome-fade ${mobileChromeCls}`
                  : isMobileViewport
                  ? `left-1 h-9 w-9 bg-white/70 text-base text-slate-700 shadow ring-1 ring-amber-100/70 ndl-chrome-fade ${mobileChromeCls}`
                  : "left-1 h-11 w-11 bg-white/90 text-lg text-slate-700 shadow-lg ring-1 ring-amber-100"}`}
              style={isMobileLandscape ? { paddingLeft: "env(safe-area-inset-left)" } : undefined}
            >
              ‹
            </button>
            <button
              onClick={goNext}
              title={t.commonNext}
              aria-label={t.premiumReaderNextPage}
              {...(isMobileViewport ? { "data-dock-avoid": true } : {})}
              className={`ndl-press absolute top-1/2 z-30 -translate-y-1/2 flex items-center justify-center rounded-full hover:bg-white ${
                isMobileLandscape
                  ? `right-0 h-10 w-6 text-white/40 text-base hover:text-white/70 hover:bg-transparent ndl-chrome-fade ${mobileChromeCls}`
                  : isMobileViewport
                  ? `right-1 h-9 w-9 bg-white/70 text-base text-slate-700 shadow ring-1 ring-amber-100/70 ndl-chrome-fade ${mobileChromeCls}`
                  : "right-1 h-11 w-11 bg-white/90 text-lg text-slate-700 shadow-lg ring-1 ring-amber-100"}`}
              style={isMobileLandscape ? { paddingRight: "env(safe-area-inset-right)" } : undefined}
            >
              ›
            </button>
            {/* P0: below 640px, MobilePdfPage replaces PdfBookSpread
                entirely — a deliberately minimal single-page renderer (no
                spread, no crop-detection, no text/image-selection layer,
                no preloading). Desktop/tablet render exactly the same
                PdfBookSpread call as before, byte-for-byte unchanged. */}
            {isMobileViewport ? (
              <MobilePdfPage
                key={`${bookId}:${currentBook.pdf}`}
                pdfPath={currentBook.pdf}
                pageNumber={readerPage}
                totalPages={totalPages}
                zoom={zoom} pan={pan}
                isPanning={isPanning}
                getPdfDocument={getMobilePdfDocument}
                onTextExtracted={handleTextExtracted}
                landscape={isMobileLandscape}
                renderDebug={renderDebugEnabled}
                onContentMetrics={handleLandscapeContentMetrics}
              />
            ) : (
              <PdfBookSpread
                pdfPath={currentBook.pdf}
                pageNumber={readerPage}
                totalPages={String(totalPages)}
                layoutMode={isSpreadBook ? "spread" : "single"}
                zoom={zoom} pan={pan}
                textSelectMode={textSelectMode}
                imageSelectMode={imageSelectMode}
                pageHighlights={pageHighlightsForSpread}
                pageNotes={pageNotesForSpread}
                bookId={bookId}
                onPageRendered={handlePageRendered}
                onTextExtracted={handleTextExtracted}
                isPanning={isPanning}
              />
            )}
          </div>

          {/* ── Mobile-only 4-item bottom navigation — AI, Bookmarks,
              Reading, More. Real-device fix 4 dropped "Study" from this
              row: the AI sheet's own "Ask AI / Study" tab pill is one
              tap inside the AI entry already, so a separate bottom-nav
              Study button was pure duplication. setOpenStudyTabSignal
              itself is untouched — the "studyTab" voice command still
              uses it, only this nav entry point is gone. Final mobile
              cleanup replaced Contents (raw page-number list — no real
              chapter/TOC data exists anywhere in this app) with
              Bookmarks, since Go to Page in More already covers the same
              job Contents did. Every remaining button is still just an
              entry point into something that already exists:
                AI            → toggleAiPanelCompact, same fn the old
                                floating 🤖 trigger used (retired in D1
                                since this button covers the same job).
                Bookmarks     → openMobileBookmarks: opens the AI panel's
                                EXISTING Study Workspace bookmarks view
                                (same persistence, same jump-to-page,
                                same delete — no new implementation).
                Reading       → dispatches "ndl-open-accessibility-panel"
                                (unchanged from D1); AccessibilityToolbar
                                renders its glass variant for this call
                                site specifically (see variant="glass"
                                below), not the old opaque modal.
                More          → setMobileMoreOpen, the same sheet as
                                D1 (Home, Fullscreen, Fit, Go to page,
                                Language) — now a direct primary nav
                                item instead of a header sub-menu.
              Desktop/tablet keep the exact original bottom reading bar
              (Contents, page label, progress slider, fullscreen toggle)
              below, byte-for-byte unchanged — Contents is a genuine,
              still-used desktop feature (More → Book Information on
              mobile opens the identical modal), only its MOBILE bottom-
              nav entry point moved. ──────────────────────────────────── */}
          {isMobileViewport ? (
            isMobileLandscape ? (
              // ── Premium landscape redesign: compact centered floating
              // dock (position:fixed — zero flow footprint, same reasoning
              // as the landscape header above), NOT the full-width
              // justify-between bar portrait uses. Same 4 destinations/
              // handlers as portrait, icon-only (labels dropped — landscape
              // height is precious and title/aria-label already carry the
              // full text for accessibility). Fades with mobileChromeCls,
              // same tap-to-reveal + 3s auto-hide as everywhere else. ────
              <div
                data-dock-avoid
                className={`pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center ndl-chrome-fade ${mobileChromeCls}`}
                style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
              >
                <div
                  className="pointer-events-auto flex items-center gap-1 rounded-full px-2 py-1.5 backdrop-blur-2xl"
                  style={{ background: "rgba(15,13,11,0.6)", border: "1px solid rgba(212,175,110,0.16)", boxShadow: "0 10px 28px rgba(0,0,0,0.35)" }}
                >
                  {/* Landscape fit-width follow-up: icons ~20% larger
                      (15px → 18px) and the tap target grown to the
                      40-44px minimum (h-9/36px → h-10/40px) — "slightly
                      too small" on real devices. Dock itself stays just
                      as compact (same px-2 py-1.5 pill, same gap-1). */}
                  <button onClick={toggleAiPanelCompact}
                    title={t.aiCompanionExpand} aria-label={t.aiCompanionExpand}
                    className="ndl-press flex h-10 w-10 items-center justify-center rounded-full text-[18px] text-amber-100/80 hover:bg-white/10">🤖</button>
                  <button onClick={openMobileBookmarks}
                    title={t.myLibraryBookmarks} aria-label={t.myLibraryBookmarks}
                    className="ndl-press flex h-10 w-10 items-center justify-center rounded-full text-[18px] text-amber-100/80 hover:bg-white/10">🔖</button>
                  <button onClick={() => window.dispatchEvent(new Event("ndl-open-accessibility-panel"))}
                    title={t.a11yReadingOptions} aria-label={t.settingsAccessibility}
                    className="ndl-press flex h-10 w-10 items-center justify-center rounded-full text-[18px] text-amber-100/80 hover:bg-white/10">♿</button>
                  <button onClick={() => setMobileMoreOpen(true)}
                    title={t.premiumReaderMoreTools} aria-label={t.premiumReaderMoreTools}
                    className="ndl-press flex h-10 w-10 items-center justify-center rounded-full text-[18px] text-amber-100/80 hover:bg-white/10">⋯</button>
                </div>
              </div>
            ) : (
            <div
              data-dock-avoid
              className={`mx-auto mt-1 flex w-full max-w-[1340px] flex-shrink-0 items-center justify-between gap-1 rounded-2xl bg-white px-2 py-1.5 shadow ring-1 ring-amber-100 ndl-chrome-fade ${mobileChromeCls}`}
              style={{ marginBottom: "env(safe-area-inset-bottom)" }}
            >
              <button onClick={toggleAiPanelCompact}
                title={t.aiCompanionExpand} aria-label={t.aiCompanionExpand}
                className={`ndl-press flex flex-1 items-center justify-center rounded-xl text-[10px] font-bold text-slate-600 hover:bg-amber-50 ${mobileNavBtnCls}`}>
                <span className="text-base leading-none" aria-hidden="true">🤖</span>
                {t.premiumReaderAiTab}
              </button>
              {/* Final mobile cleanup: "Contents" replaced with
                  "Bookmarks" — Contents only ever listed raw page
                  numbers (no chapter/TOC data exists anywhere in this
                  app, see lib/printedPageMap.ts), and Go to Page already
                  covers that same job from More, making the page-list
                  sheet redundant as a primary nav destination. Opens the
                  EXISTING Study Workspace bookmarks view (openMobileBookmarks
                  above) rather than a new implementation — same
                  persistence, same jump-to-page, same delete. The
                  page-strip sheet itself isn't deleted: the header's page
                  badge still opens it directly. */}
              <button onClick={openMobileBookmarks}
                title={t.myLibraryBookmarks} aria-label={t.myLibraryBookmarks}
                className={`ndl-press flex flex-1 items-center justify-center rounded-xl text-[10px] font-bold text-slate-600 hover:bg-amber-50 ${mobileNavBtnCls}`}>
                <span className="text-base leading-none" aria-hidden="true">🔖</span>
                {t.myLibraryBookmarks}
              </button>
              {/* Real-device fix 4: "Study" removed from the bottom nav —
                  it duplicated the AI sheet's own "Ask AI / Study" tabs
                  one tap away. setOpenStudyTabSignal/openStudyTabSignal
                  itself is untouched (still used by the "studyTab" voice
                  command and the AI sheet's own tab pill), only this
                  entry point is gone. Bottom nav is now AI / Contents /
                  Reading / More. */}
              {/* Phase D3.1 point 6: visible label reads "Reading" (short,
                  matches the sheet's own "Reading Options" title) while
                  title/aria-label keep the fuller "Accessibility" meaning
                  for screen readers — same dispatch, same glass panel,
                  no feature change, just a friendlier mobile label. */}
              <button onClick={() => window.dispatchEvent(new Event("ndl-open-accessibility-panel"))}
                title={t.a11yReadingOptions} aria-label={t.settingsAccessibility}
                className={`ndl-press flex flex-1 items-center justify-center rounded-xl text-[10px] font-bold text-slate-600 hover:bg-amber-50 ${mobileNavBtnCls}`}>
                <span className="text-base leading-none" aria-hidden="true">♿</span>
                {t.premiumReaderReadingTab}
              </button>
              <button onClick={() => setMobileMoreOpen(true)}
                title={t.premiumReaderMoreTools} aria-label={t.premiumReaderMoreTools}
                className={`ndl-press flex flex-1 items-center justify-center rounded-xl text-[10px] font-bold text-slate-600 hover:bg-amber-50 ${mobileNavBtnCls}`}>
                <span className="text-base leading-none" aria-hidden="true">⋯</span>
                {t.premiumReaderMoreTools}
              </button>
            </div>
            )
          ) : (
            <div className={`mx-auto ${fsBottomMt} flex w-full max-w-[1340px] flex-shrink-0 items-center gap-3 rounded-full bg-white px-4 ${fsBottomPy} shadow ring-1 ring-amber-100`}>
              <button
                onClick={() => setContentsOpen(true)}
                className="ndl-press flex flex-shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-amber-100"
              >
                📚 {t.premiumReaderContents}
              </button>
              <span className="flex-shrink-0 text-xs font-bold tabular-nums text-slate-500">
                {displayLabel || `${readerPage} / ${totalPages}`}
              </span>
              <div className="h-1.5 flex-1 rounded-full bg-amber-100">
                <div
                  className="h-1.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-500 transition-[width] duration-300 ease-out"
                  style={{ width: `${Math.min(100, Math.round((readerPage / totalPages) * 100))}%` }}
                />
              </div>
              <button
                onClick={() => layoutRef.current?.toggleFullscreen()}
                title={isFullscreenLayout ? t.readerExitFullscreen : t.readerFullscreen}
                className="ndl-press flex-shrink-0 flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 text-xs text-slate-700 hover:bg-amber-100"
              >
                ⛶
              </button>
            </div>
          )}

          {/* ── Contents — book info (title/author/description/pages/
              language + Open PDF), the same content the old leftPanel
              slide-out showed, now a compact modal reachable from the
              bottom bar's "Contents" button in either screen mode. ──── */}
          {contentsOpen && (
            <div
              className="ndl-fade-in-scale fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
              onClick={() => setContentsOpen(false)}
            >
              <div
                className="ndl-fade-in-scale w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-xl font-black text-slate-900">{currentBook.title}</h2>
                  <button onClick={() => setContentsOpen(false)}
                    className="ndl-press flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-50 text-slate-500 hover:bg-amber-100">✕</button>
                </div>
                {currentBook.author && <p className="mt-1 text-sm text-slate-500">{currentBook.author}</p>}
                {currentBook.description && <p className="mt-4 text-sm leading-6 text-slate-600">{currentBook.description}</p>}
                <div className="mt-5 rounded-2xl bg-amber-50 p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t.premiumReaderBookDetails}</p>
                  <p className="mt-2 text-sm text-slate-700">{t.readerPages}: {currentBook.pages}</p>
                  {currentBook.language && <p className="mt-1 text-sm text-slate-700">{t.language}: {currentBook.language}</p>}
                </div>
                <a href={currentBook.pdf} target="_blank" rel="noopener noreferrer"
                  className="ndl-press mt-5 inline-block rounded-xl bg-orange-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-700">
                  {t.premiumReaderOpenPdf}
                </a>
              </div>
            </div>
          )}
        </div>
      }
      aiPanel={
        <AICompanion
          aiResponse={aiResponse}
          isLoading={aiLoading}
          aiQuestion={aiQuestion}
          setAiQuestion={setAiQuestion}
          onAsk={askPremiumAI}
          onQuickAction={runQuickAction}
          bookTitle={book}
          language={language}
          onLanguageChange={setLanguage}
          availableLanguages={availableToolbarLanguages}
          scope={scope}
          onScopeChange={setScope}
          depth={depth}
          onDepthChange={setDepth}
          hasActiveSelection={activeSelection?.type === "text"}
          aiFailed={aiFailed}
          onRetry={() => lastAiCallRef.current?.()}
          aiSpeechState={aiSpeechState}
          onReadAiResponse={handleReadAiResponse}
          onStopAiResponse={handleStopAiResponse}
          aiVoiceNotice={aiVoiceNotice}
          compact={aiPanelCompact}
          onToggleCompact={toggleAiPanelCompact}
          openStudyTabSignal={openStudyTabSignal}
          openBookmarksSignal={openBookmarksSignal}
          studyHighlights={highlights.filter(h => h.bookId === bookId)}
          studyNotes={notes.filter(n => n.bookId === bookId)}
          studyBookmarks={bookmarks.filter(b => b.bookId === bookId)}
          printedPageMap={printedPageMap}
          onStudyJumpToPage={studyJumpToPage}
          onStudyDeleteHighlight={removeHighlight}
          onStudyDeleteNote={removeNote}
          onStudyDeleteBookmark={removeBookmark}
          onStudyGenerateFromHighlight={generateFromHighlight}
          studyGeneratingId={studyGeneratingId}
          mobileSheet={isMobileViewport}
        />
      }
    />
    <AccessibilityToolbar hideTrigger={isMobileViewport} variant={isMobileViewport ? "glass" : "default"} />
    {/* Temporary real-device gesture diagnostics — visible only with
        ?gestureDebug=1 in the URL, never otherwise. Remove once the
        real-iPhone gesture fix is confirmed and no longer needs
        on-device instrumentation. pointer-events:none so it can never
        itself intercept a gesture. */}
    {gestureDebugEnabled && (
      <div
        style={{
          position: "fixed", top: 8, left: 8, zIndex: 99999, pointerEvents: "none",
          background: "rgba(0,0,0,0.82)", color: "#0f0", fontFamily: "monospace",
          fontSize: 11, lineHeight: 1.5, padding: "8px 10px", borderRadius: 8,
          maxWidth: 260, whiteSpace: "pre",
        }}
      >
{`gestureDebug
mounted:  ${bookAreaMounted}
listener: ${debugInfo.listenerMounted}
pointers: ${debugInfo.activePointerCount} (down x${debugInfo.pointerDownCount})
event:    ${debugInfo.lastEventType}
state:    ${debugInfo.gestureState}
start:    ${debugInfo.startX.toFixed(0)}, ${debugInfo.startY.toFixed(0)}
cur:      ${debugInfo.curX.toFixed(0)}, ${debugInfo.curY.toFixed(0)}
dist:     ${debugInfo.distance.toFixed(1)}
zoom:     ${debugInfo.zoom}%
pdefault: ${debugInfo.preventDefaultCalled}`}
      </div>
    )}
    </>
  );
}
