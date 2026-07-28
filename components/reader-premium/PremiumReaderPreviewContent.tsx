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

type SpeechState = "idle" | "loading" | "speaking" | "paused";
const ZOOM_MIN = 50, ZOOM_MAX = 200, ZOOM_STEP = 20;
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
    function resetIdleTimer() {
      if (landscapeIdleTimerRef.current) clearTimeout(landscapeIdleTimerRef.current);
      landscapeIdleTimerRef.current = setTimeout(() => setMobileChromeVisible(false), LANDSCAPE_AUTOHIDE_MS);
    }
    resetIdleTimer();
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

  // RC1 P0 fix #2/#4: pulled out of handleGestureDown so the new native-
  // touch path (handleTouchStart below) can arm the exact same gesture —
  // zone detection, long-press timer, everything — from a plain {x,y}
  // instead of a React.MouseEvent, without duplicating the logic.
  function startGesture(x: number, y: number, onControl: boolean) {
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
      if (activeSelection?.type === "text") { handleSelectionAction("explain"); return; }
      if (!activeSelection) tryLongPressSelection(x, y);
    }, GESTURE_LONGPRESS_MS);
  }

  function handleGestureDown(e: React.MouseEvent) {
    // Real-device gesture safety: never arm a gesture while a locally-
    // rendered sheet (More / Contents / page strip) is open — the AI
    // sheet and Reading Options panel are both portaled outside this
    // subtree already, so they were never reachable here to begin with.
    if (mobileMoreOpen || contentsOpen || pageStripOpen) { gestureStartRef.current = null; return; }
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

  // ── RC1 P0 fixes #2/#3/#4: native touch-event gesture system ──────────
  // The mouse-based layer above (handleGestureDown/Move/Up, driven by the
  // browser's synthetic mouse-compat events from touches) is unreliable
  // for swipe/long-press on real iOS Safari, and mouse events cannot
  // represent a second finger at all, so pinch-to-zoom is impossible on
  // that path. This is a second, real listener on the same element,
  // attached with addEventListener(..., { passive: false }) via the
  // useEffect below rather than JSX onTouchStart/Move/End props — React
  // registers JSX touch handlers as passive by default, which silently
  // no-ops preventDefault() and was the actual reason swipes/long-press
  // felt unreliable on-device. A real touchstart's preventDefault() here
  // suppresses the synthetic mouse cascade on genuine touchscreens, so
  // this system and the mouse-based one above never double-fire; the
  // mouse-based path is left untouched as the fallback for non-touch
  // input (a real mouse, or this session's own testing tools).
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const touchPanRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);

  function touchDistance(a: Touch, b: Touch): number {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function handleTouchStart(e: TouchEvent) {
    if (mobileMoreOpen || contentsOpen || pageStripOpen) return;
    // Explicit text/image select mode: leave this untouched, exactly as
    // before — it's still driven by the mouse-compat path via
    // onCenterMouseDown/Move (drag-to-select), which real touches still
    // feed as long as this handler doesn't preventDefault them away.
    if (interactionMode !== "none") return;

    if (e.touches.length === 2) {
      e.preventDefault();
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
      gestureStartRef.current = null;
      touchPanRef.current = null;
      pinchRef.current = { startDist: touchDistance(e.touches[0], e.touches[1]), startZoom: zoom };
      return;
    }
    if (e.touches.length !== 1) return;
    pinchRef.current = null;

    const touch = e.touches[0];
    const onControl = isInteractiveTarget(e.target);
    if (onControl) return; // never swallow a real tap on a button/input

    if (zoom > 100) {
      e.preventDefault();
      gestureStartRef.current = null;
      if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
      touchPanRef.current = { x: touch.clientX, y: touch.clientY, px: pan.x, py: pan.y };
      return;
    }

    e.preventDefault();
    startGesture(touch.clientX, touch.clientY, onControl);
  }

  function handleTouchMove(e: TouchEvent) {
    // One finger lifted mid-pinch: hand off to one-finger panning (if
    // still zoomed) instead of just going dead until the next touchstart.
    if (pinchRef.current && e.touches.length < 2) {
      pinchRef.current = null;
      if (e.touches.length === 1 && zoom > 100) {
        const touch = e.touches[0];
        touchPanRef.current = { x: touch.clientX, y: touch.clientY, px: pan.x, py: pan.y };
      }
    }

    if (pinchRef.current && e.touches.length === 2) {
      e.preventDefault();
      const dist = touchDistance(e.touches[0], e.touches[1]);
      const ratio = dist / pinchRef.current.startDist;
      const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(pinchRef.current.startZoom * ratio)));
      setZoom(nextZoom);
      return;
    }

    if (touchPanRef.current && e.touches.length === 1) {
      e.preventDefault();
      const touch = e.touches[0];
      const start = touchPanRef.current;
      setPan({ x: start.px + (touch.clientX - start.x), y: start.py + (touch.clientY - start.y) });
      return;
    }

    const start = gestureStartRef.current;
    if (!start || longPressFiredRef.current || !longPressTimerRef.current) return;
    const touch = e.touches[0];
    if (!touch) return;
    const dx = Math.abs(touch.clientX - start.x);
    const dy = Math.abs(touch.clientY - start.y);
    if (dx > GESTURE_LONGPRESS_MAX_MOVE || dy > GESTURE_LONGPRESS_MAX_MOVE) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    if (pinchRef.current) {
      if (e.touches.length < 2) pinchRef.current = null;
      return;
    }
    if (touchPanRef.current) {
      if (e.touches.length === 0) touchPanRef.current = null;
      return;
    }

    if (longPressTimerRef.current) { clearTimeout(longPressTimerRef.current); longPressTimerRef.current = null; }
    const start = gestureStartRef.current;
    gestureStartRef.current = null;
    if (!start || start.onControl || longPressFiredRef.current || interactionMode !== "none") return;
    const touch = e.changedTouches[0];
    if (!touch) return;
    finishTapOrSwipe(start, touch.clientX, touch.clientY);
  }

  // Native listeners, not JSX onTouchStart/Move/End props — see the
  // block comment above for why. Attached via a ref-indirection wrapper
  // so the actual DOM listeners are only added/removed once (or when
  // isMobileViewport flips), not on every render — a pinch or pan
  // updates zoom/pan state on every touchmove tick, and reattaching
  // real listeners that often would risk jank during exactly the
  // "smooth animation" the pinch-zoom spec asks for. The wrapper always
  // calls through to the latest handler closures, so state is never
  // stale despite the stable listener identity.
  const touchHandlersRef = useRef({ handleTouchStart, handleTouchMove, handleTouchEnd });
  touchHandlersRef.current = { handleTouchStart, handleTouchMove, handleTouchEnd };

  useEffect(() => {
    const el = bookAreaRef.current;
    if (!el || !isMobileViewport) return;
    const onStart = (e: TouchEvent) => touchHandlersRef.current.handleTouchStart(e);
    const onMove = (e: TouchEvent) => touchHandlersRef.current.handleTouchMove(e);
    const onEnd = (e: TouchEvent) => touchHandlersRef.current.handleTouchEnd(e);
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", onEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [isMobileViewport]);

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

  // ── Speech — TWO independent players sharing the one browser
  // speechSynthesis queue: "page" reads the visible book page verbatim,
  // "aiResponse" reads the AI Companion's current output. Starting
  // either one stops the other (see stopPageSpeech/stopAiSpeech) since
  // only one can ever really be speaking at a time. ────────────────────
  const [speechState, setSpeechState] = useState<SpeechState>("idle");
  const [aiSpeechState, setAiSpeechState] = useState<SpeechState>("idle");
  // Set only when the AI response's language has no closely-matching
  // installed voice — shown next to the Read AI Response button so a
  // fallback voice/accent is never silently substituted without
  // explanation (Phase C2 fix — Hindi/Indic read-aloud).
  const [aiVoiceNotice, setAiVoiceNotice] = useState<string | null>(null);
  const pageSpeechStoppedRef = useRef(false);
  const aiSpeechStoppedRef = useRef(false);

  // ── Go To Page ────────────────────────────────────────────────────
  // Input always means the PRINTED page number — there is no PDF-page
  // mode. PDF page indexes are purely internal.
  const [goToInput, setGoToInput] = useState("");

  // ── Voice Assistant: "Open Study tab" signal — undefined until the
  //    first voice command fires, so AICompanion's effect never forces
  //    the tab on initial mount. ────────────────────────────────────
  const [openStudyTabSignal, setOpenStudyTabSignal] = useState<number | undefined>(undefined);

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
    // Only the PAGE speech player is tied to page content, so only it
    // gets stopped here — the AI response player keeps narrating across
    // a page turn since aiResponse itself doesn't change until a new AI
    // call completes. Cancelling the shared synth queue is still safe
    // even while AI speech is mid-chunk: onend simply won't fire for
    // the cancelled utterance, so speakSequence's chain stops there —
    // exactly like an explicit Stop.
    if (speechState !== "idle") {
      window.speechSynthesis?.cancel();
      pageSpeechStoppedRef.current = true;
      setSpeechState("idle");
    }
    clearActiveSelection();   // activeSelection, highlights, ask-input, floating toolbar
    resetInteractionState();  // isPanning
    dragStartRef.current = null; // drag anchor — never carry a stale one to the new page
    setLiveDragRect(null);
    window.getSelection()?.removeAllRanges(); // native browser selection
    setPan({ x: 0, y: 0 });
  }, [readerPage, bookId]); // eslint-disable-line

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
    // Unlike a plain page turn, a book change invalidates BOTH speech
    // players — the AI response about to be cleared, and whatever page
    // was playing, both belonged to the book being left.
    window.speechSynthesis?.cancel();
    pageSpeechStoppedRef.current = true;
    setSpeechState("idle");
    aiSpeechStoppedRef.current = true;
    setAiSpeechState("idle");
    setAiVoiceNotice(null);

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

  // "Read Page" — reads the VISIBLE BOOK PAGE verbatim (cleaned of OCR
  // noise/math-symbol junk via sanitizeForSpeech), never an AI-generated
  // summary and never the AI Companion's response — see "Read AI
  // Response" below for that. Starting this stops any AI-response
  // speech first, since only one can really be speaking at a time.
  function stopPageSpeech() {
    pageSpeechStoppedRef.current = true;
    setSpeechState("idle");
  }
  function stopAiSpeech() {
    aiSpeechStoppedRef.current = true;
    setAiSpeechState("idle");
  }
  function handleReadPage() {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (speechState === "speaking") { synth.pause(); setSpeechState("paused"); return; }
    if (speechState === "paused")  { synth.resume(); setSpeechState("speaking"); return; }

    stopAiSpeech();
    synth.cancel();
    setSpeechState("loading");

    // Read ONLY the extracted page text — never the book title, header,
    // printed page number, or any other UI label. If extraction genuinely
    // found nothing, say exactly this and nothing else.
    const rawText = getVisiblePageText();
    const spokenText = rawText.trim().length > 0
      ? sanitizeForSpeech(cleanOcrTextForAi(rawText))
      : t.premiumReaderNoReadableText;
    const chunks = splitIntoSpeechChunks(spokenText);
    if (chunks.length === 0) { setSpeechState("idle"); return; }

    speakSequence(chunks, null, undefined, setSpeechState, pageSpeechStoppedRef);
  }
  function handleStopReadAloud() {
    stopPageSpeech();
    window.speechSynthesis?.cancel();
  }

  // "Read AI Response" — reads ONLY the AI Companion's current output
  // (markdown stripped first), in the response's own language via the
  // existing response-language selector, with proper Hindi/Indic voice
  // selection (Phase C2 fix). Starting this stops page speech first.
  async function handleReadAiResponse() {
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (aiSpeechState === "speaking") { synth.pause(); setAiSpeechState("paused"); return; }
    if (aiSpeechState === "paused")  { synth.resume(); setAiSpeechState("speaking"); return; }
    if (!aiResponse.trim() || aiLoading) return;

    stopPageSpeech();
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

  // ── Voice Assistant integration ─────────────────────────────────────
  // VoiceAssistant (rendered inside AccessibilityToolbar below) never
  // imports anything from this file — it only ever broadcasts a
  // "ndl-voice-command" CustomEvent on window. This is the ONLY place
  // that turns that event into calls to this reader's OWN existing
  // functions (goNext, fitScreen, handleReadPage, runQuickAction, …).
  // Nothing about page rendering or the page-turn engine itself changes.
  //
  // A ref kept fresh every render (rather than depending on these
  // functions directly) means the listener below can be registered ONCE
  // on mount without ever acting on stale state — the same stale-closure
  // pitfall already fixed in AccessibilityToolbar's font-size buttons.
  const voiceStateRef = useRef({
    speechState, language,
    goNext, goPrev, goToPage, setZoom, fitScreen,
    handleReadPage, handleStopReadAloud, runQuickAction, setLanguage,
  });
  useEffect(() => {
    voiceStateRef.current = {
      speechState, language,
      goNext, goPrev, goToPage, setZoom, fitScreen,
      handleReadPage, handleStopReadAloud, runQuickAction, setLanguage,
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
          case "read": if (v.speechState === "idle") v.handleReadPage(); break;
          case "pause": if (v.speechState === "speaking") v.handleReadPage(); break;
          case "resume": if (v.speechState === "paused") v.handleReadPage(); break;
          case "stop": v.handleStopReadAloud(); break;
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

  const readLabel = speechState === "loading" ? `⏳ ${t.readerPreparing}`
    : speechState === "speaking" ? `⏸ ${t.premiumReaderPause}`
    : speechState === "paused"   ? `▶ ${t.premiumReaderResume}`
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
  // RC1 P2: bottom-nav button layout — stacked icon-over-label in
  // portrait (unchanged), icon-beside-label with tighter padding in
  // landscape so the compact bar (py-0.5 on its wrapper above) doesn't
  // clip either the icon or the label.
  const mobileNavBtnCls = isMobileLandscape ? "flex-row gap-1.5 px-1 py-1" : "flex-col gap-0.5 px-1 py-1.5";

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
          ref={bookAreaRef}
          onMouseDown={(e) => { onCenterMouseDown(e); if (isMobileViewport) handleGestureDown(e); }}
          onMouseMove={(e) => { onCenterMouseMove(e); if (isMobileViewport) handleGestureMove(e); }}
          onMouseUp={(e) => { onCenterMouseUp(); handleMouseUp(e); if (isMobileViewport) handleGestureUp(e); }}
          onWheel={onCenterWheel}
          style={{
            height: "100%", display: "flex", flexDirection: "column",
            cursor: imageSelectMode ? "crosshair"
              : textSelectMode ? "text"
              : isPanning ? "grabbing" : "grab",
            // Prevent panning from ever turning into a full browser-page
            // scroll/touch gesture — panning moves the inner book content
            // via the pan.x/y transform only, never the page itself.
            touchAction: "none",
            overscrollBehavior: "contain",
          }}
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
                  <button onClick={handleReadPage} disabled={speechState === "loading"}
                    title={t.premiumReaderReadPageTitle}
                    className={`ndl-press inline-flex ${fsBtnH} items-center gap-1.5 rounded-full bg-slate-900 px-4 ${fsBtnText} font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50`}>
                    {readLabel}
                  </button>
                  {(speechState === "speaking" || speechState === "paused") && (
                    <button onClick={handleStopReadAloud}
                      className={`ndl-press inline-flex ${fsBtnH} items-center gap-1.5 rounded-full bg-red-600 px-4 ${fsBtnText} font-bold text-white shadow hover:bg-red-700`}>⏹ {t.premiumReaderStop}</button>
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
                  <button onClick={handleReadPage} disabled={speechState === "loading"}
                    title={t.premiumReaderReadPageTitle} aria-label={t.premiumReaderReadPageTitle}
                    className="ndl-press inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm text-white shadow hover:bg-slate-800 disabled:opacity-50">
                    {speechState === "loading" ? "⏳" : speechState === "speaking" ? "⏸" : speechState === "paused" ? "▶" : "🔊"}
                  </button>
                  {(speechState === "speaking" || speechState === "paused") && (
                    <button onClick={handleStopReadAloud} title={t.premiumReaderStop} aria-label={t.premiumReaderStop}
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
              {mobileMoreOpen && (
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
                        <div className="grid grid-cols-4 gap-2">
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
              )}
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
              opacity/pointer-events are untouched (always visible). ── */}
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <button
              onClick={goPrev}
              title={t.commonPrevious}
              aria-label={t.premiumReaderPreviousPage}
              {...(isMobileViewport ? { "data-dock-avoid": true } : {})}
              className={`ndl-press absolute left-1 top-1/2 z-30 -translate-y-1/2 flex items-center justify-center rounded-full text-slate-700 hover:bg-white ${
                isMobileViewport
                  ? `h-9 w-9 bg-white/70 text-base shadow ring-1 ring-amber-100/70 ndl-chrome-fade ${mobileChromeCls}`
                  : "h-11 w-11 bg-white/90 text-lg shadow-lg ring-1 ring-amber-100"}`}
            >
              ‹
            </button>
            <button
              onClick={goNext}
              title={t.commonNext}
              aria-label={t.premiumReaderNextPage}
              {...(isMobileViewport ? { "data-dock-avoid": true } : {})}
              className={`ndl-press absolute right-1 top-1/2 z-30 -translate-y-1/2 flex items-center justify-center rounded-full text-slate-700 hover:bg-white ${
                isMobileViewport
                  ? `h-9 w-9 bg-white/70 text-base shadow ring-1 ring-amber-100/70 ndl-chrome-fade ${mobileChromeCls}`
                  : "h-11 w-11 bg-white/90 text-lg shadow-lg ring-1 ring-amber-100"}`}
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

          {/* ── Mobile-only 4-item bottom navigation — AI, Contents,
              Reading, More. Real-device fix 4 dropped "Study" from this
              row: the AI sheet's own "Ask AI / Study" tab pill is one
              tap inside the AI entry already, so a separate bottom-nav
              Study button was pure duplication. setOpenStudyTabSignal
              itself is untouched — the "studyTab" voice command still
              uses it, only this nav entry point is gone. Every
              remaining button is still just an entry point into
              something that already exists:
                AI            → toggleAiPanelCompact, same fn the old
                                floating 🤖 trigger used (retired in D1
                                since this button covers the same job).
                Contents      → setContentsOpen (same modal as before).
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
              below, byte-for-byte unchanged. ─────────────────────────── */}
          {isMobileViewport ? (
            <div
              data-dock-avoid
              className={`mx-auto mt-1 flex w-full max-w-[1340px] flex-shrink-0 items-center justify-between gap-1 rounded-2xl bg-white px-2 shadow ring-1 ring-amber-100 ndl-chrome-fade ${mobileChromeCls} ${isMobileLandscape ? "py-0.5" : "py-1.5"}`}
              style={{ marginBottom: "env(safe-area-inset-bottom)" }}
            >
              {/* RC1 P2: landscape keeps the bar itself compact (py-0.5
                  vs 1.5, icon+label side-by-side vs stacked) — same 4
                  buttons/handlers, just a shorter footprint so more of
                  the short landscape height goes to the page. Portrait
                  is untouched (mobileNavBtnCls below resolves to the
                  exact original stacked classes there). */}
              <button onClick={toggleAiPanelCompact}
                title={t.aiCompanionExpand} aria-label={t.aiCompanionExpand}
                className={`ndl-press flex flex-1 items-center justify-center rounded-xl text-[10px] font-bold text-slate-600 hover:bg-amber-50 ${mobileNavBtnCls}`}>
                <span className="text-base leading-none" aria-hidden="true">🤖</span>
                {t.premiumReaderAiTab}
              </button>
              {/* Final mobile polish point 5: "Contents" now opens the
                  real page list (pageStripOpen — the same sheet the
                  header's page badge already opens) instead of the book
                  metadata popup. No chapter/table-of-contents data
                  exists anywhere in this app for any book (checked
                  lib/printedPageMap.ts — it's a page-number map, not a
                  chapter structure), so a genuine page list is the
                  honest "contents" here rather than inventing chapter
                  names. The metadata dialog this used to open moved to
                  More → Book Information instead of being removed. */}
              <button onClick={() => setPageStripOpen(true)}
                title={t.premiumReaderContents} aria-label={t.premiumReaderContents}
                className={`ndl-press flex flex-1 items-center justify-center rounded-xl text-[10px] font-bold text-slate-600 hover:bg-amber-50 ${mobileNavBtnCls}`}>
                <span className="text-base leading-none" aria-hidden="true">📚</span>
                {t.premiumReaderContents}
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
    </>
  );
}
