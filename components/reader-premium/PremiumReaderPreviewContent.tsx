"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
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
import { cleanOcrTextForAi, sanitizeForSpeech, resolvePageText } from "@/lib/premium-reader/pageTextExtractor";
import { chunkBookText, buildChapterWindowText, dedupeChapterText, mapWithConcurrency, withTimeout } from "@/lib/premium-reader/aiContext";
import { getUploadedPdf } from "@/lib/uploadedPdfStore";
import { getSpeechLanguage } from "@/lib/premium-reader/aiActions";
import { loadVoices, pickVoiceForLanguage, stripMarkdownForSpeech, splitIntoSpeechChunks } from "@/lib/premium-reader/speech";
import { useEnabledLanguages, LANGUAGE_NAME_TO_CODE } from "@/lib/languageSettings";
import { UI_TEXT, type Language } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

const PdfBookSpread = dynamic(
  () => import("@/components/reader-premium/PdfBookSpread"),
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
  const uploadedPdfName = isHydrated ? window.sessionStorage.getItem("ndl_uploaded_pdf_name") : null;
  const uploadedPdfPages = isHydrated ? window.sessionStorage.getItem("ndl_uploaded_pdf_pages") : null;
  const uploadedPdfId = isHydrated ? window.sessionStorage.getItem("ndl_uploaded_pdf_id") : null;

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
        title: uploadedPdfName || t.premiumReaderUploadedDocumentFallback,
        author: "",
        description: "",
        language: "",
        cover: "",
        // The SAME string PdfBookSpread already passes straight into
        // pdfjsLib.getDocument(pdfPath) for every catalog book — a
        // data: URL is fetchable the same way a /director-books/*.pdf
        // path is, so PdfBookSpread needed zero changes for this to work.
        pdf: uploadedPdfData as string,
        pages: Number(uploadedPdfPages) || 1,
        layout: "single" as const,
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
    const clamped = Math.min(Math.max(1, Math.floor(urlPage)), totalPages || urlPage);
    return isSpreadBook && clamped > 1 ? (clamped % 2 === 0 ? clamped : clamped - 1) : clamped;
  });
  const [bookOpened, setBookOpened] = useState(() => {
    const urlPage = Number(searchParams.get("page"));
    return Number.isFinite(urlPage) && urlPage >= 1;
  });
  const [bookOpening, setBookOpening] = useState(false);

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
  // Tracks viewport width for responsive behavior only (never touches
  // reader/PDF logic) — tablet gets a narrower/compact AI panel by
  // default, mobile additionally renders it as a full-height overlay
  // instead of a permanent column so the book keeps the full width.
  const [viewportWidth, setViewportWidth] = useState(1280);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(AI_PANEL_COMPACT_KEY);
      if (stored !== null) setAiPanelCompact(stored === "true");
      else setAiPanelCompact(window.innerWidth < 1024); // tablet/mobile default
    } catch { /* ignore */ }
    function onFsChange() { setIsFullscreenLayout(!!document.fullscreenElement); }
    document.addEventListener("fullscreenchange", onFsChange);
    setViewportWidth(window.innerWidth);
    function onResize() { setViewportWidth(window.innerWidth); }
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  const isMobileViewport = viewportWidth < 640;

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
  const pdfDocCacheRef = useRef<Record<string, Promise<any>>>({});
  function getSharedPdfDocument(): Promise<any> {
    const existing = pdfDocCacheRef.current[bookId];
    if (existing) return existing;
    const promise = (async () => {
      const pdfjsLib = await import("pdfjs-dist");
      pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjsLib.getDocument(currentBook.pdf).promise;
    })();
    pdfDocCacheRef.current[bookId] = promise;
    return promise;
  }

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
      const clamped = Math.min(Math.max(1, Math.floor(urlPage)), totalPages || urlPage);
      resolvedPage = isSpreadBook && clamped > 1 ? (clamped % 2 === 0 ? clamped : clamped - 1) : clamped;
      setReaderPage(resolvedPage);
      setBookOpened(true);
    } else {
      setReaderPage(1);
      setBookOpened(false);
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

    const visibleText = getVisiblePageText();
    const content = visibleText.length > 50
      ? `Content from ${pageDescription(readerPage)} of "${book}":\n\n${cleanOcrTextForAi(visibleText)}`
      : `Viewing ${pageDescription(readerPage)} of "${book}".`;
    logScopeDebug({
      scope: "page",
      source: visibleText.length > 50 ? "visible page cache" : "no cached text yet",
      pages: isSpreadBook && readerPage > 1 ? 2 : 1,
      chars: content.length,
    });
    return runAI(prompt, content, undefined, undefined, action, "current page/spread", useHistory, onSuccess);
  }

  // ── Navigation ──────────────────────────────────────────────────────
  // Page-state updates immediately on click — no artificial delay before
  // the page number itself changes. PdfBookSpread derives its own
  // enter-transition direction from the raw page-number delta, so there
  // is nothing left for this component to orchestrate around a flip.
  function goNext() {
    autoFitDone.current = false;
    if (isSpreadBook) {
      if (readerPage === 1) { setReaderPage(2); return; }
      const next = readerPage + 2;
      if (next <= totalPages) setReaderPage(next);
    } else {
      setReaderPage(p => Math.min(totalPages, p + 1));
    }
  }
  function goPrev() {
    autoFitDone.current = false;
    if (isSpreadBook) {
      if (readerPage <= 2) { setReaderPage(1); return; }
      setReaderPage(p => Math.max(1, p - 2));
    } else {
      setReaderPage(p => Math.max(1, p - 1));
    }
  }
  function fitScreen() { setZoom(100); setPan({ x: 0, y: 0 }); autoFitDone.current = false; }

  // Navigates directly by the internal PDF page index — no printed-page
  // resolution involved. Used once a target pdfPage is already known
  // (Go to Page after it resolves, Study Workspace jump-to-highlight,
  // which already stores the stable pdfPage key).
  function navigateToPdfPage(target: number) {
    autoFitDone.current = false;
    const pdfPage = Math.min(Math.max(1, target), totalPages);
    if (isSpreadBook && pdfPage > 1) setReaderPage(pdfPage % 2 === 0 ? pdfPage : pdfPage - 1);
    else setReaderPage(pdfPage);
  }

  // "Go to page" always means the printed page number — there is no PDF-
  // page mode. Resolved entirely synchronously against the book's static
  // map (lib/printedPageMap.ts) — no OCR, no background indexing, nothing
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

    const pdfPage = resolvePrintedPageTarget(n, printedPageMap);
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
    const fallback = getVisiblePageText().length > 50
      ? `Content from ${pageDescription(readerPage)} of "${book}":\n\n${cleanOcrTextForAi(getVisiblePageText())}`
      : `Viewing ${pageDescription(readerPage)} of "${book}".`;
    return executeAiCall({
      prompt, content: content ?? fallback, imageDataUrl,
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
  // In double-page/spread layout (e.g. Quantum Computing), `readerPage`
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

  return (
    <>
    <PremiumReaderLayout
      ref={layoutRef}
      aiPanelWidthPx={aiPanelWidthPx}
      aiPanelOverlay={aiPanelOverlay}
      center={
        <div
          ref={bookAreaRef}
          onMouseDown={onCenterMouseDown}
          onMouseMove={onCenterMouseMove}
          onMouseUp={(e) => { onCenterMouseUp(); handleMouseUp(e); }}
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
          {/* ── Top row: Back / title / printed-page badge. Same component
              in both modes — fullscreen only compacts sizing/spacing via
              the fs* tokens above, nothing is removed or hidden. ──────── */}
          <div className={`mx-auto ${fsBarGapY} flex w-full max-w-[1340px] flex-shrink-0 items-center justify-between gap-3 px-1`}>
              <div className="flex min-w-0 items-center gap-3">
                <Link href="/library"
                  className={`ndl-press inline-flex ${fsBtnH} items-center gap-1 rounded-full bg-white px-3 ${fsBtnText} font-bold text-slate-700 shadow ring-1 ring-slate-200 hover:bg-amber-50`}>
                  ← {t.commonBack}
                </Link>
                <h1 className={`truncate font-black text-slate-900 ${isFullscreenLayout ? "text-sm" : "text-base"}`}>{book}</h1>
              </div>
              {displayLabel && (
                <span className={`flex-shrink-0 rounded-full bg-white px-3 ${isFullscreenLayout ? "py-1" : "py-1.5"} ${fsBtnText} font-bold text-slate-600 shadow ring-1 ring-amber-100`}>
                  {displayLabel}
                </span>
              )}
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
              goPrev/goNext handlers, nothing about page logic changed. ── */}
          <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
            <button
              onClick={goPrev}
              title={t.commonPrevious}
              aria-label={t.premiumReaderPreviousPage}
              className="ndl-press absolute left-1 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg text-slate-700 shadow-lg ring-1 ring-amber-100 hover:bg-white"
            >
              ‹
            </button>
            <button
              onClick={goNext}
              title={t.commonNext}
              aria-label={t.premiumReaderNextPage}
              className="ndl-press absolute right-1 top-1/2 z-30 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-lg text-slate-700 shadow-lg ring-1 ring-amber-100 hover:bg-white"
            >
              ›
            </button>
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
          </div>

          {/* ── Mobile: floating trigger to reopen the AI Companion
              overlay (no permanent column on a phone-sized screen). ──── */}
          {isMobileViewport && aiPanelCompact && !isFullscreenLayout && (
            <button
              onClick={toggleAiPanelCompact}
              className="ndl-press fixed bottom-20 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-orange-600 text-xl text-white shadow-lg hover:bg-orange-700"
              title={t.aiCompanionExpand}
              aria-label={t.aiCompanionExpand}
            >
              🤖
            </button>
          )}

          {/* ── Bottom reading bar — Contents, printed page number,
              progress slider, fullscreen toggle. Zoom lives ONLY in the
              controls strip above now (Phase D Task 1 removed the
              duplicate zoom cluster that used to live here too — same
              `zoom` state, same setZoom calls, just one home instead of
              two). Same bar in fullscreen — only its own margin/padding
              compacts via the fs* tokens (Phase D Task 4), nothing is
              removed. ─────────────────────────────────────────────── */}
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
        />
      }
    />
    <AccessibilityToolbar />
    </>
  );
}
